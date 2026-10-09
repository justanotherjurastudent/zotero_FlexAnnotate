import { assert } from "chai";
import { config } from "../package.json";
import {
  cleanup,
  click,
  findOrganizerWindow,
  findWindowByUrl,
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
      await Zotero.Promise.delay(50);
    };
    const focused = async (input: HTMLElement) =>
      waitFor(() => doc.activeElement === input);
    const outline = async () =>
      (await api().outlineModel.OutlineModel.load(libraryID())).roots;
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

      await api().OrganizerFactory.open();
      win = await waitFor(findOrganizerWindow);
      doc = win.document;
      // Zotero selects a new collection in its main window, so the organizer
      // starts with that collection (the default scope) and its sub: 2 rows.
      await waitFor(() => rowCount() === 2);
      const scopeSel = doc.getElementById(
        "flexannotate-scope",
      ) as HTMLSelectElement;
      const selected = (
        Zotero.getMainWindow() as any
      ).ZoteroPane.getSelectedCollection();
      assert.equal(
        scopeSel.dataset.value,
        String(selected.id),
        "default scope is the collection selected in Zotero",
      );
    });

    after(async function () {
      win?.close();
      (Zotero.Items.get(noteID) as Zotero.Item)?.eraseTx?.();
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
          `rename not saved: mem=${JSON.stringify(st.roots)} saved=${JSON.stringify(await outline())} renaming=${st.renaming} notes=${JSON.stringify(
            await (async () => {
              const s = new Zotero.Search();
              (s as any).libraryID = libraryID();
              s.addCondition("tag", "is", "★outline");
              const items = await Zotero.Items.getAsync(await s.search());
              return items.map((i: Zotero.Item) => [
                i.id,
                i.dateModified,
                i.getNote().slice(-260),
              ]);
            })(),
          )}`,
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
        throw new Error(
          `move failed: node=${st.node} col=${st.focusCol} renaming=${st.renaming} roots=${st.roots.map((r: any) => r.title)} saved=${(await outline()).map((r: any) => r.title)}`,
          { cause: e },
        );
      }

      // Entf löscht die Überschrift (Rückfrage wird bestätigt)
      const factory = api().OrganizerFactory;
      const original = factory.confirm;
      factory.confirm = () => true;
      try {
        mousedown(nodeEl("Alpha")!);
        click(nodeEl("Alpha")!);
        await waitFor(() => nodeEl("Alpha"));
        key(doc, "Delete");
        await waitForAsync(async () =>
          (await outline()).every((n: any) => n.title !== "Alpha")
            ? true
            : null,
        );
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
      assert.equal(rowCount(), 2, "current collection to begin with");
      await set(root.id); // includes subcollections by default
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
      const btn = buttonWith(/Als Notiz exportieren|Export as note/)!;
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
          await i.loadAllData();
          if (re.test(i.getNote())) return i;
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
      assert.isFalse(tags.some((t) => t.startsWith("annotree:locator=")));
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
      assert.isFalse(tags.some((t) => t.startsWith("annotree:locator=")));
    });
  });

  // ── Word dialog ───────────────────────────────────────────────────────────
  describe("citation dialog (as opened from Word)", function () {
    let noteID: number;
    let workID: number;
    const anns: Zotero.Item[] = [];
    let win: Window | null = null;

    /** Close dialogs from earlier steps so we never pick up a stale one. */
    const closeDialogs = async () => {
      let w: Window | null;
      while ((w = findWindowByUrl(DIALOG_URL))) {
        const old = w;
        old.close();
        await waitFor(() => findWindowByUrl(DIALOG_URL) !== old);
      }
    };

    const openDialog = async (cited: Record<string, unknown> = {}) => {
      await closeDialogs();
      const io: any = new (Zotero.Integration as any).CitationEditInterface(
        { citationItems: [], properties: {}, citationID: "flexannotate-test" },
        true,
        Promise.resolve(0),
        // Zotero loads the document's citations after the dialog opened
        Zotero.Promise.delay(300).then(() => cited),
        async () => "",
      );
      io.isCitingNotes = false;
      io.isAddingAnnotations = true;
      io.sort = () => {};
      io.getItems = () => [];
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
            .length === 2,
      );
      // left column keeps showing categories, native trees are hidden
      assert.equal(
        w.getComputedStyle(doc.getElementById("zotero-items-tree")!).display,
        "none",
      );

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
            .length === 2,
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
        await Zotero.Promise.delay(200); // layout settles
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
          rows().length === 1 &&
          rows()[0].getAttribute("data-ann-id") === String(anns[0].id),
      );
      assert.equal(bar().value, "Sehr langes", "search bar untouched");

      // emptying the search bar shows everything again
      type(bar(), "");
      await waitFor(() => rows().length === 2 && filter()?.value === "");
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
            .length === 2,
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
        await waitFor(() => calls.length || null);
        await Zotero.Promise.delay(200);
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
  });
});
