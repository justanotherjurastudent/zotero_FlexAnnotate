import { assert } from "chai";
import { config } from "../package.json";
import { findWindowByUrl, hasAnnotationDialog, waitFor } from "./helpers";

/**
 * "Vollnachweis / Nur Nachweis" im Zitationsdialog: Einbau an allen Einbauorten,
 * Entfernen beim Aufräumen, Schreiben der Pref bei Änderung.
 */

const api = () => (Zotero as any)[config.addonInstance].api;
const DIALOG_URL = "chrome://zotero/content/integration/citationDialog.xhtml";
const ROW = ".flexannotate-citation-mode-row";
const STYLE_ID = "flexannotate-citation-dialog-style";
const PREF = `${config.prefsPrefix}.citationOnly`;

describe("citation mode selector", function () {
  this.timeout(60000);
  let win: Window | null = null;

  /** Opens the citation dialog like Word does (see features.test.ts). */
  const openDialog = async (): Promise<Window> => {
    let stale: Window | null;
    while ((stale = findWindowByUrl(DIALOG_URL))) {
      const old = stale;
      old.close();
      await waitFor(() => findWindowByUrl(DIALOG_URL) !== old);
    }
    const io: any = new (Zotero.Integration as any).CitationEditInterface(
      { citationItems: [], properties: {}, citationID: "modeselector-test" },
      true,
      Promise.resolve(0),
      Zotero.Promise.delay(300).then(() => ({})),
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
    // The watcher injects once the dialog is initialised; its outline toggle is the signal
    await waitFor(() => w.document.getElementById("flexannotate-toggle"));
    return w;
  };

  /** Injection points as the dialog offers them: settings popup and item popup. */
  const expectedPlaces = (doc: Document) =>
    (doc.querySelector("#settings-popup .popup") ? 1 : 0) +
    (doc.querySelector("#itemDetails .popup .buttons") ? 1 : 0);

  before(async function () {
    // needs Zotero >= 9 (annotation mode in citation dialog)
    if (!hasAnnotationDialog()) this.skip();
    Zotero.Prefs.set(PREF, false, true);
  });

  after(async function () {
    win?.close();
    Zotero.Prefs.set(PREF, false, true);
  });

  it("adds one row per injection point and removes them again", async function () {
    win = await openDialog();
    const doc = win.document;

    const rows = doc.querySelectorAll(ROW);
    assert.isAbove(rows.length, 0, "a mode selector was added");
    assert.equal(rows.length, expectedPlaces(doc), "one row per location");

    api().modeSelector.removeModeSelector(win);
    assert.lengthOf(doc.querySelectorAll(ROW), 0, "no rows left");
    assert.isNull(doc.getElementById(STYLE_ID), "style removed");

    // a second injection is accepted and builds the rows again
    api().modeSelector.injectModeSelector(win);
    assert.equal(doc.querySelectorAll(ROW).length, rows.length);
    // and a repeated injection does not duplicate them
    api().modeSelector.injectModeSelector(win);
    assert.equal(doc.querySelectorAll(ROW).length, rows.length);
  });

  it("writes the citationOnly pref when the selection changes", async function () {
    const w = win!;
    const selects = Array.from(
      w.document.querySelectorAll<HTMLSelectElement>(
        "select.flexannotate-citation-mode",
      ),
    );
    assert.isAbove(selects.length, 0);

    selects[0].value = "citation";
    selects[0].dispatchEvent(new w.Event("change"));

    assert.isTrue(Zotero.Prefs.get(PREF, true), "pref is set to citation only");
    assert.isTrue(
      selects.every((s) => s.value === "citation"),
      "all selections follow",
    );

    selects[0].value = "full";
    selects[0].dispatchEvent(new w.Event("change"));
    assert.isFalse(Zotero.Prefs.get(PREF, true));
  });
});
