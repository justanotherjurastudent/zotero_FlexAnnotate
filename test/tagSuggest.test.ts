import { assert } from "chai";
import { config } from "../package.json";
import {
  cleanup,
  created,
  makeAnnotation,
  makePdfAttachment,
  makeWork,
} from "./helpers";

const api = () => (Zotero as any)[config.addonInstance].api;
const modePref = `${config.prefsPrefix}.outlineTagSuggest`;

/** Executes zotero search with a dummy listener and returns value/label per row. */
async function suggest(
  typed: string,
  itemID: number,
  libraryID = Zotero.Libraries.userLibraryID,
): Promise<{ value: string; label: string }[]> {
  const svc = api().tagSuggest.service();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`suggest timed out after 10000ms for "${typed}"`));
    }, 10000);
    const listener = {
      onSearchResult(_search: unknown, result: any) {
        try {
          if (
            result.searchResult ===
            Ci.nsIAutoCompleteResult.RESULT_SUCCESS_ONGOING
          )
            return;
          clearTimeout(timer);
          const rows = [];
          for (let i = 0; i < result.matchCount; i++) {
            rows.push({
              value: result.getValueAt(i),
              label: result.getLabelAt(i),
            });
          }
          resolve(rows);
        } catch (e) {
          clearTimeout(timer);
          reject(e);
        }
      },
    };
    const params = JSON.stringify({ fieldName: "tag", libraryID, itemID });
    Promise.resolve(svc.startSearch(typed, params, null, listener)).catch(
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

describe("tagSuggest", function () {
  this.timeout(60000);

  let col: Zotero.Collection;
  let sub: Zotero.Collection;
  let plainCol: Zotero.Collection;
  let ann: Zotero.Item;
  let plainAnn: Zotero.Item;
  let lib: number;

  before(async function () {
    lib = Zotero.Libraries.userLibraryID;
    col = new Zotero.Collection({
      name: "TagSuggest Haupt",
      libraryID: lib,
    } as any);
    await col.saveTx();
    sub = new Zotero.Collection({
      name: "TagSuggest Unter",
      libraryID: lib,
      parentID: col.id,
    } as any);
    await sub.saveTx();
    plainCol = new Zotero.Collection({
      name: "TagSuggest Ohne Baum",
      libraryID: lib,
    } as any);
    await plainCol.saveTx();

    // Tree order deliberately differs from alphabetical: Zeta before Alpha
    const { makeNode } = api().outline;
    const noteID = await api().outlineModel.OutlineModel.save(
      lib,
      null,
      [makeNode("TsZeta"), makeNode("TsAlpha")],
      col.key,
    );
    created.push(Zotero.Items.get(noteID) as Zotero.Item);

    const work = await makeWork("TagSuggest Werk");
    work.addToCollection(sub.id);
    await work.saveTx();
    ann = await makeAnnotation(await makePdfAttachment(work), "Zitat", "1", 0);

    const plainWork = await makeWork("TagSuggest Werk ohne Baum");
    plainWork.addToCollection(plainCol.id);
    await plainWork.saveTx();
    plainAnn = await makeAnnotation(
      await makePdfAttachment(plainWork),
      "Zitat",
      "1",
      0,
    );

    // A §-tag that belongs to no outline in the main collection
    const other = await makeWork("TagSuggest Fremdwerk");
    other.addTag("§TsFremd");
    await other.saveTx();
  });

  after(async function () {
    Zotero.Prefs.clear(modePref, true);
    await cleanup();
    for (const c of [sub, col, plainCol]) {
      try {
        await c.eraseTx();
      } catch {
        // schon weg
      }
    }
  });

  afterEach(function () {
    Zotero.Prefs.clear(modePref, true);
  });

  it("patches startSearch on the registered service and restores it", function () {
    const svc = api().tagSuggest.service();
    assert.isTrue(api().tagSuggest.isPatched());
    assert.isTrue(Object.prototype.hasOwnProperty.call(svc, "startSearch"));
    api().tagSuggest.feature.stop();
    try {
      assert.isFalse(api().tagSuggest.isPatched());
      assert.isFalse(Object.prototype.hasOwnProperty.call(svc, "startSearch"));
    } finally {
      api().tagSuggest.feature.start();
    }
    assert.isTrue(api().tagSuggest.isPatched());
  });

  it("lists the outline of the main collection in tree order, then the library", async function () {
    const rows = await suggest("§Ts", ann.id);
    const labels = rows.map((r) => r.value);
    assert.deepEqual(labels.slice(1, 3), ["§TsZeta", "§TsAlpha"]);
    assert.include(labels, "§TsFremd");
    assert.isAbove(labels.indexOf("§TsFremd"), labels.indexOf("§TsAlpha"));
    // Two header rows whose value consists solely of whitespace
    const headers = rows.filter((r) => !r.value.trim());
    assert.lengthOf(headers, 2);
    assert.notEqual(headers[0].value, headers[1].value);
    assert.equal(rows[0], headers[0]);
    // Number only in label; value remains purely the tag name
    assert.equal(rows[1].value, "§TsZeta");
    assert.equal(rows[1].label, "§TsZeta (1)");
    assert.equal(rows[2].label, "§TsAlpha (2)");
  });

  it("with only § typed the outline comes first as well", async function () {
    const labels = (await suggest("§", ann.id)).map((r) => r.value);
    assert.deepEqual(labels.slice(1, 3), ["§TsZeta", "§TsAlpha"]);
  });

  it("mode tree shows only the outline", async function () {
    Zotero.Prefs.set(modePref, "tree", true);
    const labels = (await suggest("§Ts", ann.id)).map((r) => r.value);
    assert.lengthOf(labels, 3);
    assert.notInclude(labels, "§TsFremd");
  });

  it("mode typed hides the library part until more than § is typed", async function () {
    Zotero.Prefs.set(modePref, "typed", true);
    assert.notInclude(
      (await suggest("§", ann.id)).map((r) => r.value),
      "§TsFremd",
    );
    assert.include(
      (await suggest("§TsF", ann.id)).map((r) => r.value),
      "§TsFremd",
    );
  });

  it("without an outline for the main collection the list is library-wide, under a header that says so", async function () {
    const rows = await suggest("§Ts", plainAnn.id);
    assert.equal(rows[0].value.trim(), "", "first row is the header");
    assert.isTrue(rows.slice(1).every((r) => r.value.trim()));
    assert.includeMembers(
      rows.map((r) => r.value),
      ["§TsAlpha", "§TsZeta", "§TsFremd"],
    );
  });

  it("does not suggest tags the annotation already has", async function () {
    ann.addTag("§TsZeta");
    await ann.saveTx();
    const labels = (await suggest("§Ts", ann.id)).map((r) => r.value);
    assert.notInclude(labels, "§TsZeta");
    ann.removeTag("§TsZeta");
    await ann.saveTx();
  });

  it("a newer search supersedes an older one, and a stopped one reports nothing", async function () {
    const svc = api().tagSuggest.service();
    const params = JSON.stringify({
      fieldName: "tag",
      libraryID: lib,
      itemID: ann.id,
    });
    let stale = 0;
    const count = { onSearchResult: () => stale++ };
    const first = svc.startSearch("§Ts", params, null, count);
    await suggest("§TsA", ann.id);
    await first;
    assert.equal(stale, 0, "overtaken search must stay silent");

    const stopped = svc.startSearch("§Ts", params, null, count);
    svc.stopSearch();
    await stopped;
    assert.equal(stale, 0, "stopped search must stay silent");
  });

  it("mode off and non-§ input fall through to Zotero's own search", async function () {
    Zotero.Prefs.set(modePref, "off", true);
    const off = (await suggest("§Ts", ann.id)).map((r) => r.value);
    assert.deepEqual(
      off,
      [...off].sort((a, b) => a.localeCompare(b)),
    );
    Zotero.Prefs.clear(modePref, true);
    const plain = await suggest("Ts", ann.id);
    assert.isTrue(plain.every((r) => r.value === r.label));
  });

  it("suggests tags even when item is not editable", async function () {
    const origEditable = ann.isEditable;
    ann.isEditable = () => false;
    try {
      const rows = await suggest("§Ts", ann.id);
      assert.isAbove(rows.length, 0);
      assert.include(
        rows.map((r) => r.value),
        "§TsZeta",
      );
    } finally {
      ann.isEditable = origEditable;
    }
  });
});
