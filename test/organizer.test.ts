import { assert } from "chai";
import { config } from "../package.json";
import {
  created,
  findOrganizerWindow,
  findWindowByUrl,
  makeAnnotation,
  makePdfAttachment,
  makeWork,
  screenshot,
  waitFor,
} from "./helpers";

/**
 * Integration tests inside a real Zotero (scaffold test profile with its own
 * dataDir). All data is synthetic and removed again in `after`.
 */

describe("FlexAnnotate", function () {
  describe("organizer data and filing", function () {
    this.timeout(60000);
    let work: Zotero.Item;
    const annotations: Zotero.Item[] = [];
    let libraryID: number;

    before(async function () {
      libraryID = Zotero.Libraries.userLibraryID;
      work = await makeWork("FlexAnnotate Testwerk");
      const att = await makePdfAttachment(work);
      for (let i = 0; i < 3; i++) {
        annotations.push(
          await makeAnnotation(att, `Zitat Nummer ${i}`, `${i + 10}`, i),
        );
      }
    });

    after(async function () {
      for (const item of created.reverse()) {
        try {
          await item.eraseTx();
        } catch {
          // already removed with its parent
        }
      }
    });

    it("lists the annotations as rows with page and work", async function () {
      const { loadAnnotationRows } =
        Zotero[config.addonInstance].api.organizerData;
      const rows = await loadAnnotationRows(libraryID);
      const mine = rows.filter((r: any) => r.workID === work.id);
      assert.lengthOf(mine, 3);
      assert.equal(mine[0].kind, "annotation");
      assert.include(
        mine.map((r: any) => r.pageLabel),
        "10",
      );
      assert.match(mine[0].byline, /Muster/);
    });

    it("files several annotations under one heading in one go", async function () {
      const api = Zotero[config.addonInstance].api.organizerData;
      const ids = annotations.map((a) => a.id);
      const changed = await api.fileMany(ids, "§Teststelle");
      assert.sameMembers(changed, ids);
      for (const a of annotations) {
        assert.isTrue(a.getTags().some((t) => t.tag === "§Teststelle"));
      }
      // idempotent: second run changes nothing
      assert.lengthOf(await api.fileMany(ids, "§Teststelle"), 0);
      const removed = await api.unfileMany([ids[0]], "§Teststelle");
      assert.deepEqual(removed, [ids[0]]);
    });

    it("also files whole works (Titel tab)", async function () {
      const api = Zotero[config.addonInstance].api.organizerData;
      const rows = await api.loadWorkRows(libraryID);
      const row = rows.find((r: any) => r.id === work.id);
      assert.ok(row);
      assert.equal(row.kind, "work");
      await api.fileMany([work.id], "§Teststelle");
      assert.isTrue(work.getTags().some((t) => t.tag === "§Teststelle"));
    });

    it("round-trips the outline note", async function () {
      const model = Zotero[config.addonInstance].api.outlineModel;
      const core = Zotero[config.addonInstance].api.outline;
      const roots = [core.makeNode("Einleitung"), core.makeNode("Hauptteil")];
      roots[1].children.push(core.makeNode("Begriff"));
      const noteID = await model.OutlineModel.save(libraryID, null, roots);
      const loaded = await model.OutlineModel.load(libraryID);
      assert.equal(loaded.noteID, noteID);
      assert.equal(loaded.roots[1].children[0].title, "Begriff");
      const note = Zotero.Items.get(noteID) as Zotero.Item;
      await note.eraseTx();
    });
  });

  describe("organizer window", function () {
    this.timeout(90000);
    const mine: Zotero.Item[] = [];
    let noteID: number;
    let win: Window | null = null;

    before(async function () {
      const libraryID = Zotero.Libraries.userLibraryID;
      const work = await makeWork("Fenster Testwerk");
      mine.push(work);
      const att = await makePdfAttachment(work);
      for (let i = 0; i < 3; i++) {
        mine.push(await makeAnnotation(att, `Fensterzitat ${i}`, `${i}`, i));
      }
      const core = Zotero[config.addonInstance].api.outline;
      const roots = [core.makeNode("Einleitung"), core.makeNode("Hauptteil")];
      noteID = await Zotero[
        config.addonInstance
      ].api.outlineModel.OutlineModel.save(libraryID, null, roots);
    });

    after(async function () {
      win?.close();
      await (Zotero.Items.get(noteID) as Zotero.Item).eraseTx();
      for (const item of created.reverse()) {
        try {
          await item.eraseTx();
        } catch {
          // gone with its parent
        }
      }
    });

    it("opens with three columns and a search bar outside the scroll area", async function () {
      await Zotero[config.addonInstance].api.OrganizerFactory.open();
      win = await waitFor(findOrganizerWindow);
      const doc = win.document;
      const rows = await waitFor(() => {
        const r = doc.querySelectorAll("[data-row-id]");
        return r.length >= 3 ? r : null;
      });
      assert.isAtLeast(rows.length, 3);
      await screenshot(win, "organizer-wissen");
      const grid = Array.from(doc.querySelectorAll("div")).find(
        (d) => (d as HTMLElement).style.gridTemplateColumns,
      ) as HTMLElement;
      assert.lengthOf(grid.children, 3);
      // the search input must not live inside a scrolling container
      const search = Array.from(doc.querySelectorAll("input")).find(
        (i) => (i as HTMLInputElement).placeholder.length > 0,
      ) as HTMLElement;
      for (let p = search.parentElement; p && p !== grid; p = p.parentElement) {
        assert.notEqual((p as HTMLElement).style.overflowY, "auto");
      }
    });

    it("multi-selects with shift and files all rows by drag and drop", async function () {
      const doc = win!.document;
      const ids = mine.slice(1).map((a) => a.id);
      const rowEl = (id: number) =>
        doc.querySelector(`[data-row-id="${id}"]`) as HTMLElement;
      rowEl(ids[0]).dispatchEvent(
        new win!.MouseEvent("click", { bubbles: true }),
      );
      await Zotero.Promise.delay(100);
      // re-query after the re-render
      rowEl(ids[2]).dispatchEvent(
        new win!.MouseEvent("click", { bubbles: true, shiftKey: true }),
      );
      await Zotero.Promise.delay(100);
      assert.include(doc.body.textContent, "3");
      const target = (await waitFor(() =>
        Array.from(doc.querySelectorAll("[data-node-id]")).find((n) =>
          n.textContent?.includes("Einleitung"),
        ),
      )) as HTMLElement;
      const dt = new (win as any).DataTransfer();
      dt.setData("text/x-flexannotate-ids", JSON.stringify(ids));
      target.dispatchEvent(
        new (win as any).DragEvent("drop", { bubbles: true, dataTransfer: dt }),
      );
      await waitFor(() =>
        mine
          .slice(1)
          .every((a) => a.getTags().some((t) => t.tag === "§Einleitung")),
      );
      await Zotero.Promise.delay(300);
      await screenshot(win!, "organizer-after-drop");
    });

    it("Titel tab lists works and files a work under a heading", async function () {
      const doc = win!.document;
      const tab = Array.from(doc.querySelectorAll("div")).find(
        (d) => d.textContent === "Titel" && d.children.length === 0,
      ) as HTMLElement;
      tab.click();
      const workRow = (await waitFor(() =>
        Array.from(doc.querySelectorAll("[data-row-id]")).find((r) =>
          r.textContent?.includes("Fenster Testwerk"),
        ),
      )) as HTMLElement;
      workRow.dispatchEvent(new win!.MouseEvent("click", { bubbles: true }));
      await Zotero.Promise.delay(150);
      const pick = Array.from(doc.querySelectorAll("input")).find((i) =>
        (i as HTMLInputElement).placeholder.includes("Zuweisen"),
      ) as HTMLInputElement;
      pick.value = "Haupt";
      pick.dispatchEvent(new win!.Event("input", { bubbles: true }));
      pick.dispatchEvent(
        new win!.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      const work = mine[0];
      await waitFor(() => work.getTags().some((t) => t.tag === "§Hauptteil"));
      await Zotero.Promise.delay(300);
      await screenshot(win!, "organizer-titel");
    });
  });
});
