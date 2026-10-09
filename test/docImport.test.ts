import { assert } from "chai";
import { config } from "../package.json";
import { findOrganizerWindow, waitFor } from "./helpers";
import {
  DE_BODY,
  DE_STYLES,
  EN_BODY,
  EN_STYLES,
  files,
  makeDocx,
  makeOdt,
  makeZip,
  ODT_CONTENT,
  para,
  run,
} from "./docFixtures";

/**
 * Import der Gliederung aus .docx/.odt im echten Zotero. Die Dateien sind
 * echte ZIP-Archive (nsIZipWriter) im Temp-Ordner; Dateiauswahl und
 * Vorschaudialog werden umgangen (importFromFile mit confirm).
 */

const api = () => (Zotero as any)[config.addonInstance].api;

describe("docImport", function () {
  this.timeout(60000);
  const states: any[] = [];
  const messages: string[] = [];
  let oldAlert: any;

  /** Leerer Zustand wie im Organizer (nur die benutzten Felder). */
  const fresh = (roots: any[] = []) => {
    const s = {
      libraryID: Zotero.Libraries.userLibraryID,
      noteID: null as number | null,
      roots,
      saveChain: Promise.resolve(),
      saveLog: [] as string[],
    };
    states.push(s);
    return { s, render() {} };
  };

  /** Baum als verschachtelte [Titel, Kinder]-Liste. */
  const shape = (ns: any[]): unknown =>
    ns.map((n) => [n.title, shape(n.children)]);

  const imp = (ctx: any, file: any, strip = true) =>
    api().docImport.importFromFile(ctx, file, {
      confirm: () => true,
      stripNumbering: strip,
    });

  before(function () {
    oldAlert = api().docImport.alert;
    api().docImport.alert = (_w: unknown, text: string) => messages.push(text);
  });

  beforeEach(function () {
    messages.length = 0;
  });

  after(async function () {
    api().docImport.alert = oldAlert;
    for (const s of states) {
      await s.saveChain;
      if (s.noteID) {
        try {
          await (Zotero.Items.get(s.noteID) as Zotero.Item).eraseTx();
        } catch {
          // already gone
        }
      }
    }
    for (const f of files) await IOUtils.remove(f, { ignoreAbsent: true });
  });

  it("imports German heading styles with levels, without numbering", async function () {
    const ctx = fresh();
    const file = makeDocx("de.docx", DE_BODY, DE_STYLES);
    const r = await imp(ctx, file);
    assert.equal(r.status, "imported");
    assert.equal(r.plan.created, 5);
    assert.deepEqual(shape(ctx.s.roots), [
      ["Einleitung", [["Hintergrund", [["Stand", []]]]]],
      ["Hauptteil", [["Begriff", []]]],
    ]);
    // persisted in the outline note
    await ctx.s.saveChain;
    const loaded = await api().outlineModel.OutlineModel.load(ctx.s.libraryID);
    assert.equal(loaded.noteID, ctx.s.noteID);
    assert.deepEqual(shape(loaded.roots), shape(ctx.s.roots));
  });

  it("keeps the numbering when asked to", async function () {
    const ctx = fresh();
    await imp(ctx, makeDocx("de2.docx", DE_BODY, DE_STYLES), false);
    assert.equal(ctx.s.roots[0].title, "1. Einleitung");
    assert.equal(ctx.s.roots[1].children[0].title, "2.1 Begriff");
  });

  it("does not duplicate anything on a second import of the same file", async function () {
    const ctx = fresh();
    const file = makeDocx("de3.docx", DE_BODY, DE_STYLES);
    await imp(ctx, file);
    const before = JSON.stringify(ctx.s.roots);
    const r = await imp(ctx, file);
    assert.equal(r.status, "imported");
    assert.equal(r.plan.created, 0);
    assert.equal(r.plan.reused, 5);
    assert.equal(JSON.stringify(ctx.s.roots), before);
  });

  it("appends English styles and an ODT to an existing outline", async function () {
    const core = api().outline;
    const keep = core.makeNode("Vorhanden");
    const ctx = fresh([keep]);
    await imp(ctx, makeDocx("en.docx", EN_BODY, EN_STYLES));
    await imp(ctx, makeOdt("a.odt", ODT_CONTENT));
    assert.deepEqual(shape(ctx.s.roots), [
      ["Vorhanden", []],
      ["Introduction", [["Background", []]]],
      ["Method", []],
      ["Zusammenfassung", [["Ergebnisse", []]]],
      ["Ausblick", []],
    ]);
    assert.equal(ctx.s.roots[0].id, keep.id);
  });

  it("renames a duplicate title under another parent", async function () {
    const core = api().outline;
    const existing = core.makeNode("Hauptteil");
    const ctx = fresh([existing]);
    existing.children.push(core.makeNode("Begriff"));
    const file = makeDocx(
      "dup.docx",
      para("Heading1", run("Begriff")),
      EN_STYLES,
    );
    const r = await imp(ctx, file);
    assert.equal(r.plan.renamed, 1);
    assert.equal(ctx.s.roots[1].title, "Begriff (2)");
  });

  it("reports a document without heading styles and changes nothing", async function () {
    const ctx = fresh();
    const r = await imp(
      ctx,
      makeDocx("none.docx", para("Standard", run("nur Text")), DE_STYLES),
    );
    assert.equal(r.status, "empty");
    assert.match(messages[0], /Keine Überschriften-Formatvorlagen|No heading/);
    assert.lengthOf(ctx.s.roots, 0);
    assert.isNull(ctx.s.noteID);
  });

  it("reports a broken archive without changing the outline", async function () {
    const ctx = fresh();
    const path = PathUtils.join(PathUtils.tempDir, "flexannotate-broken.docx");
    files.push(path);
    await IOUtils.writeUTF8(path, "das ist kein zip");
    const r = await imp(ctx, Zotero.File.pathToFile(path));
    assert.equal(r.status, "error");
    assert.include(messages[0], "flexannotate-broken.docx");
    // a ZIP without any document part
    const r2 = await imp(ctx, makeZip("other.docx", { "a.txt": "x" }));
    assert.equal(r2.status, "error");
    assert.lengthOf(ctx.s.roots, 0);
    assert.isNull(ctx.s.noteID);
  });

  it("changes nothing when the preview is cancelled", async function () {
    const ctx = fresh();
    const r = await api().docImport.importFromFile(
      ctx,
      makeDocx("cancel.docx", DE_BODY, DE_STYLES),
      { confirm: () => false },
    );
    assert.equal(r.status, "cancelled");
    assert.lengthOf(ctx.s.roots, 0);
  });

  it("shows the preview in the organizer window and imports on click", async function () {
    await api().OrganizerFactory.open();
    const win = await waitFor(findOrganizerWindow);
    try {
      const doc = win.document;
      await waitFor(() => doc.getElementById("flexannotate-scope"));
      const state = api().OrganizerFactory.lastState;
      // own outline note: leave notes of other suites alone
      state.roots = [];
      state.noteID = null;
      states.push(state);
      const ctx = {
        s: state,
        doc,
        root: doc.getElementById("flexannotate-root"),
        render() {},
      };
      const file = makeDocx("preview.docx", DE_BODY, DE_STYLES);
      const done = api().docImport.importFromFile(ctx, file, {});
      const overlay = await waitFor(() =>
        doc.querySelector("[data-import-preview]"),
      );
      const text = overlay.textContent as string;
      assert.include(text, "preview");
      assert.match(text, /5 (Überschriften gefunden|headings found)/);
      assert.match(text, /5 (neu|new), 0 /);
      const boxes = overlay.querySelectorAll("input[type=checkbox]");
      assert.lengthOf(boxes, 1); // numbering detected
      assert.include(text, "Einleitung");
      assert.notInclude(text, "1. Einleitung");
      (boxes[0] as HTMLInputElement).click(); // numbering stays
      assert.include(overlay.textContent as string, "1. Einleitung");
      const btns = Array.from(overlay.querySelectorAll("button"));
      assert.lengthOf(btns, 2);
      btns[1].click();
      const r = await done;
      assert.equal(r.status, "imported");
      assert.isNull(doc.querySelector("[data-import-preview]"));
      assert.equal(state.roots.at(-2).title, "1. Einleitung");
    } finally {
      win.close();
    }
  });
});
