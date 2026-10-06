import { assert } from "chai";
import { config } from "../package.json";

/**
 * Integration tests inside a real Zotero (scaffold test profile with its own
 * dataDir). All data is synthetic and removed again in `after`.
 */

const created: Zotero.Item[] = [];

async function makeWork(title: string): Promise<Zotero.Item> {
  const item = new Zotero.Item("book");
  item.libraryID = Zotero.Libraries.userLibraryID;
  item.setField("title", title);
  item.setCreators([
    { firstName: "Erika", lastName: "Muster", creatorType: "author" },
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
