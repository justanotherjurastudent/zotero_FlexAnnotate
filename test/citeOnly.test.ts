import { assert } from "chai";
import { config } from "../package.json";
import {
  cleanup,
  makeAnnotation,
  makePdfAttachment,
  makeWork,
} from "./helpers";

/**
 * Nur-Nachweis-Zitieren: Patch an/aus in einer echten Zotero-Instanz, und die
 * Einfügung mit citationOnly=true ergibt ein Zitat auf den Elterntitel mit Locator.
 * Der Zugriff läuft über addon.api, damit das Plugin-Modul mit seinem ztoolkit-Global
 * getestet wird und nicht eine Kopie im Testbundle.
 */

const api = () => (Zotero as any)[config.addonInstance].api;
const PREF = `${config.prefsPrefix}.citationOnly`;

describe("citation-only patch", function () {
  this.timeout(60000);
  const proto = () => (Zotero as any).Integration.Session.prototype;

  after(async function () {
    Zotero.Prefs.clear(PREF, true);
    // Plugin-Zustand wie beim Start wiederherstellen.
    api().citeOnly.patch.start?.();
    await cleanup();
  });

  it("start patches, a second start does not patch again, stop restores the original", function () {
    const { patch, isPatched } = api().citeOnly;
    patch.stop?.();
    const native = proto()._insertCitingResult;
    const nativeReset = proto().resetRequest;
    assert.isFalse(isPatched());

    patch.start?.();
    const patched = proto()._insertCitingResult;
    const patchedReset = proto().resetRequest;
    assert.isTrue(isPatched());
    assert.notStrictEqual(patched, native, "start replaces the function");
    assert.notStrictEqual(
      patchedReset,
      nativeReset,
      "start replaces resetRequest",
    );

    patch.start?.();
    assert.strictEqual(proto()._insertCitingResult, patched, "no double patch");
    assert.strictEqual(
      proto().resetRequest,
      patchedReset,
      "no double patch for resetRequest",
    );

    patch.stop?.();
    assert.isFalse(isPatched());
    assert.strictEqual(proto()._insertCitingResult, native, "stop restores");
    assert.strictEqual(
      proto().resetRequest,
      nativeReset,
      "stop restores resetRequest",
    );

    patch.start?.();
    assert.isTrue(isPatched());
  });

  it("stop leaves a patch of another plugin in place", function () {
    const { patch } = api().citeOnly;
    patch.stop?.();
    const native = proto()._insertCitingResult;
    patch.start?.();
    const ours = proto()._insertCitingResult;
    const foreign = function (this: any, ...args: any[]) {
      return ours.apply(this, args);
    };
    proto()._insertCitingResult = foreign;
    try {
      patch.stop?.();
      assert.strictEqual(
        proto()._insertCitingResult,
        foreign,
        "foreign patch survives stop()",
      );
    } finally {
      proto()._insertCitingResult = native;
      patch.start?.();
    }
  });

  it("resetRequest preserves rebuildCiteprocState when set", function () {
    const fakeSession: any = {
      rebuildCiteprocState: true,
      newIndices: {},
      citationsByIndex: {},
    };
    proto().resetRequest.call(fakeSession, {});
    assert.isTrue(fakeSession.rebuildCiteprocState, "preserves rebuild flag");

    fakeSession.rebuildCiteprocState = false;
    fakeSession.newIndices = {};
    proto().resetRequest.call(fakeSession, {});
    assert.isFalse(
      fakeSession.rebuildCiteprocState,
      "remains false when not rebuilding",
    );

    fakeSession.rebuildCiteprocState = undefined;
    fakeSession.newIndices = {};
    proto().resetRequest.call(fakeSession, {});
    assert.isFalse(
      fakeSession.rebuildCiteprocState,
      "becomes false when previously undefined",
    );
  });

  it("with citationOnly the annotation is inserted as a citation on its parent with locator", async function () {
    const work = await makeWork("Nachweis Testwerk");
    const att = await makePdfAttachment(work);
    const ann = await makeAnnotation(att, "Nur Nachweis Zitat", "22", 0);

    Zotero.Prefs.set(PREF, true, true);
    let result: any[];
    try {
      const citation = new (Zotero as any).Integration.Citation(
        null,
        { citationItems: [{ id: ann.id }] },
        0,
      );
      // Ein gesetztes Feld überspringt addField(); der Pfad über die Session bleibt gleich.
      result = await proto()._insertCitingResult.call(
        Object.create(proto()),
        0,
        {},
        citation,
      );
    } finally {
      Zotero.Prefs.set(PREF, false, true);
    }

    assert.lengthOf(result, 1);
    const [item] = result[0].citationItems;
    assert.equal(item.id, work.id, "cites the parent item, not the annotation");
    assert.notEqual(item.id, ann.id);
    assert.equal(item.locator, "22");
    assert.equal(item.label, "page");
  });
});
