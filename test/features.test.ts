import { assert } from "chai";
import { config } from "../package.json";
import {
  cleanup,
  click,
  findOrganizerWindow,
  findWindowByUrl,
  hasAnnotationDialog,
  key,
  makeAnnotation,
  makePdfAttachment,
  makeWork,
  waitFor,
  waitForAsync,
} from "./helpers";
import { screenshot } from "./screenshot";

/**
 * Feature tests in a real Zotero: opening the citation place, renaming,
 * keyboard, collection scope, editing, export, and the Word dialog view.
 */

const api = () => (Zotero as any)[config.addonInstance].api;
const DIALOG_URL = "chrome://zotero/content/integration/citationDialog.xhtml";

const prefs = `${config.prefsPrefix}`;

describe("FlexAnnotate features", function () {
  this.timeout(60000);
  const libraryID = () => Zotero.Libraries.userLibraryID;

  // ── open the citation place ───────────────────────────────────────────────
  describe("opening a citation", function () {
    let att: Zotero.Item;
    let ann: Zotero.Item;

    before(async function () {
      const work = await makeWork("Oeffnen Testwerk");
      att = await makePdfAttachment(work);
      ann = await makeAnnotation(att, "Oeffnen Zitat", "7", 0);
    });

    after(cleanup);

    it("asks the reader for the exact annotation", async function () {
      const rows = await api().organizerData.loadAnnotationRows(libraryID());
      const row = rows.find((r: any) => r.id === ann.id);
      const calls: any[][] = [];
      const reader = Zotero.Reader as any;
      const original = reader.open;
      reader.open = async (...args: any[]) => {
        calls.push(args);
      };
      try {
        await api().openTarget.openRow(row);
      } finally {
        reader.open = original;
      }
      assert.lengthOf(calls, 1);
      assert.equal(calls[0][0], att.id, "opens the attachment");
      assert.deepEqual(calls[0][1], { annotationID: ann.key });
    });
  });

  // ── organizer window ──────────────────────────────────────────────────────
  describe("organizer window", function () {
    let win: Window;
    let doc: Document;
    let noteID: number;
    let work1: Zotero.Item;
    let work2: Zotero.Item;
    const anns: Zotero.Item[] = [];
    const cols: Zotero.Collection[] = [];

    const rowCount = () => doc.querySelectorAll("[data-row-id]").length;
    const nodeEl = (title: string) =>
      Array.from(doc.querySelectorAll("[data-node-id]")).find((n) =>
        n.textContent?.includes(title),
      ) as HTMLElement | undefined;
    const mousedown = (el: Element) =>
      el.dispatchEvent(
        new (doc.defaultView as any).MouseEvent("mousedown", { bubbles: true }),
      );
    /** Select the "(Alle)" pseudo node so the list shows every entry again. */
    const showAll = async () => {
      const el = Array.from(doc.querySelectorAll("div")).find(
        (d) =>
          /^[(](Alle|All)[)]/.test(d.textContent || "") &&
          d.children.length === 2,
      );
      if (!el)
        throw new Error("no all node: " + doc.body.textContent?.slice(0, 400));
      click(el);
      await waitFor(() => api().OrganizerFactory.lastState?.node === "all");
    };
    const focused = async (input: HTMLElement) =>
      waitFor(() => doc.activeElement === input);
    // Prefer the note the organizer is bound to; findNote is the fallback.
    // Wait for queued saves first: the note only holds what has been written.
    const outline = async () => {
      const st = api().OrganizerFactory.lastState;
      await st?.saveChain;
      const noteID = st?.noteID;
      const note = noteID ? (Zotero.Items.get(noteID) as Zotero.Item) : null;
      if (note?.isNote?.()) return api().outline.parseOutline(note.getNote());
      return (await api().outlineModel.OutlineModel.load(libraryID())).roots;
    };
    /** Every outline note in the library, for failure messages. */
    const outlineNotes = async () => {
      const s = new Zotero.Search();
      (s as any).libraryID = libraryID();
      s.addCondition("tag", "is", "★outline");
      const items = await Zotero.Items.getAsync(await s.search());
      return items.map((i: Zotero.Item) => ({
        id: i.id,
        dateModified: i.dateModified,
        titles: api()
          .outline.parseOutline(i.getNote())
          .map((r: any) => r.title),
      }));
    };
    const diag = async (what: string) =>
      `${what}: lastState.noteID=${api().OrganizerFactory.lastState?.noteID} ` +
      `dbNote=${JSON.stringify(
        api()
          .outline.parseOutline(
            (await Zotero.DB.valueQueryAsync(
              "SELECT note FROM itemNotes WHERE itemID=?",
              [api().OrganizerFactory.lastState?.noteID],
            )) || "",
          )
          .map((r: any) => r.title),
      )} ` +
      `saveLog=${JSON.stringify(api().OrganizerFactory.lastState?.saveLog)} ` +
      `outlineNotes=${JSON.stringify(await outlineNotes())}`;
    const buttonWith = (re: RegExp) =>
      Array.from(doc.querySelectorAll("button")).find(
        (b) => re.test(b.textContent || "") || re.test(b.title || ""),
      ) as HTMLElement | undefined;

    before(async function () {
      work1 = await makeWork("Feature Werk Eins");
      work2 = await makeWork("Feature Werk Zwei");
      const att1 = await makePdfAttachment(work1);
      const att2 = await makePdfAttachment(work2);
      anns.push(await makeAnnotation(att1, "Eins A", "1", 0));
      anns.push(await makeAnnotation(att1, "Eins B", "2", 1));
      anns.push(await makeAnnotation(att2, "Zwei A", "3", 0));
      const core = api().outline;
      const roots = [core.makeNode("Alpha"), core.makeNode("Beta")];
      roots[1].children.push(core.makeNode("Gamma"));
      noteID = await api().outlineModel.OutlineModel.save(
        libraryID(),
        null,
        roots,
      );
      // collections: Root > Sub, work1 in Sub
      const root = new Zotero.Collection({
        name: "ScopeRoot",
        libraryID: libraryID(),
      } as any);
      await root.saveTx();
      const sub = new Zotero.Collection({
        name: "ScopeSub",
        libraryID: libraryID(),
        parentID: root.id,
      } as any);
      await sub.saveTx();
      cols.push(sub, root);
      work1.addToCollection(sub.id);
      await work1.saveTx();

      // Der Start mit einer Sammlung fragt einmal nach dem Bibliotheksbaum.
      const factory = api().OrganizerFactory;
      const originalConfirm = factory.confirm;
      factory.confirm = () => true;
      try {
        await factory.open();
        win = await waitFor(findOrganizerWindow);
        doc = win.document;
        await waitFor(() => factory.lastState?.collectionKey);
      } finally {
        factory.confirm = originalConfirm;
      }
      // Zotero selects a new collection in its main window, so the organizer
      // starts with that collection (the default scope) and its sub: 2 rows.
      await waitFor(() => rowCount() === 2);
      const scopeSel = doc.getElementById(
        "flexannotate-scope",
      ) as HTMLSelectElement;
      const pane = (Zotero.getMainWindow() as any).ZoteroPane;
      const selected =
        pane.getSelectedCollections?.()[0] ?? pane.getSelectedCollection();
      assert.equal(
        scopeSel.dataset.value,
        String(selected.id),
        "default scope is the collection selected in Zotero",
      );
    });

    after(async function () {
      win?.close();
      (Zotero.Items.get(noteID) as Zotero.Item)?.eraseTx?.();
      // Outline-Notizen, die der Scope-Test pro Sammlung angelegt hat, wegputzen
      const s = new Zotero.Search();
      (s as any).libraryID = libraryID();
      s.addCondition("tag", "contains", "#flexannotate-outline-");
      const tagged = await Zotero.Items.getAsync(await s.search());
      for (const n of tagged) await (n as Zotero.Item).eraseTx?.();
      for (const c of cols) await c.eraseTx();
      await cleanup();
    });

    it("renames a heading on double click and restores it on blur", async function () {
      click(nodeEl("Alpha")!);
      await waitFor(() => nodeEl("Alpha"));
      click(nodeEl("Alpha")!); // second click within the double-click time
      const input = (await waitFor(() =>
        doc.querySelector("[data-node-id] input"),
      )) as HTMLInputElement;
      assert.equal(input.value, "Alpha");
      // leave without changes: the row returns to normal, nothing is stuck
      mousedown(nodeEl("Beta")!);
      await waitFor(() => !doc.querySelector("[data-node-id] input"));
      assert.ok(nodeEl("Alpha"), "row is back");
      // elsewhere clicks still work after a blur
      click(nodeEl("Beta")!);
      await waitFor(() => !doc.querySelector("[data-node-id] input"));
    });

    it("saves a changed title when the field loses focus", async function () {
      click(nodeEl("Gamma")!);
      await waitFor(() => nodeEl("Gamma"));
      click(nodeEl("Gamma")!);
      const input = (await waitFor(() =>
        doc.querySelector("[data-node-id] input"),
      )) as HTMLInputElement;
      input.value = "Gamma neu";
      mousedown(nodeEl("Alpha")!);
      try {
        await waitForAsync(async () =>
          (await outline())[1]?.children[0]?.title === "Gamma neu"
            ? true
            : null,
        );
      } catch (e) {
        const st = api().OrganizerFactory.lastState;
        throw new Error(
          `rename not saved: mem=${JSON.stringify(st.roots)} saved=${JSON.stringify(await outline())} renaming=${st.renaming} ` +
            (await diag("rename")),
          { cause: e },
        );
      }
      await waitFor(() => nodeEl("Gamma neu"));
    });

    it("works with the keyboard: select all, move, delete", async function () {
      // Strg+A selects every row of the list
      key(doc, "a", { ctrlKey: true });
      await waitFor(() => doc.body.textContent?.includes(`${rowCount()} `));
      assert.match(
        doc.body.textContent || "",
        new RegExp(`${rowCount()} (markiert|selected)`),
      );

      // tree: Strg+Pfeil hoch verschiebt die Überschrift
      mousedown(nodeEl("Beta")!);
      click(nodeEl("Beta")!);
      await waitFor(() => nodeEl("Beta"));
      key(doc, "ArrowUp", { ctrlKey: true });
      try {
        await waitForAsync(async () =>
          (await outline())[0]?.title === "Beta" ? true : null,
        );
      } catch (e) {
        const st = api().OrganizerFactory.lastState;
        // Is the save chain still busy (lag) or did it finish with stale data?
        const chain = await Promise.race([
          st.saveChain.then(() => "settled"),
          Zotero.Promise.delay(200).then(() => "pending"),
        ]);
        throw new Error(
          `move failed: node=${st.node} col=${st.focusCol} renaming=${st.renaming} chain=${chain} roots=${st.roots.map((r: any) => r.title)} saved=${(await outline()).map((r: any) => r.title)} ` +
            (await diag("move")),
          { cause: e },
        );
      }

      // Entf löscht die Überschrift (Rückfrage wird bestätigt)
      const factory = api().OrganizerFactory;
      const original = factory.confirm;
      let asked = 0; // 0 = the Delete key never reached deleteNode's confirm
      factory.confirm = () => {
        asked++;
        return true;
      };
      try {
        mousedown(nodeEl("Alpha")!);
        click(nodeEl("Alpha")!);
        await waitFor(() => nodeEl("Alpha"));
        key(doc, "Delete");
        try {
          await waitForAsync(async () =>
            (await outline()).every((n: any) => n.title !== "Alpha")
              ? true
              : null,
          );
        } catch (e) {
          const st = factory.lastState;
          throw new Error(
            `delete failed: asked=${asked} focusCol=${st.focusCol} node=${st.node} renaming=${st.renaming} ` +
              `saved=${(await outline()).map((r: any) => r.title)} ` +
              (await diag("delete")),
            { cause: e },
          );
        }
      } finally {
        factory.confirm = original;
      }
    });

    it("limits the entries to a collection and its subcollections", async function () {
      const set = async (id: number) => {
        click(doc.getElementById("flexannotate-scope")!);
        const opt = await waitFor(() =>
          doc.querySelector(`#flexannotate-scope-menu [data-value="${id}"]`),
        );
        click(opt!);
        await waitFor(
          () =>
            doc.getElementById("flexannotate-scope")?.dataset.value ===
            String(id),
        );
      };
      const [sub, root] = cols;
      await showAll();
      // Ein Schema-Wechsel auf eine Sammlung ohne eigenen Baum fragt einmal,
      // ob der Bibliotheksbaum als Anfang übernommen werden soll.
      const factory = api().OrganizerFactory;
      const original = factory.confirm;
      factory.confirm = () => true;
      try {
        await set(root.id); // includes subcollections by default
      } finally {
        factory.confirm = original;
      }
      await waitFor(() => rowCount() === 2);
      const cb = doc.getElementById(
        "flexannotate-scope-sub",
      ) as HTMLInputElement;
      cb.click(); // only the collection itself: work1 lives in the sub
      await waitFor(() => rowCount() === 0);
      cb.click();
      await set(sub.id);
      await waitFor(() => rowCount() === 2);
      await set(0);
      await waitFor(() => rowCount() === 3);
    });

    it("keeps scope and tree in step when opened for another collection", async function () {
      const [sub, root] = cols;
      const factory = api().OrganizerFactory;
      const original = factory.confirm;
      factory.confirm = () => true;
      try {
        await factory.open({ collectionID: sub.id });
        await waitFor(
          () =>
            doc.getElementById("flexannotate-scope")?.dataset.value ===
            String(sub.id),
        );
        await waitFor(() => rowCount() === 2);
        // Untersammlung → Baum der Hauptsammlung
        assert.equal(factory.lastState!.collectionKey, root.key);
        await factory.open({ collectionID: null });
        await waitFor(() => rowCount() === 3);
        assert.isNull(factory.lastState!.collectionKey);
      } finally {
        factory.confirm = original;
      }
    });

    it("renames a heading tag only within the tree's works", async function () {
      const model = api().outlineModel.OutlineModel;
      const tagsOf = (id: number) =>
        (Zotero.Items.get(id) as Zotero.Item).getTags().map((t) => t.tag);
      for (const a of [anns[0], anns[2]]) {
        a.addTag("§Zzz");
        await a.saveTx();
      }
      // scope = works of one tree (work1 only): work2's tag must stay
      await model.renameTag(libraryID(), "§Zzz", "§Yyy", new Set([work1.id]));
      assert.include(tagsOf(anns[0].id), "§Yyy");
      assert.include(tagsOf(anns[2].id), "§Zzz");
      assert.notInclude(tagsOf(anns[2].id), "§Yyy");
      await model.purgeTag(libraryID(), "§Zzz", new Set([work1.id]));
      assert.include(tagsOf(anns[2].id), "§Zzz", "purge stays in scope");
      await model.purgeTag(libraryID(), "§Zzz");
      await model.purgeTag(libraryID(), "§Yyy");
    });

    it("assigns an orphaned heading tag to a heading", async function () {
      const tagsOf = () =>
        (Zotero.Items.get(anns[2].id) as Zotero.Item)
          .getTags()
          .map((x) => x.tag);
      const st = () => api().OrganizerFactory.lastState;
      const tabEl = (re: RegExp) =>
        Array.from(doc.querySelectorAll("div")).find(
          (d) => d.children.length === 0 && re.test(d.textContent || ""),
        ) as HTMLElement;
      anns[2].addTag("§Verwaist");
      await anns[2].saveTx();
      // a tab switch reloads the rows and recounts the orphans
      click(tabEl(/^(Titel|Titles)$/));
      await waitFor(() => st().tab === "titel");
      click(tabEl(/^(Wissen|Knowledge)$/));
      await waitFor(() => st().orphans.some((o: any) => o.tag === "§Verwaist"));
      click(
        (await waitFor(() =>
          doc.getElementById("flexannotate-orphans-open"),
        )) as HTMLElement,
      );
      const row = (await waitFor(() =>
        doc.querySelector('#flexannotate-orphans [data-orphan="§Verwaist"]'),
      )) as HTMLElement;
      click(row.querySelector("button")!); // opens the heading list
      click(row.querySelector("[data-menu] [data-value]")!); // first heading
      click(row.querySelector('[data-action="assign"]')!);
      await waitFor(() => tagsOf().includes("§Alpha"));
      await waitFor(() => !st().orphans.length);
      assert.notInclude(tagsOf(), "§Verwaist");
      await waitFor(() => !doc.getElementById("flexannotate-orphans"));
      anns[2].removeTag("§Alpha");
      await anns[2].saveTx();
    });

    it("shows which other tree a shared heading also belongs to", async function () {
      const factory = api().OrganizerFactory;
      const model = api().outlineModel.OutlineModel;
      const root = cols[1];
      const other = new Zotero.Collection({
        name: "ScopeOther",
        libraryID: libraryID(),
      } as any);
      await other.saveTx();
      cols.push(other);
      work1.addToCollection(other.id); // work1 now lives in two main collections
      await work1.saveTx();
      const tree = () => [api().outline.makeNode("Dup")];
      await model.save(libraryID(), null, tree(), root.key);
      await model.save(libraryID(), null, tree(), other.key);
      anns[0].addTag("§Dup");
      await anns[0].saveTx();
      const original = factory.confirm;
      factory.confirm = () => true;
      try {
        await factory.open({ collectionID: root.id });
        const step = async (what: string, f: () => unknown) => {
          try {
            return await waitFor(f);
          } catch (e) {
            const st = factory.lastState;
            throw new Error(
              `${what}: key=${st?.collectionKey} other=${[...(st?.otherTrees?.keys() ?? [])]} rows=${doc.querySelectorAll("[data-row-id]").length} scope=${JSON.stringify(st?.scope)} node=${st?.node} tab=${st?.tab} all=${st?.allRows.length} srows=${st?.rows.length} roots=${st?.roots.length}`,
              { cause: e },
            );
          }
        };
        await step("key", () => factory.lastState?.collectionKey === root.key);
        await step("other", () =>
          factory.lastState?.otherTrees?.has(other.key),
        );
        // like assign() does: the cached row carries the tag
        factory
          .lastState!.allRows.find((r: any) => r.id === anns[0].id)!
          .tags.push("§Dup");
        if (!factory.lastState!.scope.includeSub)
          click(doc.getElementById("flexannotate-scope-sub")!);
        const row = (await step("row", () =>
          doc.querySelector(`[data-row-id="${anns[0].id}"]`),
        )) as HTMLElement;
        click(row);
        await step("hint", () =>
          /(auch in Baum|also in tree).*ScopeOther/.test(
            doc.body.textContent || "",
          ),
        );
      } finally {
        await factory.open({ collectionID: null }); // back to the whole library
        await waitFor(() => factory.lastState?.scope.collectionID === null);
        factory.confirm = original;
        anns[0].removeTag("§Dup");
        await anns[0].saveTx();
      }
    });

    it("edits quote, comment, place and place type", async function () {
      await showAll();
      const row = (await waitFor(() =>
        doc.querySelector(`[data-row-id="${anns[2].id}"]`),
      )) as HTMLElement;
      click(row);
      await waitFor(() => buttonWith(/Bearbeiten|Edit/));
      click(buttonWith(/Bearbeiten|Edit/)!);
      const quote = (await waitFor(() =>
        doc.getElementById("flexannotate-edit-quote"),
      )) as HTMLTextAreaElement;
      quote.value = "Zwei A geändert";
      (
        doc.getElementById("flexannotate-edit-comment") as HTMLTextAreaElement
      ).value = "Mein Kommentar";
      (
        doc.getElementById("flexannotate-edit-place") as HTMLInputElement
      ).value = "12";
      const loc = doc.getElementById("flexannotate-edit-locator")!;
      assert.match(
        doc.body.textContent || "",
        /Locator/,
        "the field is labelled Locator",
      );
      click(loc); // the list of locator types opens
      const option = await waitFor(() =>
        doc.querySelector(
          '#flexannotate-edit-locator-menu [data-value="section"]',
        ),
      );
      assert.isAbove(
        doc.querySelectorAll("#flexannotate-edit-locator-menu [data-value]")
          .length,
        3,
        "several locator types are offered",
      );
      click(option!);
      const otherPages = anns.slice(0, 2).map((a) => a.annotationPageLabel);
      click(doc.getElementById("flexannotate-edit-save")!);
      await waitFor(() => anns[2].annotationText === "Zwei A geändert");
      assert.equal(anns[2].annotationComment, "Mein Kommentar");
      assert.equal(anns[2].annotationPageLabel, "12");
      assert.deepEqual(
        anns.slice(0, 2).map((a) => a.annotationPageLabel),
        otherPages,
        "page numbers of the other annotations stay as they are",
      );
      assert.isTrue(
        anns[2]
          .getTags()
          .some((t) => t.tag === "#flexannotate-locator-section"),
      );
    });

    it("explains and performs the note export", async function () {
      const btn = buttonWith(/^\s*(Notiz|Note)\s*$/)!;
      assert.ok(btn, "export button");
      assert.match(btn.title, /Notiz|note/i);
      click(btn);
      const re = /Gliederung mit Zitaten|Outline with quotes/;
      const note = await waitForAsync(async () => {
        const s = new Zotero.Search();
        (s as any).libraryID = libraryID();
        s.addCondition("itemType", "is", "note");
        const items = await Zotero.Items.getAsync(await s.search());
        for (const i of items as Zotero.Item[]) {
          try {
            await i.loadAllData();
            if (re.test(i.getNote())) return i;
          } catch {
            // the export is still saving this note; look again on the next poll
          }
        }
        return null;
      });
      await (note as Zotero.Item).eraseTx();
      await screenshot(win, "organizer-features");
    });
  });

  // ── FlexAnnotate compatibility ────────────────────────────────────────────
  describe("locator tags shared with FlexAnnotate", function () {
    let att: Zotero.Item;
    let a1: Zotero.Item;
    let a2: Zotero.Item;

    before(async function () {
      const work = await makeWork("Flex Werk");
      att = await makePdfAttachment(work);
      a1 = await makeAnnotation(att, "Flex eins", "1", 0);
      a2 = await makeAnnotation(att, "Flex zwei", "2", 1);
    });

    after(cleanup);

    const rowOf = async (id: number, locator: string) =>
      waitForAsync(async () => {
        const rows = await api().organizerData.loadAnnotationRows(libraryID());
        const r = rows.find((x: any) => x.id === id);
        return r && r.locator === locator ? r : null;
      });
    const tagsOf = (i: Zotero.Item) => i.getTags().map((t) => t.tag);

    it("reads FlexAnnotate's annotation tag and edits it without a tag of its own", async function () {
      a1.addTag("#flexannotate-locator-paragraph", 1);
      await a1.saveTx();
      await rowOf(a1.id, "paragraph");
      await api().organizerData.saveAnnotation(a1.id, { locator: "section" });
      const tags = tagsOf(a1);
      assert.include(tags, "#flexannotate-locator-section");
      assert.notInclude(tags, "#flexannotate-locator-paragraph");
      // it is an automatic tag, like FlexAnnotate sets it
      const t = a1.getTags().find((x) => x.tag.endsWith("section"))!;
      assert.equal(t.type, 1);
    });

    it("respects the document default on the attachment", async function () {
      att.addTag("#flexannotate-default-locator-chapter", 1);
      await att.saveTx();
      await rowOf(a2.id, "chapter");
      // choosing page against a non-page default needs an explicit tag
      await api().organizerData.saveAnnotation(a2.id, { locator: "page" });
      const tags = tagsOf(a2);
      assert.include(tags, "#flexannotate-locator-page");
    });
  });

  // ── Word dialog ───────────────────────────────────────────────────────────
  describe("citation dialog (as opened from Word)", function () {
    let noteID: number;
    let workID: number;
    const anns: Zotero.Item[] = [];
    let win: Window | null = null;

    // kein Befehlsmerker aus einem Test in den nächsten: sonst treibt ein späterer Test die echte Word-Integration
    afterEach(function () {
      api().persistentDialog.rememberCommand(null);
    });

    /** Close dialogs from earlier steps so we never pick up a stale one. */
    const closeDialogs = async () => {
      let w: Window | null;
      while ((w = findWindowByUrl(DIALOG_URL))) {
        const old = w;
        old.close();
        await waitFor(() => findWindowByUrl(DIALOG_URL) !== old);
      }
    };

    /** The options Zotero passes for the citation dialog (integration.js:1603-1609). */
    const NATIVE_OPTIONS = "chrome,centerscreen,resizable=true,alwaysRaised";
    /** The io Zotero passes to the dialog for adding annotations. */
    const makeIo = (cited: Record<string, unknown> = {}) => {
      const io: any = new (Zotero.Integration as any).CitationEditInterface(
        {
          citationItems: [],
          sortedItems: [],
          properties: {},
          citationID: "flexannotate-test",
        },
        true,
        Promise.resolve(0),
        // Zotero loads the document's citations after the dialog opened
        Zotero.Promise.delay(300).then(() => cited),
        async () => "",
      );
      io.isCitingNotes = false;
      io.isAddingAnnotations = true;
      io.sort = async () => {
        io.citation.sortedItems = (io.citation.citationItems || []).map(
          (ci: any, idx: number) => [idx, ci],
        );
      };
      io.getItems = () => [];
      return io;
    };

    const openDialog = async (cited: Record<string, unknown> = {}) => {
      await closeDialogs();
      const io = makeIo(cited);
      (Services.ww as any).openWindow(
        null,
        DIALOG_URL,
        "",
        "chrome,centerscreen,resizable=true",
        io,
      );
      const w = await waitFor(() => findWindowByUrl(DIALOG_URL));
      const toggle = (await waitFor(() =>
        w.document.getElementById("flexannotate-toggle"),
      )) as HTMLInputElement;
      return { w, io, toggle };
    };

    before(async function () {
      if (!hasAnnotationDialog()) this.skip(); // needs Zotero >= 9 (annotation mode in citation dialog)
      await Zotero.Styles.init(); // locator labels need the CSL locales
      const work = await makeWork("Dialog Werk");
      workID = work.id;
      const att = await makePdfAttachment(work);
      for (let i = 0; i < 3; i++)
        anns.push(
          await makeAnnotation(
            att,
            i === 1
              ? "Sehr langes Zitat ".repeat(40) + "Ende"
              : `Dialogzitat ${i}`,
            `${i}`,
            i,
          ),
        );
      const core = api().outline;
      const roots = [core.makeNode("Einleitung"), core.makeNode("Hauptteil")];
      noteID = await api().outlineModel.OutlineModel.save(
        libraryID(),
        null,
        roots,
      );
      await api().organizerData.fileMany(
        [anns[0].id, anns[1].id],
        "§Einleitung",
      );
      Zotero.Prefs.set(`${prefs}.citedAnnotations`, "", true);
    });

    after(async function () {
      win?.close();
      (Zotero as any).Integration.currentSession = undefined;
      (Zotero.Items.get(noteID) as Zotero.Item)?.eraseTx?.();
      await cleanup();
    });

    it("shows headings with counts, the list and a preview, and inserts", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const { w, toggle } = await openDialog();
      win = w;
      const doc = w.document;
      if (!toggle.checked) toggle.click();
      await waitFor(
        () =>
          doc.querySelectorAll("#flexannotate-tree [data-node-id]").length >= 3,
      );
      const einleitung = Array.from(
        doc.querySelectorAll("#flexannotate-tree [data-node-id]"),
      ).find((n) => n.textContent?.includes("Einleitung"))!;
      assert.match(einleitung.textContent || "", /2$/, "count behind heading");
      await waitFor(
        () =>
          doc.querySelectorAll("#flexannotate-list-pane [data-ann-id]")
            .length === 3,
      );
      // left column keeps showing categories, native trees are hidden
      if (!w || !doc) throw new Error("Kein Document im Testfenster");
      const itemsTree = doc.getElementById("zotero-items-tree");
      if (!itemsTree) throw new Error("#zotero-items-tree nicht gefunden");
      assert.equal(w.getComputedStyle(itemsTree)!.display, "none");

      // preview shows the quote of the clicked annotation
      click(doc.querySelector(`[data-ann-id="${anns[0].id}"]`)!);
      await waitFor(() =>
        doc
          .getElementById("flexannotate-preview")
          ?.textContent?.includes("Dialogzitat 0"),
      );
      await screenshot(w, "dialog-three-columns");

      // a long quote must not push the details column out of the window
      click(doc.querySelector(`[data-ann-id="${anns[1].id}"]`)!);
      await waitFor(() =>
        doc
          .getElementById("flexannotate-preview")
          ?.textContent?.includes("Sehr langes Zitat"),
      );
      assert.isAtMost(
        doc.documentElement!.scrollWidth,
        w.innerWidth + 1,
        "no horizontal overflow",
      );
      const sidebar = doc.getElementById("sidebar")!.getBoundingClientRect();
      assert.isAtMost(sidebar.right, w.innerWidth + 1, "details inside window");
      await screenshot(w, "dialog-long-quote");
      click(doc.querySelector(`[data-ann-id="${anns[0].id}"]`)!);

      // inserting goes through Zotero's own handler
      click(
        doc.querySelector(`[data-ann-id="${anns[0].id}"] .flexannotate-plus`)!,
      );
      await waitFor(
        () => doc.querySelectorAll("#bubble-input .bubble").length === 1,
      );

      // Enter adds the selected annotation to the citation as well
      click(doc.querySelector(`[data-ann-id="${anns[1].id}"]`)!);
      await waitFor(() =>
        doc
          .getElementById("flexannotate-preview")
          ?.textContent?.includes("Sehr langes"),
      );
      key(doc, "Enter");
      await waitFor(
        () => doc.querySelectorAll("#bubble-input .bubble").length === 2,
      );

      // accepting records the annotation as cited for this document
      await (w as any).accept();
      await waitFor(() => {
        const raw = Zotero.Prefs.get(
          `${prefs}.citedAnnotations`,
          true,
        ) as string;
        return raw?.includes(`"${anns[0].id}"`) ? raw : null;
      });
    });

    it("shows unassigned annotations under Ohne Kategorie like the organizer", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const { w, toggle } = await openDialog();
      win = w;
      const doc = w.document;
      if (!toggle.checked) toggle.click();
      // with the outline on, "Alle" includes the unassigned annotation
      await waitFor(
        () =>
          doc.querySelectorAll("#flexannotate-list-pane [data-ann-id]")
            .length === 3,
      );
      // the tree offers an "(Ohne Kategorie)" entry with a count
      const noneNode = await waitFor(() =>
        Array.from(
          doc.querySelectorAll("#flexannotate-tree [data-node-id]"),
        ).find((n) => n.getAttribute("data-node-id") === "none"),
      );
      assert.match(noneNode.textContent || "", /1$/, "one unassigned");
      // clicking it shows only the unassigned annotation
      click(noneNode);
      await waitFor(() => {
        const rows = doc.querySelectorAll(
          "#flexannotate-list-pane [data-ann-id]",
        );
        return (
          rows.length === 1 &&
          rows[0].getAttribute("data-ann-id") === String(anns[2].id)
        );
      });
      // the unassigned row is listed under the "Ohne Kategorie"/"No category"
      // section header (the label depends on Zotero's locale)
      assert.match(
        doc.getElementById("flexannotate-list-pane")?.textContent || "",
        /\((Ohne Kategorie|No category)\)/,
      );
    });

    it("updates the collection name in the dialog scope picker", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const col = new Zotero.Collection({
        name: "DialogScope",
        libraryID: libraryID(),
      } as any);
      await col.saveTx();
      try {
        const { w, toggle } = await openDialog();
        win = w;
        const doc = w.document;
        if (!toggle.checked) toggle.click();
        await waitFor(() => doc.getElementById("flexannotate-dialog-scope"));
        const label = doc.querySelector(
          "#flexannotate-dialog-scope",
        ) as HTMLElement;
        assert.match(
          label.textContent || "",
          /Gesamte Bibliothek|Whole library/,
        );
        // open the menu and pick the new collection
        click(label);
        const option = await waitFor(() =>
          [
            ...doc.querySelectorAll("#flexannotate-dialog-scope-picker div"),
          ].find((o) => o.textContent === "DialogScope"),
        );
        click(option!);
        await waitFor(() =>
          (label.textContent || "").startsWith("DialogScope"),
        );
      } finally {
        await col.eraseTx();
      }
    });

    it("marks annotations cited in this document with a green check", async function () {
      win?.close();
      // the work is still cited in the document: the check is shown
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {}, // still empty when the dialog opens
      };
      let { w, toggle } = await openDialog({ [workID]: [{}] });
      win = w;
      if (!toggle.checked) toggle.click();
      try {
        await waitFor(
          () => w.document.querySelectorAll(".flexannotate-cited").length === 2,
        );
      } catch (e) {
        const v = api().CitationDialogPatch.viewOf(w);
        throw new Error(
          `no check: store=${Zotero.Prefs.get(`${prefs}.citedAnnotations`, true)} view=${v ? "yes" : "none"} cited=${v ? [...v.cited] : "-"} rows=${w.document.querySelectorAll("[data-ann-id]").length} workID=${workID} ids=${anns.map((a) => a.id)}`,
          { cause: e },
        );
      }
      await screenshot(w, "dialog-cited");

      // the mark can be removed by hand and set again
      const readStore = () =>
        Zotero.Prefs.get(`${prefs}.citedAnnotations`, true) as string;
      click(
        w.document.querySelector(
          `[data-ann-id="${anns[0].id}"] .flexannotate-cited`,
        )!,
      );
      await waitFor(
        () => w.document.querySelectorAll(".flexannotate-cited").length === 1,
      );
      assert.notInclude(readStore(), `"${anns[0].id}"`);
      // select it: the preview offers the opposite action
      click(w.document.querySelector(`[data-ann-id="${anns[0].id}"]`)!);
      const mark = await waitFor(() =>
        w.document.getElementById("flexannotate-toggle-cited"),
      );
      click(mark);
      await waitFor(
        () => w.document.querySelectorAll(".flexannotate-cited").length === 2,
      );
      assert.include(readStore(), `"${anns[0].id}"`);

      // the work is no longer cited: the check is gone (cheap validity test)
      w.close();
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      ({ w, toggle } = await openDialog());
      win = w;
      if (!toggle.checked) toggle.click();
      await waitFor(
        () =>
          w.document.querySelectorAll("#flexannotate-list-pane [data-ann-id]")
            .length === 3,
      );
      assert.lengthOf(w.document.querySelectorAll(".flexannotate-cited"), 0);
    });

    it("shows the works behind the annotations only when the setting is on", async function () {
      const prefKey = `${prefs}.showWorksInAnnotationView`;
      assert.isFalse(Zotero.Prefs.get(prefKey, true), "default is off");
      await api().organizerData.fileMany([workID], "§Hauptteil");
      win?.close();
      Zotero.Prefs.set(prefKey, true, true);
      try {
        const { w, toggle } = await openDialog();
        win = w;
        if (!toggle.checked) toggle.click();
        // 2 in Einleitung + 3 of the work under Hauptteil
        await waitFor(
          () =>
            w.document.querySelectorAll("#flexannotate-list-pane [data-ann-id]")
              .length === 5,
        );
        await screenshot(w, "dialog-works-shown");
      } finally {
        Zotero.Prefs.set(prefKey, false, true);
      }
    });

    it("shows comment text in dialog rows when the setting is on", async function () {
      const prefKey = `${prefs}.showCommentInOrganizerRows`;
      const comment = "Nur Kommentar im Dialog";
      const original = (anns[0] as any).annotationComment || "";
      const rowText = (w: Window, id: number) =>
        (
          w.document.querySelector(
            `#flexannotate-list-pane [data-ann-id="${id}"]`,
          ) as HTMLElement | null
        )?.textContent || "";
      (anns[0] as any).annotationComment = comment;
      await anns[0].saveTx();
      win?.close();
      Zotero.Prefs.set(prefKey, false, true);
      try {
        let opened = await openDialog();
        win = opened.w;
        if (!opened.toggle.checked) opened.toggle.click();
        await waitFor(() =>
          rowText(opened.w, anns[0].id).includes("Dialogzitat 0"),
        );
        assert.notInclude(rowText(opened.w, anns[0].id), comment);

        Zotero.Prefs.set(prefKey, true, true);
        opened.w.close();
        opened = await openDialog();
        win = opened.w;
        if (!opened.toggle.checked) opened.toggle.click();
        await waitFor(() => rowText(opened.w, anns[0].id).includes(comment));
        assert.notInclude(rowText(opened.w, anns[0].id), "Dialogzitat 0");
      } finally {
        Zotero.Prefs.set(prefKey, false, true);
        (anns[0] as any).annotationComment = original;
        await anns[0].saveTx();
      }
    });

    it("keeps the right column the same width with and without the outline", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const { w, toggle } = await openDialog();
      win = w;
      const doc = w.document;
      const setOutline = async (on: boolean) => {
        if (toggle.checked !== on) toggle.click();
        await waitFor(() =>
          on
            ? doc.querySelector("#flexannotate-tree [data-node-id]")
            : !doc.getElementById("flexannotate-tree"),
        );
        await new Promise((r) =>
          w.requestAnimationFrame(() => w.requestAnimationFrame(r)),
        );
      };
      const sidebar = () => doc.getElementById("sidebar") as HTMLElement;
      const widths: number[] = [];
      for (const on of [false, true, false, true, false]) {
        await setOutline(on);
        if (!on) assert.equal(sidebar().style.width, "", "no inline width");
        widths.push(sidebar().getBoundingClientRect().width);
      }
      for (const x of widths)
        assert.approximately(x, widths[0], 1, "same width in both states");
    });

    it("mirrors Zotero's search bar into the outline list, not the other way round", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const { w, toggle } = await openDialog();
      win = w;
      const doc = w.document;
      const bar = () =>
        doc.querySelector("#bubble-input input") as HTMLInputElement;
      const filter = () =>
        doc.querySelector(
          "#flexannotate-list-pane input",
        ) as HTMLInputElement | null;
      const rows = () => [
        ...doc.querySelectorAll("#flexannotate-list-pane [data-ann-id]"),
      ];
      const type = (el: HTMLInputElement, text: string) => {
        el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };

      // text typed while the outline is off is taken over when it is switched on
      if (toggle.checked) {
        toggle.click();
        await waitFor(() => !doc.getElementById("flexannotate-tree"));
      }
      bar().focus();
      type(bar(), "Sehr langes");
      toggle.click();
      await waitFor(
        () => filter()?.value === "Sehr langes" && rows().length === 1,
      );
      assert.equal(rows()[0].getAttribute("data-ann-id"), String(anns[1].id));

      // the outline's own field only filters the list, the search bar keeps its text
      type(filter()!, "Dialogzitat");
      await waitFor(
        () =>
          rows().length === 2 &&
          rows()[0].getAttribute("data-ann-id") === String(anns[0].id) &&
          rows()[1].getAttribute("data-ann-id") === String(anns[2].id),
      );
      assert.equal(bar().value, "Sehr langes", "search bar untouched");

      // emptying the search bar shows everything again
      type(bar(), "");
      await waitFor(() => rows().length === 3 && filter()?.value === "");
    });

    it("opens the citation place of one selected annotation in the reader", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const { w, toggle } = await openDialog();
      win = w;
      const doc = w.document;
      if (!toggle.checked) toggle.click();
      await waitFor(
        () =>
          doc.querySelectorAll("#flexannotate-list-pane [data-ann-id]")
            .length === 3,
      );
      const preview = doc.getElementById("flexannotate-preview")!;
      const buttons = () =>
        [...preview.querySelectorAll("button")].map((b) => b.id);

      click(doc.querySelector(`[data-ann-id="${anns[0].id}"]`)!);
      await waitFor(() => buttons().includes("flexannotate-show-place"));
      assert.deepEqual(buttons(), [
        "flexannotate-insert",
        "flexannotate-show-place",
        "flexannotate-toggle-cited",
      ]);

      // only for exactly one selected annotation
      click(doc.querySelector(`[data-ann-id="${anns[1].id}"]`)!, {
        ctrlKey: true,
      });
      await waitFor(() => !doc.getElementById("flexannotate-show-place"));
      click(doc.querySelector(`[data-ann-id="${anns[0].id}"]`)!);
      await waitFor(() => doc.getElementById("flexannotate-show-place"));

      // the reader is called once with the attachment and the annotation key
      const calls: unknown[][] = [];
      const reader = Zotero.Reader as any;
      const original = reader.open;
      reader.open = async (...args: unknown[]) => {
        calls.push(args);
      };
      try {
        click(doc.getElementById("flexannotate-show-place")!);
        await waitFor(() => (calls.length === 1 ? calls : null));
        assert.lengthOf(calls, 1, "exactly one reader call");
        assert.equal(calls[0][0], (anns[0] as any).parentItemID, "attachment");
        assert.deepEqual(calls[0][1], { annotationID: anns[0].key });
      } finally {
        reader.open = original;
      }
      assert.isTrue(
        !!doc.getElementById("flexannotate-show-place"),
        "dialog stays open",
      );
    });

    /** Runs the command around displayDialog as execCommand does (integration.js:257-347). */
    const beginCommand = () => {
      const integration = Zotero.Integration as any;
      let resolve!: () => void;
      integration.currentCommandPromise = new Promise<void>(
        (r) => (resolve = r),
      );
      return {
        // execCommand's finally: close currentWindow (integration.js:312-316), then done (:346-347)
        end: async () => {
          if (integration.currentWindow && !integration.currentWindow.closed)
            integration.currentWindow.close();
          integration.currentWindow = false;
          resolve();
          await Zotero.Promise.delay(300);
        },
      };
    };
    const insertInto = async (w: Window, ann: Zotero.Item) => {
      const doc = w.document;
      await waitFor(
        () => (w as any).DIALOG_STATE?.loaded || null,
        8000,
        "dlg-loaded",
      );
      const toggle = (await waitFor(
        () => doc.getElementById("flexannotate-toggle"),
        8000,
        "dlg-toggle",
      )) as HTMLInputElement;
      if (!toggle.checked) toggle.click();
      const plus = (await waitFor(
        () => doc.querySelector(`[data-ann-id="${ann.id}"] .flexannotate-plus`),
        8000,
        "dlg-plus",
      )) as HTMLElement;
      click(plus);
      await waitFor(
        () =>
          doc.querySelectorAll("#bubble-input .bubble").length > 0
            ? true
            : null,
        8000,
        "dlg-bubble",
      );
    };

    const dialogWindows = (): Window[] => {
      const out: Window[] = [];
      const en = Services.wm.getEnumerator("");
      while (en.hasMoreElements()) {
        const w = en.getNext() as Window;
        if (w.location?.href === DIALOG_URL) out.push(w);
      }
      return out;
    };
    /** One real request with the first annotation inserted and accepted; returns the browse window. */
    const firstInsert = async (
      io1: any,
      rect: { x: number; y: number; w: number; h: number },
    ) => {
      void rect;
      const cmd1 = beginCommand();
      const done1 = (Zotero.Integration as any).displayDialog(
        DIALOG_URL,
        NATIVE_OPTIONS,
        io1,
        "citation",
      ) as Promise<void>;
      const w1 = (await waitFor(
        () => findWindowByUrl(DIALOG_URL),
        8000,
        "dlg-w1",
      )) as Window;
      win = w1;
      await insertInto(w1, anns[0]);
      await (w1 as any).accept();
      await cmd1.end();
      await done1;
      return w1;
    };
    const browseWindow = async (not: Window) =>
      (await waitFor(
        () => dialogWindows().find((w) => w !== not && !w.closed) ?? null,
        8000,
        "browse window",
      )) as Window;

    it("after accept the dialog closes and a browse window opens at the same rect", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      const origDoc = integration.currentDoc;
      await closeDialogs();
      api().persistentDialog.writePref(true);
      api().persistentDialog.rememberCommand({
        agent: "WinWord",
        docId: "Dokument1",
        templateVersion: 0,
      });
      try {
        const io1 = makeIo();
        const w1 = await firstInsert(io1, { x: 0, y: 0, w: 0, h: 0 });
        assert.isTrue(
          w1.closed,
          "the dialog window is closed after the command",
        );
        const bw = await browseWindow(w1);
        win = bw;
        await waitFor(
          () => (bw as any).DIALOG_STATE?.loaded || null,
          8000,
          "browse loaded",
        );
        await Zotero.Promise.delay(1500);
        // the normal view with the annotations, not a placeholder
        const toggle = (await waitFor(
          () => bw.document.getElementById("flexannotate-toggle"),
          8000,
          "toggle",
        )) as HTMLInputElement;
        if (!toggle.checked) toggle.click();
        await waitFor(
          () =>
            bw.document.querySelectorAll(
              "#flexannotate-list-pane [data-ann-id]",
            ).length === 3
              ? true
              : null,
          8000,
          "annotations in the browse window",
        );
        assert.isAtLeast(
          io1.citation.citationItems.length,
          1,
          "the first citation went into the io",
        );
      } finally {
        api().persistentDialog.writePref(origPref);
        integration.currentDoc = origDoc;
        win?.close();
      }
    });

    it("inserting in the browse window runs the command, which gets the citation; no new dialog window", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      const origDoc = integration.currentDoc;
      const origExec = integration.execCommand;
      await closeDialogs();
      api().persistentDialog.writePref(true);
      api().persistentDialog.rememberCommand({
        agent: "WinWord",
        docId: "Dokument1",
        templateVersion: 0,
      });
      // a fake Word document: what the insertion adds to it
      const fakeDoc: string[] = [];
      const commands: string[] = [];
      let windowsDuringInsert = -1;
      integration.execCommand = async (agent: string, command: string) => {
        commands.push(`${agent}:${command}`);
        // as execCommand: a command promise, then the command's own dialog request
        const cmd = beginCommand();
        const io = makeIo();
        // the cursor sits in an existing citation: Zotero brings its sources along (integration.js:1513-1517)
        io.citation.citationItems = [{ id: anns[2].id }];
        await integration.displayDialog(
          DIALOG_URL,
          NATIVE_OPTIONS,
          io,
          "citation",
        );
        await Zotero.Promise.delay(300);
        windowsDuringInsert = dialogWindows().filter((w) => !w.closed).length;
        fakeDoc.push(
          ...io.citation.citationItems.map((i: any) => String(i.id)),
        );
        await cmd.end();
      };
      try {
        const io1 = makeIo();
        const w1 = await firstInsert(io1, { x: 0, y: 0, w: 0, h: 0 });
        const bw = await browseWindow(w1);
        win = bw;
        await waitFor(
          () => (bw as any).DIALOG_STATE?.loaded || null,
          8000,
          "browse loaded",
        );
        await Zotero.Promise.delay(1500);
        const toggle = (await waitFor(
          () => bw.document.getElementById("flexannotate-toggle"),
          8000,
          "toggle",
        )) as HTMLInputElement;
        if (!toggle.checked) toggle.click();
        const rows = (await waitFor(
          () => {
            const r = bw.document.querySelectorAll(
              "#flexannotate-list-pane [data-ann-id]",
            );
            return r.length === 3 ? r : null;
          },
          8000,
          "rows",
        )) as NodeListOf<Element>;
        void rows;
        const plus = (await waitFor(
          () =>
            bw.document.querySelector(
              `[data-ann-id="${anns[1].id}"] .flexannotate-plus`,
            ),
          8000,
          "plus",
        )) as HTMLElement;
        click(plus);
        await waitFor(
          () =>
            bw.document.querySelectorAll("#bubble-input .bubble").length > 0
              ? true
              : null,
          8000,
          "bubble",
        );
        const before = { w: bw.outerWidth, h: bw.outerHeight, x: bw.screenX };
        await (bw as any).accept();
        // the fake command ran, and the browse window comes back at the same rect
        await waitFor(
          () => (fakeDoc.length > 0 ? true : null),
          8000,
          "insert done",
        );
        assert.deepEqual(
          commands,
          ["WinWord:addAnnotation"],
          "the command ran again",
        );
        assert.deepEqual(
          fakeDoc,
          [String(anns[2].id), String(anns[1].id)],
          "the new source is added to the existing citation, not replacing it",
        );
        assert.strictEqual(
          windowsDuringInsert,
          0,
          `no dialog window while inserting (${dialogWindows()
            .map((w) => (w.closed ? "c" : "o"))
            .join("")})`,
        );
        const bw2 = await browseWindow(bw);
        win = bw2;
        assert.isTrue(bw.closed, "the browse window was closed for the insert");
        await waitFor(
          () => (bw2 as any).DIALOG_STATE?.loaded || null,
          8000,
          "browse 2 loaded",
        );
        await Zotero.Promise.delay(1500);
        assert.approximately(bw2.outerWidth, before.w, 4, "same width");
        assert.approximately(bw2.outerHeight, before.h, 4, "same height");
        assert.approximately(bw2.screenX, before.x, 4, "same x");
      } finally {
        integration.execCommand = origExec;
        api().persistentDialog.writePref(origPref);
        integration.currentDoc = origDoc;
        win?.close();
      }
    });

    it("a command without a dialog (refresh) keeps the dialog command for the browse window", async function () {
      const integration = Zotero.Integration as any;
      // run the plugin's execCommand patch around a stub instead of the real command
      const before = integration.execCommand;
      api().persistentDialog.unpatchExec();
      const realExec = integration.execCommand;
      const wasPatched = before !== realExec;
      const calls: string[] = [];
      integration.execCommand = async (_agent: string, command: string) => {
        calls.push(command);
      };
      api().persistentDialog.patchExec();
      try {
        await integration.execCommand("WinWord", "addEditCitation", "D1", 1);
        await integration.execCommand("WinWord", "refresh", "D2", 2);
        assert.deepEqual(
          api().persistentDialog.lastCommand(),
          {
            agent: "WinWord",
            command: "addEditCitation",
            docId: "D2",
            templateVersion: 2,
          },
          "refresh updates the document but not the command to repeat",
        );
        await integration.execCommand("WinWord", "addAnnotation", "D2", 2);
        assert.strictEqual(
          api().persistentDialog.lastCommand()?.command,
          "addAnnotation",
        );
        await integration.execCommand("http", "addEditCitation", "G1", 0);
        assert.isNull(
          api().persistentDialog.lastCommand(),
          "no browse window for Google Docs",
        );
        assert.deepEqual(calls, [
          "addEditCitation",
          "refresh",
          "addAnnotation",
          "addEditCitation",
        ]);
      } finally {
        api().persistentDialog.unpatchExec();
        integration.execCommand = realExec;
        if (wasPatched) api().persistentDialog.patchExec();
        api().persistentDialog.rememberCommand(null);
      }
    });

    it("a real request replaces the browse window; X on the browse window ends the persistence", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      const origDoc = integration.currentDoc;
      await closeDialogs();
      api().persistentDialog.writePref(true);
      api().persistentDialog.rememberCommand({
        agent: "WinWord",
        docId: "Dokument1",
        templateVersion: 0,
      });
      try {
        const w1 = await firstInsert(makeIo(), { x: 0, y: 0, w: 0, h: 0 });
        const bw = await browseWindow(w1);
        win = bw;
        // a real request (a new Add Annotation in Word) closes the browse window and opens the dialog
        const cmd = beginCommand();
        const done = integration.displayDialog(
          DIALOG_URL,
          NATIVE_OPTIONS,
          makeIo(),
          "citation",
        ) as Promise<void>;
        const real = await browseWindow(bw);
        win = real;
        await waitFor(
          () => (bw.closed ? true : null),
          5000,
          "browse closed by the real request",
        );
        // the real request is answered like a normal insert, so the browse window comes back after it
        await insertInto(real, anns[0]);
        await (real as any).accept();
        await cmd.end();
        await done;
        // now X on the browse window that the command leaves behind
        const bw3 = await browseWindow(real);
        win = bw3;
        bw3.close();
        await waitFor(
          () => (api().persistentDialog.getWindow() === null ? true : null),
          5000,
          "persistence ended",
        );
      } finally {
        api().persistentDialog.writePref(origPref);
        integration.currentDoc = origDoc;
        win?.close();
      }
    });

    it("turning the switch off keeps the browse window open; it closes on the next insert", async function () {
      this.timeout(60000);
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      const origDoc = integration.currentDoc;
      const origExec = integration.execCommand;
      await closeDialogs();
      api().persistentDialog.writePref(true);
      api().persistentDialog.rememberCommand({
        agent: "WinWord",
        docId: "Dokument1",
        templateVersion: 0,
      });
      const fakeDoc: string[] = [];
      try {
        const w1 = await firstInsert(makeIo(), { x: 0, y: 0, w: 0, h: 0 });
        const bw = await browseWindow(w1);
        win = bw;
        await waitFor(
          () => (bw as any).DIALOG_STATE?.loaded || null,
          8000,
          "browse loaded",
        );
        // the switch is turned off: the open browse window stays put
        api().persistentDialog.writePref(false);
        await Zotero.Promise.delay(600);
        assert.isFalse(
          bw.closed,
          "browse window stays open after the switch off",
        );
        assert.strictEqual(
          api().persistentDialog.getWindow(),
          bw,
          "the browse window is still the persistent window",
        );
        // the next insert from it closes the window and does not reopen it (vanilla behaviour)
        integration.execCommand = async (agent: string, command: string) => {
          const cmd = beginCommand();
          const io = makeIo();
          await integration.displayDialog(
            DIALOG_URL,
            NATIVE_OPTIONS,
            io,
            "citation",
          );
          await Zotero.Promise.delay(300);
          fakeDoc.push(
            ...io.citation.citationItems.map((i: any) => String(i.id)),
          );
          await cmd.end();
        };
        const plus = (await waitFor(
          () =>
            bw.document.querySelector(
              `[data-ann-id="${anns[0].id}"] .flexannotate-plus`,
            ),
          8000,
          "plus",
        )) as HTMLElement;
        click(plus);
        await waitFor(
          () =>
            bw.document.querySelectorAll("#bubble-input .bubble").length > 0
              ? true
              : null,
          8000,
          "bubble",
        );
        await (bw as any).accept();
        await waitFor(
          () => (fakeDoc.length > 0 ? true : null),
          8000,
          "insert done",
        );
        assert.lengthOf(
          fakeDoc,
          1,
          "the insert from the still-open window still works",
        );
        // the fire-and-forget insertFromBrowse tail (closeBrowse + conditional
        // openBrowse) runs after the insert. Let it settle while the switch is STILL off:
        // it must not reopen a window here.
        await waitFor(
          () => (bw.closed ? true : null),
          8000,
          "browse closed by the insert (switch off)",
        );
        await Zotero.Promise.delay(400);
        assert.isNull(
          api().persistentDialog.getWindow(),
          "no window reopens while the switch is off",
        );
      } finally {
        integration.execCommand = origExec;
        api().persistentDialog.writePref(origPref);
        integration.currentDoc = origDoc;
        await closeDialogs();
      }
    });

    it("reads the switch at accept time: off -> the dialog is left for the command to close, no browse window", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      const origDoc = integration.currentDoc;
      await closeDialogs();
      api().persistentDialog.writePref(true);
      try {
        const io1 = makeIo();
        const cmd = beginCommand();
        const done = integration.displayDialog(
          DIALOG_URL,
          NATIVE_OPTIONS,
          io1,
          "citation",
        ) as Promise<void>;
        const w = (await waitFor(
          () => findWindowByUrl(DIALOG_URL),
          8000,
          "dlg",
        )) as Window;
        win = w;
        await insertInto(w, anns[0]);
        // the switch is turned off while the window is open
        api().persistentDialog.writePref(false);
        await (w as any).accept();
        assert.isFalse(w.closed, "not closed by us; the command closes it");
        assert.strictEqual(
          integration.currentWindow,
          w,
          "execCommand's finally will close it",
        );
        await cmd.end();
        await done;
        assert.isTrue(w.closed, "closed by the command");
        assert.isNull(
          findWindowByUrl(DIALOG_URL),
          "no browse window when the switch is off",
        );
        assert.isAtLeast(
          io1.citation.citationItems.length,
          1,
          "the citation went into the io",
        );
      } finally {
        api().persistentDialog.writePref(origPref);
        integration.currentDoc = origDoc;
        win?.close();
      }
    });

    it("activating the switch on an open dialog makes the next insert reopen a browse window", async function () {
      this.timeout(60000);
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      const origDoc = integration.currentDoc;
      const origSentinel = integration.currentWindow;
      await closeDialogs();
      api().persistentDialog.writePref(false);
      api().persistentDialog.rememberCommand({
        agent: "WinWord",
        docId: "Dokument1",
        templateVersion: 0,
      });
      try {
        // a dialog window is open (native path: no browse wrap installed yet)
        const w = (await openDialog()).w;
        win = w;
        await waitFor(() => (w as any).DIALOG_STATE?.loaded || null);
        // the switch is turned on while the window is open: retrofit the wrap
        // (the checkbox handler does writePref(true) + activateOnOpenDialog)
        integration.currentWindow = w;
        const cmd = beginCommand();
        api().persistentDialog.writePref(true);
        api().persistentDialog.activateOnOpenDialog();
        await insertInto(w, anns[0]);
        await (w as any).accept();
        // the command settles (execCommand's finally would close the window)
        await cmd.end();
        // the browse window reopens at the same spot
        const bw = await browseWindow(w);
        win = bw;
        await waitFor(
          () => (bw as any).DIALOG_STATE?.loaded || null,
          8000,
          "browse loaded",
        );
        assert.isFalse(bw.closed, "a browse window reopens after the insert");
      } finally {
        api().persistentDialog.writePref(origPref);
        integration.currentDoc = origDoc;
        integration.currentWindow = origSentinel;
        await closeDialogs();
      }
    });

    it("a single close resolves a pending persistent request", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      const origDoc = integration.currentDoc;
      await closeDialogs();
      api().persistentDialog.writePref(true);
      try {
        let resolved = false;
        const done = integration.displayDialog(
          DIALOG_URL,
          NATIVE_OPTIONS,
          makeIo(),
          "citation",
        ) as Promise<void>;
        done.then(() => {
          resolved = true;
        });
        const w = (await waitFor(() => findWindowByUrl(DIALOG_URL))) as Window;
        win = w;
        await waitFor(() => (w as any).DIALOG_STATE?.loaded || null);
        w.close(); // one call, no accept
        await waitFor(
          () => (resolved ? true : null),
          5000,
          "pending request resolved",
        );
        assert.isTrue(w.closed);
      } finally {
        api().persistentDialog.writePref(origPref);
        integration.currentDoc = origDoc;
        win?.close();
      }
    });

    it("moves the two switches into the settings menu when narrow, and back when wide", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const origOutline =
        Zotero.Prefs.get(`${prefs}.dialogOutlineView`, true) ?? false;
      const origPersist = api().persistentDialog.readPref();
      await closeDialogs();
      // narrow needs the persistent window: only it lifts Zotero's minimum width
      api().persistentDialog.writePref(true);
      Zotero.Prefs.set(`${prefs}.dialogOutlineView`, false, true);
      try {
        const { w } = await openDialog();
        win = w;
        const doc = w.document;
        const popup = doc.getElementById("settings-popup")!;
        const row = doc.getElementById(
          "flexannotate-toggle-row",
        ) as HTMLElement;
        const outlineCb = (await waitFor(() =>
          doc.getElementById("flexannotate-toggle"),
        )) as HTMLInputElement;
        const persistCb = doc.getElementById(
          "flexannotate-persistent-toggle",
        ) as HTMLInputElement;
        assert.isTrue(row.contains(outlineCb), "inline when wide");

        w.resizeTo(520, 700);
        await waitFor(() => (row.hidden ? true : null), 8000, "row hidden");
        assert.equal(
          doc.querySelectorAll("#flexannotate-menu-items").length,
          1,
        );
        assert.isTrue(popup.contains(outlineCb), "outline switch in the menu");
        assert.isTrue(
          popup.contains(persistCb),
          "persistent switch in the menu",
        );

        // the menu reflects the state when it opens
        outlineCb.checked = true;
        popup.dispatchEvent(new (w as any).Event("popupshowing"));
        assert.isFalse(outlineCb.checked, "reset to the outline state (off)");

        // toggling in the menu does what the inline switch did
        outlineCb.click();
        await waitFor(
          () => doc.getElementById("flexannotate-list-pane") || null,
          8000,
          "outline on",
        );
        assert.isTrue(
          Zotero.Prefs.get(`${prefs}.dialogOutlineView`, true) === true,
        );
        // the pref was on: the click switches it off, and the pref follows the switch
        const before = persistCb.checked;
        persistCb.click();
        assert.notEqual(persistCb.checked, before, "switch toggled");
        assert.equal(
          api().persistentDialog.readPref(),
          persistCb.checked,
          "pref follows",
        );

        w.resizeTo(1100, 700);
        await waitFor(
          () => (!row.hidden && row.contains(outlineCb) ? true : null),
          8000,
          "inline again",
        );
        assert.isNull(
          doc.getElementById("flexannotate-menu-items"),
          "menu items removed",
        );
        assert.isFalse(popup.contains(outlineCb), "not in the menu any more");
        assert.isTrue(outlineCb.checked, "state kept across the move");
      } finally {
        api().persistentDialog.writePref(origPersist);
        Zotero.Prefs.set(`${prefs}.dialogOutlineView`, origOutline, true);
        win?.close();
      }
    });

    it("preserves outline checkbox state when switching between annotations and works tabs", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const origOutline =
        Zotero.Prefs.get(`${prefs}.dialogOutlineView`, true) ?? false;
      await closeDialogs();
      Zotero.Prefs.set(`${prefs}.dialogOutlineView`, false, true);
      try {
        const { w, toggle } = await openDialog();
        win = w;
        const doc = w.document;
        const row = doc.getElementById(
          "flexannotate-toggle-row",
        ) as HTMLElement;
        const popup = doc.getElementById("settings-popup")!;
        const settingsBtn = doc.getElementById(
          "settings-button",
        ) as HTMLElement;

        // 1. Initially in annotations mode: outline is off
        assert.isFalse(toggle.checked, "initially off");
        assert.isTrue(
          row.contains(toggle),
          "toggle inline in annotations mode",
        );

        // 2. Enable outline in annotations mode
        toggle.click();
        await waitFor(
          () => doc.getElementById("flexannotate-list-pane") || null,
          8000,
          "outline list pane active",
        );
        assert.isTrue(toggle.checked, "toggle checked after click");
        assert.isTrue(
          Zotero.Prefs.get(`${prefs}.dialogOutlineView`, true) === true,
          "pref updated",
        );
        assert.isNotNull(
          doc.getElementById("flexannotate-preview"),
          "preview present in annotations mode",
        );

        // 3. Switch to works (citation mode) via segmented switch
        const citationOption = doc.getElementById("dialog-type-citation")!;
        citationOption.dispatchEvent(
          new (w as any).MouseEvent("mousedown", { bubbles: true }),
        );
        await waitFor(
          () =>
            doc.documentElement.getAttribute("dialog-type") === "citation"
              ? true
              : null,
          8000,
          "switched to citation mode",
        );

        // State preserved in citation mode:
        // - Toggle stays checked
        // - Toggle is moved to the settings popup
        // - Settings button is visible
        // - Outline tree and list pane are active for works
        // - No preview column in citation mode
        assert.isTrue(
          popup.contains(toggle),
          "toggle placed in settings popup",
        );
        assert.isTrue(
          toggle.checked,
          "toggle remains checked in citation mode",
        );
        assert.isFalse(settingsBtn.hidden, "settings button is visible");
        await waitFor(
          () => doc.getElementById("flexannotate-list-pane") || null,
          8000,
          "outline list pane remains active in citation mode",
        );
        assert.isNull(
          doc.getElementById("flexannotate-preview"),
          "no preview column in citation mode",
        );

        // 4. Switch back to annotations mode
        const annOption = doc.getElementById("dialog-type-annotations")!;
        annOption.dispatchEvent(
          new (w as any).MouseEvent("mousedown", { bubbles: true }),
        );
        await waitFor(
          () =>
            doc.documentElement.getAttribute("dialog-type") === "annotations"
              ? true
              : null,
          8000,
          "switched back to annotations mode",
        );

        // State preserved back in annotations mode:
        // - Toggle still checked
        // - Toggle restored inline (when wide)
        // - Preview column restored
        assert.isTrue(
          row.contains(toggle),
          "toggle back inline in wide annotations mode",
        );
        assert.isTrue(
          toggle.checked,
          "toggle remains checked when returning to annotations",
        );
        await waitFor(
          () => doc.getElementById("flexannotate-preview") || null,
          8000,
          "preview column restored in annotations mode",
        );
      } finally {
        Zotero.Prefs.set(`${prefs}.dialogOutlineView`, origOutline, true);
        win?.close();
      }
    });

    it("offers outline view and persistent toggle in the settings popup for works, inserts without preview", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const origOutline =
        Zotero.Prefs.get(`${prefs}.dialogOutlineView`, true) ?? false;
      const origPersist = api().persistentDialog.readPref();
      await closeDialogs();
      Zotero.Prefs.set(`${prefs}.dialogOutlineView`, false, true);
      api().persistentDialog.writePref(false);
      const work = Zotero.Items.get(workID) as Zotero.Item;
      work.addTag("§Einleitung");
      await work.saveTx();
      try {
        // Open in citation mode directly: isAddingAnnotations = false
        const io = makeIo();
        io.isAddingAnnotations = false;
        (Services.ww as any).openWindow(
          null,
          DIALOG_URL,
          "",
          "chrome,centerscreen,resizable=true",
          io,
        );
        const w = (await waitFor(() => findWindowByUrl(DIALOG_URL))) as Window;
        win = w;
        await waitFor(() => (w as any).DIALOG_STATE?.loaded || null);
        const doc = w.document;
        const popup = doc.getElementById("settings-popup")!;
        const settingsBtn = doc.getElementById(
          "settings-button",
        ) as HTMLElement;

        // Settings button is visible next to mode switch
        assert.isFalse(
          settingsBtn.hidden,
          "settings button visible in citation mode",
        );

        // Switches are in settings popup
        const toggle = (await waitFor(() =>
          doc.getElementById("flexannotate-toggle"),
        )) as HTMLInputElement;
        const persistToggle = doc.getElementById(
          "flexannotate-persistent-toggle",
        ) as HTMLInputElement;
        assert.isTrue(
          popup.contains(toggle),
          "outline toggle in settings popup",
        );
        assert.isTrue(
          popup.contains(persistToggle),
          "persistent toggle in settings popup",
        );

        // Persistent toggle changes pref
        persistToggle.click();
        assert.isTrue(
          api().persistentDialog.readPref(),
          "persistent pref enabled",
        );
        assert.isTrue(persistToggle.checked, "persistent toggle checked");

        // Turn on outline view for works
        toggle.click();
        await waitFor(
          () => doc.getElementById("flexannotate-tree") || null,
          8000,
          "tree active",
        );
        await waitFor(
          () => doc.getElementById("flexannotate-list-pane") || null,
          8000,
          "list pane active",
        );
        assert.isNull(
          doc.getElementById("flexannotate-preview"),
          "no preview column in citation mode",
        );

        // Heading shows count of works
        const einleitung = await waitFor(() =>
          Array.from(
            doc.querySelectorAll("#flexannotate-tree [data-node-id]"),
          ).find((n) => n.textContent?.includes("Einleitung")),
        );
        assert.match(
          einleitung.textContent || "",
          /1$/,
          "1 work under Einleitung",
        );

        // Work row is in list pane
        const workRow = await waitFor(() =>
          doc.querySelector(
            `#flexannotate-list-pane [data-ann-id="${workID}"]`,
          ),
        );
        assert.isNotNull(workRow, "work row displayed in list pane");

        // Inserting via plus button adds item to citation bubble-input
        const plus = workRow!.querySelector(
          ".flexannotate-plus",
        ) as HTMLElement;
        click(plus);
        await waitFor(
          () => doc.querySelectorAll("#bubble-input .bubble").length === 1,
          8000,
          "work added to citation bubbles",
        );
      } finally {
        work.removeTag("§Einleitung");
        await work.saveTx();
        api().persistentDialog.writePref(origPersist);
        Zotero.Prefs.set(`${prefs}.dialogOutlineView`, origOutline, true);
        win?.close();
      }
    });

    it("stop() closes the window and restores the patches, start() patches again", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const feature = api().persistentDialog.feature;
      const origPref = api().persistentDialog.readPref();
      const origDoc = integration.currentDoc;
      await closeDialogs();
      api().persistentDialog.writePref(true);
      try {
        const done = integration.displayDialog(
          DIALOG_URL,
          NATIVE_OPTIONS,
          makeIo(),
          "citation",
        ) as Promise<void>;
        const w = (await waitFor(() => findWindowByUrl(DIALOG_URL))) as Window;
        win = w;
        await waitFor(() => (w as any).DIALOG_STATE?.loaded || null);
        const patchedDD = integration.displayDialog;
        const patchedShow = integration.Progress.prototype.show;
        feature.stop();
        // die nativen Funktionen nach stop(): start() muss die Patches wieder anlegen
        const nativeDD = integration.displayDialog;
        const nativeShow = integration.Progress.prototype.show;
        try {
          assert.notStrictEqual(
            integration.displayDialog,
            patchedDD,
            "displayDialog restored",
          );
          assert.notStrictEqual(
            integration.Progress.prototype.show,
            patchedShow,
            "Progress.show restored",
          );
          await waitFor(
            () => (w.closed ? true : null),
            5000,
            "window closed by stop",
          );
          await done; // the pending request is released by the close
        } finally {
          feature.start();
        }
        assert.notStrictEqual(
          integration.displayDialog,
          nativeDD,
          "patched again",
        );
        assert.notStrictEqual(
          integration.Progress.prototype.show,
          nativeShow,
          "Progress.show patched again",
        );
      } finally {
        api().persistentDialog.writePref(origPref);
        integration.currentDoc = origDoc;
        win?.close();
      }
    });

    it("keeps the list scroll on select, cited mark and arrow keys; a new query starts at the top", async function () {
      const work = await makeWork("Scroll Werk");
      const att = await makePdfAttachment(work);
      const many: Zotero.Item[] = [];
      for (let i = 0; i < 30; i++)
        many.push(
          await makeAnnotation(
            att,
            `Scroll Zitat ${String(i).padStart(2, "0")}`,
            `${i + 1}`,
            i,
          ),
        );
      try {
        const { w, toggle } = await openDialog();
        win = w;
        const doc = w.document;
        if (!toggle.checked) toggle.click();
        const rows = () => [
          ...doc.querySelectorAll<HTMLElement>(
            "#flexannotate-list-pane [data-ann-id]",
          ),
        ];
        await waitFor(() => rows().length >= 30 || null);
        // the list pane is the host's second child (filter field first)
        const list = () =>
          doc.getElementById("flexannotate-list-pane")!
            .children[1] as HTMLElement;
        const filter = () =>
          doc.querySelector(
            "#flexannotate-list-pane input",
          ) as HTMLInputElement;
        assert.isAbove(list().scrollHeight, list().clientHeight, "overflows");

        list().scrollTop = 200;
        const top = list().scrollTop;
        assert.isAbove(top, 0, "scrolled down");

        // a click selects the row and keeps the scroll position
        click(rows()[25]);
        await waitFor(() => doc.getElementById("flexannotate-show-place"));
        assert.approximately(list().scrollTop, top, 1, "select keeps scroll");

        // the cited mark keeps it too
        click(rows()[26].querySelector(".flexannotate-check") as HTMLElement);
        await waitFor(() => rows()[26]?.querySelector(".flexannotate-cited"));
        assert.approximately(list().scrollTop, top, 1, "cited keeps scroll");

        // arrow keys keep the scroll and bring the new row into view
        const key = (k: string) =>
          doc.body.dispatchEvent(
            new (doc.defaultView as any).KeyboardEvent("keydown", {
              key: k,
              bubbles: true,
            }),
          );
        for (let i = 0; i < 6; i++) key("ArrowDown");
        const lr = list().getBoundingClientRect();
        const rr = rows()[31].getBoundingClientRect();
        assert.isAtLeast(rr.top, lr.top - 1, "arrow target below the top edge");
        assert.isAtMost(
          rr.bottom,
          lr.bottom + 1,
          "arrow target above the bottom edge",
        );
        assert.isAbove(list().scrollTop, 0, "arrow keeps scroll");
        key("ArrowUp");
        assert.isAbove(list().scrollTop, 0, "arrow up keeps scroll");

        // a new query starts at the top
        list().scrollTop = 200;
        filter().value = "Zitat 1";
        filter().dispatchEvent(new Event("input", { bubbles: true }));
        await waitFor(() => (rows().length < 30 ? true : null));
        assert.equal(list().scrollTop, 0, "query resets scroll");
      } finally {
        await closeDialogs();
        await Zotero.Items.erase(many.map((a) => a.id));
      }
    });

    it("keeps the stored rect of a browse and of a real request window while Zotero resizes them", async function () {
      this.timeout(60000);
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      const rect = { x: 220, y: 140, w: 520, h: 800 };
      await closeDialogs();
      api().persistentDialog.writePref(true);
      /** Samples the window every 100 ms for 5 s (Zotero resizes it after load). */
      const sample = async (getWin: () => Window | null) => {
        const samples: {
          t: number;
          w: number;
          h: number;
          x: number;
          y: number;
        }[] = [];
        let last: Window | null = null;
        const t0 = Date.now();
        while (Date.now() - t0 < 5000) {
          const w = getWin();
          if (w && !w.closed) {
            last = w;
            samples.push({
              t: Date.now() - t0,
              w: w.innerWidth,
              h: w.innerHeight,
              x: w.screenX,
              y: w.screenY,
            });
          }
          await Zotero.Promise.delay(100);
        }
        return { samples, last };
      };
      // Zotero's load-time minimum can still widen the window for up to ~0.3 s (10.0.6 ~0.14 s, 9.0.6 ~0.14 s); the pin corrects it afterwards
      const outside = (
        s: { t: number; w: number; h: number; x: number; y: number }[],
      ) =>
        s.filter(
          (p) =>
            p.t >= 300 &&
            (Math.abs(p.w - rect.w) > 2 ||
              Math.abs(p.h - rect.h) > 2 ||
              Math.abs(p.x - rect.x) > 4 ||
              Math.abs(p.y - rect.y) > 4),
        );
      try {
        // 1) browse window
        const bw = api().persistentDialog.openBrowse(rect);
        const b = await sample(() => bw);
        bw.close();
        assert.isAtLeast(b.samples.length, 30, "browse window was sampled");
        assert.deepEqual(
          outside(b.samples),
          [],
          `browse window left the rect: ${JSON.stringify(b.samples.slice(0, 12))}`,
        );
        await waitFor(() => (bw.closed ? true : null));

        // 2) real request window, opened at the rect of the tracked window
        const old = api().persistentDialog.openBrowse(rect);
        const done = integration.displayDialog(
          DIALOG_URL,
          NATIVE_OPTIONS,
          makeIo(),
          "citation",
        ) as Promise<void>;
        const r = await sample(
          () => dialogWindows().find((w) => w !== old && !w.closed) ?? null,
        );
        assert.isAtLeast(r.samples.length, 30, "request window was sampled");
        assert.deepEqual(
          outside(r.samples),
          [],
          `request window left the rect: ${JSON.stringify(r.samples.slice(0, 12))}`,
        );
        r.last?.close();
        await done;
      } finally {
        api().persistentDialog.writePref(origPref);
        integration.currentDoc = undefined;
        await closeDialogs();
      }
    });

    it("a browse window reopens with the geometry the user gave it, two cycles in a row", async function () {
      this.timeout(120000);
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      const origExec = integration.execCommand;
      await closeDialogs();
      api().persistentDialog.writePref(true);
      api().persistentDialog.rememberCommand({
        agent: "WinWord",
        docId: "Dokument1",
        templateVersion: 0,
      });
      const fakeDoc: string[] = [];
      integration.execCommand = async () => {
        const cmd = beginCommand();
        const io = makeIo();
        await integration.displayDialog(
          DIALOG_URL,
          NATIVE_OPTIONS,
          io,
          "citation",
        );
        await Zotero.Promise.delay(300);
        fakeDoc.push(
          ...io.citation.citationItems.map((i: any) => String(i.id)),
        );
        await cmd.end();
      };
      const geo = (w: Window) => ({
        x: w.screenX,
        y: w.screenY,
        iw: w.innerWidth,
        ih: w.innerHeight,
        ow: w.outerWidth,
        oh: w.outerHeight,
      });
      let bw = api().persistentDialog.openBrowse({
        x: 220,
        y: 140,
        w: 520,
        h: 800,
      });
      const targets = [
        { x: 260, y: 170, w: 1000, h: 640 },
        { x: 180, y: 120, w: 900, h: 700 },
      ];
      try {
        for (const [n, target] of targets.entries()) {
          // the pin is over after 5 s: a resize from here on is the user's
          await Zotero.Promise.delay(5500);
          const chrome = {
            w: bw.outerWidth - bw.innerWidth,
            h: bw.outerHeight - bw.innerHeight,
          };
          bw.resizeTo(target.w + chrome.w, target.h + chrome.h);
          bw.moveTo(target.x, target.y);
          await waitFor(
            () => (bw.innerWidth === target.w ? true : null),
            3000,
            `user resize ${n}`,
          );
          await Zotero.Promise.delay(300);
          const before = geo(bw);
          // accept from the browse window: one citation, the command runs, the window comes back
          const io = (bw as any).arguments[0].wrappedJSObject;
          io.citation.citationItems = [{ id: anns[n].id }];
          io.accept();
          const next = (await waitFor(
            () => dialogWindows().find((w) => w !== bw && !w.closed) ?? null,
            8000,
            "reopened browse window",
          )) as Window;
          const samples: ReturnType<typeof geo>[] = [];
          for (let i = 0; i < 30; i++) {
            samples.push(geo(next));
            await Zotero.Promise.delay(100);
          }
          // the first 300 ms: the opening frame (features size, before the pin's first correction)
          for (const s of samples.slice(3)) {
            assert.approximately(s.iw, before.iw, 2, "inner width");
            assert.approximately(s.ih, before.ih, 2, "inner height");
            assert.approximately(
              s.ow,
              before.ow,
              4,
              "outer width, no frame growth",
            );
            assert.approximately(
              s.oh,
              before.oh,
              4,
              "outer height, no frame growth",
            );
            assert.approximately(s.x, before.x, 4, "x");
            assert.approximately(s.y, before.y, 4, "y");
          }
          bw = next;
        }
        assert.lengthOf(
          fakeDoc,
          2,
          "both citations went into the fake document",
        );
      } finally {
        integration.execCommand = origExec;
        api().persistentDialog.writePref(origPref);
        await closeDialogs();
      }
    });

    it("the first persistent window after a restart opens at the stored rect; off-screen keeps the size, invalid falls back", async function () {
      this.timeout(90000);
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      const key = `${prefs}.persistentWindowRect`;
      const origRect = Zotero.Prefs.get(key, true);
      const area = (Zotero.getMainWindow() as any).screen;
      /** One persistent request with the pref set to `value`; returns the dialog window. */
      const openWith = async (value: string) => {
        Zotero.Prefs.set(key, value, true);
        const done = integration.displayDialog(
          DIALOG_URL,
          NATIVE_OPTIONS,
          makeIo(),
          "citation",
        ) as Promise<void>;
        const w = (await waitFor(() => findWindowByUrl(DIALOG_URL))) as Window;
        await waitFor(() => (w as any).DIALOG_STATE?.loaded || null);
        return { w, done };
      };
      await closeDialogs();
      api().persistentDialog.writePref(true);
      try {
        // 1) on screen: size and position are taken; a move is remembered
        const x = area.availLeft + 100;
        const y = area.availTop + 80;
        let { w, done } = await openWith(
          JSON.stringify({ x, y, w: 600, h: 720 }),
        );
        await Zotero.Promise.delay(2500);
        assert.approximately(w.innerWidth, 600, 2, "stored width");
        assert.approximately(w.innerHeight, 720, 2, "stored height");
        assert.approximately(w.screenX, x, 4, "stored x");
        assert.approximately(w.screenY, y, 4, "stored y");
        // the pin holds the place for 5 s; after that the user's move is kept and remembered
        await Zotero.Promise.delay(3000);
        w.moveTo(x + 40, y + 30);
        await Zotero.Promise.delay(1500);
        const saved = JSON.parse(Zotero.Prefs.get(key, true) as string);
        assert.approximately(saved.x, x + 40, 4, "remembered x");
        assert.approximately(saved.y, y + 30, 4, "remembered y");
        w.close();
        await done;

        // 2) off screen: the size is kept, the OS places the window
        const offX = area.availLeft + area.availWidth + 5000;
        ({ w, done } = await openWith(
          JSON.stringify({ x: offX, y, w: 600, h: 720 }),
        ));
        await Zotero.Promise.delay(2500);
        assert.approximately(w.innerWidth, 600, 2, "size kept off screen");
        assert.isBelow(
          w.screenX,
          area.availLeft + area.availWidth,
          "not placed off screen",
        );
        w.close();
        await done;

        // 3) invalid value: the normal default window opens
        // a valid position but a non-number width: the stored value is not used at all
        ({ w, done } = await openWith('{"x":5,"y":5,"w":"700","h":500}'));
        await Zotero.Promise.delay(1000);
        assert.isAbove(
          Math.abs(w.innerWidth - 700),
          2,
          "invalid width not used",
        );
        assert.isAbove(Math.abs(w.screenX - 5), 4, "invalid position not used");
        w.close();
        await done;
      } finally {
        api().persistentDialog.writePref(origPref);
        Zotero.Prefs.set(key, origRect as string, true);
        await closeDialogs();
      }
    });

    it("a persistent window moved by the user after the load phase stays where it was moved (browse and request)", async function () {
      this.timeout(90000);
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      await closeDialogs();
      api().persistentDialog.writePref(true);
      /** Moves `w` to (x, y) after the load phase and samples its position for 1 s. */
      const moveAndSample = async (w: Window, x: number, y: number) => {
        w.moveTo(x, y);
        await waitFor(
          () => (Math.abs(w.screenX - x) <= 4 ? true : null),
          4000,
          "move to settle",
        );
        const seen: { x: number; y: number }[] = [];
        for (let i = 0; i < 10; i++) {
          seen.push({ x: w.screenX, y: w.screenY });
          await Zotero.Promise.delay(100);
        }
        return seen;
      };
      try {
        // browse window
        const bw = api().persistentDialog.openBrowse({
          x: 120,
          y: 50,
          w: 520,
          h: 600,
        });
        await waitFor(() => (bw as any).DIALOG_STATE?.loaded || null);
        await Zotero.Promise.delay(2000);
        const bx = bw.screenX + 60;
        const by = bw.screenY + 40;
        const seenB = await moveAndSample(bw, bx, by);
        for (const p of seenB) {
          assert.approximately(p.x, bx, 4, "browse x after the move");
          assert.approximately(p.y, by, 4, "browse y after the move");
        }
        bw.close();
        await waitFor(() => (bw.closed ? true : null));

        // real request window
        const done = integration.displayDialog(
          DIALOG_URL,
          NATIVE_OPTIONS,
          makeIo(),
          "citation",
        ) as Promise<void>;
        const w = (await waitFor(
          () => dialogWindows().find((x) => !x.closed) ?? null,
        )) as Window;
        await waitFor(() => (w as any).DIALOG_STATE?.loaded || null);
        await Zotero.Promise.delay(2000);
        const tx = w.screenX + 60;
        const ty = w.screenY + 40;
        const seenR = await moveAndSample(w, tx, ty);
        for (const p of seenR) {
          assert.approximately(p.x, tx, 4, "request x after the move");
          assert.approximately(p.y, ty, 4, "request y after the move");
        }
        w.close();
        await done;
      } finally {
        api().persistentDialog.writePref(origPref);
        await closeDialogs();
      }
    });

    it("a browse insert that fails before the command reaches the dialog leaves one browse window of the full size", async function () {
      this.timeout(60000);
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      const origExec = integration.execCommand;
      await closeDialogs();
      api().persistentDialog.writePref(true);
      api().persistentDialog.rememberCommand({
        agent: "WinWord",
        docId: "Dokument1",
        templateVersion: 0,
      });
      // the command fails before displayDialog (e.g. the cursor is inside a field)
      integration.execCommand = async () => {
        throw new Error("cannot insert here (test)");
      };
      const rect = { x: 230, y: 150, w: 520, h: 800 };
      try {
        const bw = api().persistentDialog.openBrowse(rect);
        await waitFor(() => (bw as any).DIALOG_STATE?.loaded || null);
        await Zotero.Promise.delay(2000);
        const io = (bw as any).arguments[0].wrappedJSObject;
        io.citation.citationItems = [{ id: anns[0].id }];
        io.accept();
        await Zotero.Promise.delay(2000);
        const open = dialogWindows().filter((w) => !w.closed);
        assert.lengthOf(open, 1, "exactly one browse window afterwards");
        assert.notStrictEqual(
          open[0],
          bw,
          "a new window, not the collapsed one",
        );
        assert.approximately(open[0].innerWidth, rect.w, 4, "full width");
        assert.approximately(open[0].innerHeight, rect.h, 4, "full height");
      } finally {
        integration.execCommand = origExec;
        api().persistentDialog.writePref(origPref);
        await closeDialogs();
      }
    });

    it("the browse window gets the session's cited works, so the green checks can show", async function () {
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: { "4242": [] },
      };
      const origPref = api().persistentDialog.readPref();
      await closeDialogs();
      try {
        const bw = api().persistentDialog.openBrowse({
          x: 240,
          y: 160,
          w: 520,
          h: 800,
        });
        const io = (bw as any).arguments[0].wrappedJSObject;
        const loaded = (await io.allCitedDataLoadedPromise) as unknown[];
        assert.property(
          loaded[1] as object,
          "4242",
          "session citations reach the browse io",
        );
        bw.close();
      } finally {
        (Zotero as any).Integration.currentSession = {
          sessionID: "T1",
          citationsByItemID: {},
        };
        api().persistentDialog.writePref(origPref);
        await closeDialogs();
      }
    });

    it("no browse window for http (Google Docs: re-running the command would hang the server)", async function () {
      this.timeout(60000);
      (Zotero as any).Integration.currentSession = {
        sessionID: "T1",
        citationsByItemID: {},
      };
      const integration = Zotero.Integration as any;
      const origPref = api().persistentDialog.readPref();
      await closeDialogs();
      api().persistentDialog.writePref(true);
      api().persistentDialog.rememberCommand({
        agent: "http",
        docId: "Dokument1",
        templateVersion: 0,
      });
      try {
        const io = makeIo();
        io.citation.citationItems = [{ id: anns[0].id }];
        const done = integration.displayDialog(
          DIALOG_URL,
          NATIVE_OPTIONS,
          io,
          "citation",
        ) as Promise<void>;
        const dw = await waitFor(
          () => dialogWindows().find((w) => !w.closed) ?? null,
        );
        await waitFor(() => (dw as any).DIALOG_STATE?.loaded || null);
        const pcb = dw.document.getElementById(
          "flexannotate-persistent-toggle",
        ) as HTMLInputElement | null;
        if (pcb) {
          assert.isTrue(
            pcb.hidden,
            "persistent checkbox is hidden for agent http (Google Docs)",
          );
        }
        io.accept();
        await done;
        await Zotero.Promise.delay(1500);
        assert.lengthOf(
          dialogWindows().filter((w) => !w.closed),
          0,
          "no browse window",
        );
      } finally {
        api().persistentDialog.writePref(origPref);
        await closeDialogs();
      }
    });

    for (const agent of ["WinWord", "LibreOffice", "MacWord"]) {
      it(`a browse window opens after an insert for ${agent}`, async function () {
        this.timeout(60000);
        (Zotero as any).Integration.currentSession = {
          sessionID: "T1",
          citationsByItemID: {},
        };
        const integration = Zotero.Integration as any;
        const origPref = api().persistentDialog.readPref();
        const origDoc = integration.currentDoc;
        await closeDialogs();
        api().persistentDialog.writePref(true);
        api().persistentDialog.rememberCommand({
          agent,
          docId: "Dokument1",
          templateVersion: 0,
        });
        try {
          // the real request for `agent`: after accept the browse window comes back
          const io1 = makeIo();
          const w1 = await firstInsert(io1, { x: 0, y: 0, w: 0, h: 0 });
          const bw = await browseWindow(w1);
          win = bw;
          await waitFor(
            () => (bw as any).DIALOG_STATE?.loaded || null,
            8000,
            "browse loaded",
          );
          assert.isFalse(bw.closed, `a browse window opened for ${agent}`);
        } finally {
          api().persistentDialog.writePref(origPref);
          integration.currentDoc = origDoc;
          win?.close();
          await closeDialogs();
        }
      });
    }

    it("browse mode is detected where Zotero has the addAnnotation command", function () {
      assert.strictEqual(
        api().persistentDialog.supported(),
        typeof (Zotero as any).Integration?.Interface?.prototype
          ?.addAnnotation === "function",
      );
    });
  });

  // ── heading tags anchored to the outline note ─────────────────────────────
  // Jede Überschrift bekommt einen `§`-Tag auf der Gliederungsnotiz, damit der
  // Tag in der Bibliothek existiert und in der Tag-Zeile der PDF-Ansicht
  // vorgeschlagen wird — auch ohne zugeordnete Items. Beim Umbenennen/Löschen
  // wird er nachgeführt. Die Notiz selbst zählt nie als zugeordnetes Item.
  describe("heading tags synced to the outline note", function () {
    let noteID: number | null = null;
    let tags: () => string[];

    before(async function () {
      const model = api().outlineModel.OutlineModel;
      const core = api().outline;
      const m1 = core.makeNode("M1 Sync");
      const m2 = core.makeNode("M2 Sync");
      m1.children.push(m2);
      noteID = await model.save(libraryID(), null, [m1]);
      tags = () =>
        (Zotero.Items.get(noteID!) as Zotero.Item)
          .getTags()
          .map((t: { tag: string }) => t.tag);
    });

    after(async function () {
      if (noteID) (Zotero.Items.get(noteID) as Zotero.Item)?.eraseTx?.();
    });

    it("anchors a §-tag for every heading (even without filed items)", function () {
      assert.includeMembers(tags(), ["§M1 Sync", "§M2 Sync"]);
      assert.include(tags(), "★outline", "the marker tag is kept");
    });

    it("does not count the outline note itself as a filed item", async function () {
      const model = api().outlineModel.OutlineModel;
      // no annotation is filed under these headings, so gather is empty …
      assert.lengthOf(await model.gather(libraryID(), "§M1 Sync"), 0);
      // … and buildCountMap must not see the note's anchored tags
      const counts = await model.buildCountMap(libraryID());
      assert.isFalse(
        counts.has("§M1 Sync"),
        "the §-tag only lives on the outline note, so it counts as 0",
      );
    });

    it("follows a rename: old tag is removed, new tag is added", async function () {
      const model = api().outlineModel.OutlineModel;
      const roots = (await model.load(libraryID())).roots;
      roots[0].title = "M1 Sync umbenannt";
      noteID = await model.save(libraryID(), noteID, roots);
      assert.include(tags(), "§M1 Sync umbenannt");
      assert.notInclude(tags(), "§M1 Sync");
    });

    it("removes the tag when its heading is deleted", async function () {
      const model = api().outlineModel.OutlineModel;
      const roots = (await model.load(libraryID())).roots;
      roots[0].children = [];
      noteID = await model.save(libraryID(), noteID, roots);
      assert.notInclude(tags(), "§M2 Sync");
      assert.include(tags(), "§M1 Sync umbenannt");
    });

    it("backfills §-tags on load for a note created before the sync existed", async function () {
      // Simuliert eine Bestands-Notiz: Bauminhalt + ★outline, aber noch keine
      // §-Tags (von einer Version vor der §-Tag-Synchronisierung angelegt).
      const core = api().outline;
      const model = api().outlineModel.OutlineModel;
      const oldNote = new Zotero.Item("note");
      oldNote.libraryID = libraryID();
      oldNote.setNote(
        api().outline.serializeOutline([core.makeNode("Alt Eins")]),
      );
      oldNote.addTag("★outline");
      await oldNote.saveTx({ skipSelect: true });
      try {
        await model.load(libraryID());
        const loaded = Zotero.Items.get(oldNote.id) as Zotero.Item;
        assert.include(
          loaded.getTags().map((t: { tag: string }) => t.tag),
          "§Alt Eins",
          "loading the tree pulls the missing §-tag onto the pre-existing note",
        );
      } finally {
        await (Zotero.Items.get(oldNote.id) as Zotero.Item).eraseTx?.();
      }
    });

    it("names the library-wide note after the library", async function () {
      const model = api().outlineModel.OutlineModel;
      const lib = Zotero.Libraries.get(libraryID()) as { name: string } | false;
      const libraryName = lib ? lib.name : "Meine Bibliothek";
      const loaded = await model.load(libraryID());
      const note = Zotero.Items.get(loaded.noteID!) as Zotero.Item;
      const html = note.getNote();
      const heading = api().outline.outlineHeadingOf(html);
      assert.match(
        heading,
        new RegExp(`${libraryName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
        "the note heading carries the exact library name",
      );
    });

    it("titles a collection tree by its main collection", async function () {
      const model = api().outlineModel.OutlineModel;
      const label = api().organizerStrings.tr("outlineTitle");
      const col = new Zotero.Collection({
        name: "Meine Thesen",
        libraryID: libraryID(),
      } as any);
      await col.saveTx();
      try {
        const colID = await model.save(libraryID(), null, [], col.key);
        const note = Zotero.Items.get(colID) as Zotero.Item;
        assert.match(
          note.getNote(),
          new RegExp(`${label} — Meine Thesen`),
          "the collection tree note is named after the main collection",
        );
        // load resolves the heading back from the key (rename survives reload)
        const reloaded = await model.load(libraryID(), col.key);
        const reloadedNote = Zotero.Items.get(reloaded.noteID!) as Zotero.Item;
        assert.match(
          reloadedNote.getNote(),
          new RegExp(`${label} — Meine Thesen`),
        );
      } finally {
        await col.eraseTx();
      }
    });

    it("backfills the heading for an old note on load", async function () {
      const core = api().outline;
      const model = api().outlineModel.OutlineModel;
      const label = api().organizerStrings.tr("outlineTitle");
      const oldNote = new Zotero.Item("note");
      oldNote.libraryID = libraryID();
      // alte Notiz: Überschrift ohne Geltungsbereich und mit anderem Label
      oldNote.setNote(
        core.serializeOutline([core.makeNode("Titel Alt")], null, "Anything"),
      );
      oldNote.addTag("★outline");
      await oldNote.saveTx({ skipSelect: true });
      try {
        await model.load(libraryID());
        const loaded = Zotero.Items.get(oldNote.id) as Zotero.Item;
        assert.match(
          loaded.getNote(),
          new RegExp(`${label} — `),
          "the heading is rewritten to include the localized label and the library name",
        );
        assert.notMatch(
          loaded.getNote(),
          /<h1>📚 FlexAnnotate — Anything<\/h1>/,
        );
      } finally {
        await (Zotero.Items.get(oldNote.id) as Zotero.Item).eraseTx?.();
      }
    });
  });
});
