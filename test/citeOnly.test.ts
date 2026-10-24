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

  it("with citationOnly pre-assigns citationID and records annotation key in session doc prefs", async function () {
    const work = await makeWork("Nachweis Prefs Testwerk");
    const att = await makePdfAttachment(work);
    const ann = await makeAnnotation(att, "Nur Nachweis Prefs Zitat", "44", 0);

    Zotero.Prefs.set(PREF, true, true);
    try {
      const citation = new (Zotero as any).Integration.Citation(
        null,
        { citationItems: [{ id: ann.id }] },
        0,
      );
      const fakeSession = Object.create(proto());
      fakeSession.data = { prefs: {} };
      const result = await proto()._insertCitingResult.call(
        fakeSession,
        0,
        {},
        citation,
      );
      assert.lengthOf(result, 1);
      assert.ok(result[0].citationID, "pre-assigned citationID");
      assert.notEqual(result[0].citationID, "flexannotate-browse");
      const storedRaw = fakeSession.data.prefs.flexannotate_cited;
      assert.ok(storedRaw, "flexannotate_cited was written to doc prefs");
      const stored = JSON.parse(storedRaw);
      assert.deepEqual(stored.citations[result[0].citationID], [ann.key]);
    } finally {
      Zotero.Prefs.set(PREF, false, true);
    }
  });

  it("getActiveCitedIDs reconciles with documentCitationIDs and keeps empty doc prefs authoritative", async function () {
    const work = await makeWork("Reconciliation Testwerk");
    const att = await makePdfAttachment(work);
    const ann = await makeAnnotation(att, "Reconciliation Annotation", "55", 0);

    const dialogCited = api().dialogCited;
    assert.ok(dialogCited, "dialogCited API available");

    const citID = "cit_test_123";
    const fakeSession: any = {
      sessionID: "reconcile-session",
      data: {
        prefs: {
          flexannotate_cited: JSON.stringify({
            citations: { [citID]: [ann.key] },
          }),
        },
      },
      documentCitationIDs: { [citID]: 0 },
    };

    const origSession = (Zotero as any).Integration?.currentSession;
    (Zotero as any).Integration.currentSession = fakeSession;

    try {
      const rows = [{ id: ann.id, key: ann.key, workID: work.id }];
      const citedWorks = new Set([work.id]);

      // 1. Initial check: footnote is in document -> annotation is cited
      const active1 = dialogCited.getActiveCitedIDs(rows, citedWorks);
      assert.ok(active1.has(ann.id), "annotation is marked as cited");

      // 2. Footnote is deleted in Word (documentCitationIDs loses citID)
      // (leeres Objekt hieße "Session nicht geladen" und bereinigt nichts)
      fakeSession.documentCitationIDs = { other_cit: 0 };
      const active2 = dialogCited.getActiveCitedIDs(rows, citedWorks);
      assert.equal(
        active2.size,
        0,
        "checkmark removed when footnote is deleted in Word",
      );

      // 3. Document prefs now store empty citations
      const updatedData = JSON.parse(fakeSession.data.prefs.flexannotate_cited);
      assert.deepEqual(updatedData.citations, {});

      // 4. Legacy store has an old entry for this session: empty doc prefs must NOT revive it
      const legacyPrefKey = `${config.prefsPrefix}.citedAnnotations`;
      Zotero.Prefs.set(
        legacyPrefKey,
        JSON.stringify({
          "reconcile-session": { [String(ann.id)]: work.id },
        }),
        true,
      );

      const active3 = dialogCited.getActiveCitedIDs(rows, citedWorks);
      assert.equal(
        active3.size,
        0,
        "empty doc prefs remain authoritative; legacy store must NOT revive deleted checkmark",
      );
    } finally {
      (Zotero as any).Integration.currentSession = origSession;
      Zotero.Prefs.clear(`${config.prefsPrefix}.citedAnnotations`, true);
    }
  });

  it("getCitationLocations and jumpToCitation find footnote index and activate document", async function () {
    const work = await makeWork("Navigation Testwerk");
    const att = await makePdfAttachment(work);
    const ann = await makeAnnotation(att, "Navigation Annotation", "77", 0);

    const dialogCited = api().dialogCited;
    assert.ok(dialogCited, "dialogCited API available");

    let selected = false;
    let activated = false;

    const fakeCitation = {
      citationID: "cit_nav_1",
      properties: { noteIndex: 14 },
      field: {
        select: async () => {
          selected = true;
        },
      },
    };

    const fakeSession: any = {
      sessionID: "nav-session",
      data: {
        prefs: {
          flexannotate_cited: JSON.stringify({
            citations: { cit_nav_1: [ann.key] },
          }),
        },
      },
      documentCitationIDs: { cit_nav_1: 0 },
      citationsByIndex: [fakeCitation],
      _doc: {
        activate: async () => {
          activated = true;
        },
      },
    };

    const origSession = (Zotero as any).Integration?.currentSession;
    (Zotero as any).Integration.currentSession = fakeSession;
    // Testschalter: kein echtes Word ansprechen (siehe isTestProfile).
    const addonData = (Zotero as any)[config.addonInstance].data;
    const origEnv = addonData.env;
    addonData.env = "test";

    try {
      // 1. Check getCitationLocations
      const locs = dialogCited.getCitationLocations(ann.key);
      assert.lengthOf(locs, 1);
      assert.equal(locs[0].citationID, "cit_nav_1");
      assert.equal(locs[0].noteIndex, 14);
      assert.strictEqual(locs[0].citation, fakeCitation);

      // 2. Check getAllCitationLocations
      const allLocs = dialogCited.getAllCitationLocations();
      assert.isTrue(allLocs.has(ann.key));
      assert.lengthOf(allLocs.get(ann.key), 1);

      // 3. Check jumpToCitation execution
      const success = await dialogCited.jumpToCitation(locs[0].citation);
      assert.isTrue(success, "jumpToCitation returns true on success");
      assert.isTrue(selected, "citation.field.select() was called");
      assert.isTrue(activated, "session._doc.activate() was called");

      // 4. Safe execution without session or field
      const emptyResult = await dialogCited.jumpToCitation(null);
      assert.isFalse(emptyResult, "returns false for null citation");

      const noFieldResult = await dialogCited.jumpToCitation({});
      assert.isTrue(noFieldResult, "survives missing field gracefully");

      // 5. Safe exception handling when field.select() or doc.activate() throws
      const failingCitation = {
        field: {
          select: async () => {
            throw new Error("RPC disconnected");
          },
        },
      };
      const failedResult = await dialogCited.jumpToCitation(failingCitation);
      assert.isFalse(
        failedResult,
        "returns false without throwing when field.select fails",
      );

      // 6. syncSessionFromDocument updates session and prunes deleted footnote
      let docDataSaved: string | null = null;
      const origGetApp = (Zotero as any).Integration.getApplication;
      (Zotero as any).Integration.getApplication = () => ({
        getActiveDocument: async () => ({
          setDocumentData: async (s: string) => {
            docDataSaved = s;
          },
          cleanup: async () => {},
          complete: async () => {},
        }),
      });
      fakeSession.data.serialize = () =>
        JSON.stringify(fakeSession.data.prefs.flexannotate_cited);
      fakeSession.updateFromDocument = async function () {
        this.documentCitationIDs = {};
        this.citationsByIndex = {};
        this.citationsByItemID = {};
      };
      try {
        const changed = await dialogCited.syncSessionFromDocument();
        assert.isTrue(changed, "detects deleted footnote in document");
        assert.deepEqual(
          JSON.parse(fakeSession.data.prefs.flexannotate_cited).citations,
          {},
          "prunes last deleted citation when empty is verified",
        );
        assert.isNotNull(docDataSaved, "persists pruned data to document");
      } finally {
        (Zotero as any).Integration.getApplication = origGetApp;
      }
    } finally {
      addonData.env = origEnv;
      (Zotero as any).Integration.currentSession = origSession;
      Zotero.Prefs.clear(`${config.prefsPrefix}.citedAnnotations`, true);
    }
  });
});
