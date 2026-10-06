import { assert } from "chai";
import { config } from "../package.json";

/**
 * Integration tests inside a real Zotero (scaffold test profile with its own
 * dataDir). All data is synthetic and removed again in `after`.
 */

const created: Zotero.Item[] = [];
let workCounter = 0;

async function makeWork(title: string): Promise<Zotero.Item> {
  const item = new Zotero.Item("book");
  item.libraryID = Zotero.Libraries.userLibraryID;
  item.setField("title", title);
  // A fresh creator per work: Zotero purges orphaned creators on erase and a
  // cached creator ID would otherwise be "not found" in the next suite.
  item.setCreators([
    {
      firstName: "Erika",
      lastName: `Muster${++workCounter}`,
      creatorType: "author",
    },
  ]);
  item.setField("date", "2020");
  await item.saveTx();
  created.push(item);
  return item;
}

async function makePdfAttachment(parent: Zotero.Item): Promise<Zotero.Item> {
  const path = PathUtils.join(PathUtils.tempDir, `annotree-${parent.key}.pdf`);
  await IOUtils.writeUTF8(path, "%PDF-1.4\n%%EOF\n");
  const att = await Zotero.Attachments.linkFromFile({
    file: path,
    parentItemID: parent.id,
    contentType: "application/pdf",
  });
  created.push(att);
  return att;
}

async function makeAnnotation(
  att: Zotero.Item,
  text: string,
  page: string,
  index: number,
): Promise<Zotero.Item> {
  const a = new Zotero.Item("annotation");
  a.libraryID = att.libraryID;
  a.parentID = att.id;
  a.annotationType = "highlight";
  a.annotationText = text;
  a.annotationComment = "";
  a.annotationColor = "#ffd400";
  a.annotationPageLabel = page;
  a.annotationSortIndex = `00000|${String(index).padStart(6, "0")}|00000`;
  a.annotationPosition = JSON.stringify({
    pageIndex: 0,
    rects: [[0, 0, 10, 10]],
  });
  await a.saveTx();
  return a;
}

describe("organizer data and filing", function () {
  this.timeout(60000);
  let work: Zotero.Item;
  const annotations: Zotero.Item[] = [];
  let libraryID: number;

  before(async function () {
    libraryID = Zotero.Libraries.userLibraryID;
    work = await makeWork("Annotree Testwerk");
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

function findOrganizerWindow(): Window | null {
  const en = Services.wm.getEnumerator(null);
  while (en.hasMoreElements()) {
    const w = en.getNext() as Window;
    if (w.document?.getElementById("annotree-root")) return w;
  }
  return null;
}

async function waitFor<T>(fn: () => T | null | false, ms = 15000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await Zotero.Promise.delay(100);
  }
  throw new Error("waitFor timed out");
}

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
    dt.setData("text/x-annotree-ids", JSON.stringify(ids));
    target.dispatchEvent(
      new (win as any).DragEvent("drop", { bubbles: true, dataTransfer: dt }),
    );
    await waitFor(() =>
      mine
        .slice(1)
        .every((a) => a.getTags().some((t) => t.tag === "§Einleitung")),
    );
  });
});

async function screenshot(win: Window, name: string): Promise<void> {
  const doc = win.document;
  const canvas = doc.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "canvas",
  ) as HTMLCanvasElement;
  canvas.width = win.innerWidth;
  canvas.height = win.innerHeight;
  const ctx = canvas.getContext("2d") as any;
  ctx.drawWindow(win, 0, 0, canvas.width, canvas.height, "white");
  const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!)));
  const dir = PathUtils.join(PathUtils.parent(PathUtils.profileDir)!, "shots");
  await IOUtils.makeDirectory(dir, { ignoreExisting: true });
  await IOUtils.write(
    PathUtils.join(dir, `${name}.png`),
    new Uint8Array(await blob.arrayBuffer()),
  );
}

function findWindowByUrl(url: string): Window | null {
  const en = Services.wm.getEnumerator("");
  while (en.hasMoreElements()) {
    const w = en.getNext() as Window;
    if (w.location?.href === url) return w;
  }
  return null;
}

describe("citation dialog (as opened from Word)", function () {
  this.timeout(120000);
  const mine: Zotero.Item[] = [];
  let noteID: number;
  let win: Window | null = null;
  const URL = "chrome://zotero/content/integration/citationDialog.xhtml";

  before(async function () {
    const libraryID = Zotero.Libraries.userLibraryID;
    // The dialog needs the CSL locales (Zotero.Styles.locales) for locators.
    await Zotero.Styles.init();
    const work = await makeWork("Dialog Testwerk");
    const att = await makePdfAttachment(work);
    for (let i = 0; i < 3; i++) {
      mine.push(await makeAnnotation(att, `Dialogzitat ${i}`, `${i}`, i));
    }
    const core = Zotero[config.addonInstance].api.outline;
    const roots = [core.makeNode("Einleitung"), core.makeNode("Hauptteil")];
    noteID = await Zotero[
      config.addonInstance
    ].api.outlineModel.OutlineModel.save(libraryID, null, roots);
    await Zotero[config.addonInstance].api.organizerData.fileMany(
      [mine[0].id, mine[1].id],
      "§Einleitung",
    );
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

  it("offers the outline option and groups annotations by heading", async function () {
    const io: any = new (Zotero.Integration as any).CitationEditInterface(
      { citationItems: [], properties: {}, citationID: "annotree-test" },
      true,
      Promise.resolve(0),
      Promise.resolve({}),
      async () => "",
    );
    io.isCitingNotes = false;
    io.isAddingAnnotations = true;
    io.sort = () => {};
    io.getItems = () => [];
    (Services.ww as any).openWindow(
      null,
      URL,
      "",
      "chrome,centerscreen,resizable=true",
      io,
    );
    win = await waitFor(() => findWindowByUrl(URL));
    const doc = win.document;
    const toggle = (await waitFor(() =>
      doc.getElementById("annotree-toggle"),
    )) as HTMLInputElement;
    await screenshot(win, "dialog-native");
    toggle.click();
    const view = await waitFor(() => {
      const v = doc.getElementById("annotree-outline");
      return v && v.querySelectorAll("annotation-row").length >= 2 ? v : null;
    });
    await Zotero.Promise.delay(500);
    await screenshot(win, "dialog-outline");
    const heads = Array.from(view.querySelectorAll(".annotree-heading")).map(
      (h) => h.textContent,
    );
    assert.deepEqual(heads, ["1  Einleitung"]);
    assert.lengthOf(view.querySelectorAll("annotation-row"), 2);
    // the native "+" still adds the annotation to the citation
    const plus = view.querySelector(".zotero-clicky-plus") as HTMLElement;
    assert.ok(plus, "plus button present on our rows");
    plus.click();
    await waitFor(
      () => doc.querySelectorAll("#bubble-input .bubble").length === 1,
    );
    await screenshot(win, "dialog-added");
    // switching the option off restores Zotero's own layout
    toggle.click();
    await waitFor(() => !doc.getElementById("annotree-outline"));
    assert.notEqual(
      (doc.getElementById("item-tree-container") as HTMLElement).style.display,
      "none",
    );
  });

  it("shows the works behind the annotations only when the setting is on", async function () {
    const doc = win!.document;
    const prefKey = `${config.prefsPrefix}.showWorksInAnnotationView`;
    assert.isFalse(Zotero.Prefs.get(prefKey, true), "default is off");
    const workID = (mine[0].parentItem as Zotero.Item).parentID as number;
    await Zotero[config.addonInstance].api.organizerData.fileMany(
      [workID],
      "§Hauptteil",
    );
    const toggle = doc.getElementById("annotree-toggle") as HTMLInputElement;
    const headsOf = () =>
      Array.from(doc.querySelectorAll("#annotree-outline .annotree-heading"))
        .map((h) => h.textContent)
        .join("|");

    // setting off: the work's own annotations are not pulled in
    toggle.click();
    await waitFor(() => headsOf() === "1  Einleitung");
    toggle.click();
    await waitFor(() => !doc.getElementById("annotree-outline"));

    // setting on: the annotations of the work filed under "Hauptteil" appear
    Zotero.Prefs.set(prefKey, true, true);
    try {
      toggle.click();
      await waitFor(() => headsOf() === "1  Einleitung|2  Hauptteil");
      const groups = doc.querySelectorAll("#annotree-outline .annotree-group");
      assert.lengthOf(groups[1].querySelectorAll("annotation-row"), 3);
      await screenshot(win!, "dialog-works-shown");
    } finally {
      Zotero.Prefs.set(prefKey, false, true);
    }
  });
});
