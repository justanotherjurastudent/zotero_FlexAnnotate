import { assert } from "chai";
import { config } from "../package.json";
import {
  cleanup,
  click,
  findOrganizerWindow,
  findWindowByUrl,
  makeWork,
  waitFor,
} from "./helpers";
import { screenshot } from "./screenshot";

/**
 * Bildschirmfotos für Layoutprüfung und README. Läuft nur mit
 * `npm run screenshots` (setzt FLEXANNOTATE_SCREENSHOTS=1); sonst geskippt.
 * Alle Daten sind synthetisch. Scheitert ein Bild, wird das protokolliert und
 * die übrigen Bilder entstehen trotzdem.
 */

const api = () => (Zotero as any)[config.addonInstance].api;
const DIALOG_URL = "chrome://zotero/content/integration/citationDialog.xhtml";
const enabled = () => Services.env.get("FLEXANNOTATE_SCREENSHOTS") === "1";

describe("screenshots", function () {
  this.timeout(180000);
  const libraryID = () => Zotero.Libraries.userLibraryID;
  const written: string[] = [];
  const failed: string[] = [];
  let work: Zotero.Item;
  let noteID = 0;
  let organizer: Window | null = null;
  let dialog: Window | null = null;
  let prefs: Window | null = null;
  const outlinePrefKey = () => `${config.prefsPrefix}.dialogOutlineView`;
  let outlinePref: unknown;

  /** Ein Bild erstellen; ein Fehler wird gesammelt, der Test läuft weiter. */
  const step = async (name: string, fn: () => Promise<string>) => {
    try {
      const path = await fn();
      written.push(path);
      Zotero.debug(`screenshots: ${name} -> ${path}`);
    } catch (e) {
      const msg = `${name}: ${(e as Error).message}`;
      failed.push(msg);
      Zotero.debug(`screenshots: FAILED ${msg}`);
    }
  };

  const closeDialogs = async () => {
    let w: Window | null;
    while ((w = findWindowByUrl(DIALOG_URL))) {
      const old = w;
      old.close();
      await waitFor(() => findWindowByUrl(DIALOG_URL) !== old);
    }
  };

  /** Zitierdialog wie in features.test.ts, optional mit Gliederungsansicht. */
  const openCitationDialog = async (outline: boolean): Promise<Window> => {
    await closeDialogs();
    (Zotero as any).Integration.currentSession = {
      sessionID: "SHOTS",
      citationsByItemID: {},
    };
    const io: any = new (Zotero.Integration as any).CitationEditInterface(
      { citationItems: [], properties: {}, citationID: "screenshots" },
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
    const toggle = (await waitFor(() =>
      w.document.getElementById("flexannotate-toggle"),
    )) as HTMLInputElement;
    // The toggle takes its stored state after the dialog is built: wait for it
    await Zotero.Promise.delay(400);
    if (toggle.checked !== outline) toggle.click();
    if (outline) {
      await waitFor(
        () =>
          w.document.querySelectorAll("#flexannotate-tree [data-node-id]")
            .length >= 2,
      );
    }
    await Zotero.Promise.delay(300); // layout settles
    return w;
  };

  before(async function () {
    if (!enabled()) return this.skip();
    outlinePref = Zotero.Prefs.get(outlinePrefKey(), true);
    await Zotero.Styles.init(); // Locator-Bezeichnungen brauchen die CSL-Locales
    work = await makeWork("Beispielkommentar zum Aktiengesetz");
    const print = api().print.printAnnotations;
    const samples: [string, string, string, string, string][] = [
      // [Zitat, Seite/Locator, Farbe, Kommentar, Locator-Typ]
      [
        "Die Organe der Gesellschaft sind der Vorstand und der Aufsichtsrat.",
        "12",
        "#ffd400",
        "",
        "page",
      ],
      [
        "Der Vorstand leitet die Gesellschaft in eigener Verantwortung.",
        "14",
        "#5fb236",
        "Hauptpflicht",
        "page",
      ],
      [
        "Der Aufsichtsrat überwacht die Geschäftsführung.",
        "21",
        "#2ea8e5",
        "",
        "page",
      ],
      [
        "Haftung für Pflichtverletzungen besteht gegenüber der Gesellschaft.",
        "§ 93, Rn. 4",
        "#ff6666",
        "Verschulden prüfen",
        "paragraph",
      ],
      [
        "Die Beweislast für die Sorgfalt trägt der Vorstand.",
        "§ 93, Rn. 7",
        "#a28ae5",
        "",
        "paragraph",
      ],
      [
        "Schadensersatz setzt einen kausalen Schaden voraus.",
        "45",
        "#ffd400",
        "Kausalität",
        "section",
      ],
    ];
    for (const [text, page, color, comment, locator] of samples) {
      await print.create(work, {
        text,
        pageLabel: page,
        color,
        comment,
        locator,
      });
    }
    const placeholder = api().print.placeholder.find(work);
    const anns = placeholder ? placeholder.getAnnotations() : [];
    assert.isAtLeast(anns.length, 6, "print annotations created");

    // Gliederung mit drei Überschriften; die Zitate ordnen sich zu
    const core = api().outline;
    const roots = [
      core.makeNode("Einleitung"),
      core.makeNode("Haftung"),
      core.makeNode("Organe"),
    ];
    noteID = await api().outlineModel.OutlineModel.save(
      libraryID(),
      null,
      roots,
    );
    const ids = (from: number, to: number) =>
      anns.slice(from, to).map((a: Zotero.Item) => a.id);
    await api().organizerData.fileMany(ids(0, 2), "§Organe");
    await api().organizerData.fileMany(ids(2, 4), "§Haftung");
    await api().organizerData.fileMany(ids(4, 6), "§Einleitung");
  });

  after(async function () {
    if (!enabled()) return;
    Zotero.Prefs.set(outlinePrefKey(), outlinePref, true); // Gliederungsschalter zurück
    organizer?.close();
    dialog?.close();
    prefs?.close();
    await closeDialogs();
    (Zotero as any).Integration.currentSession = undefined;
    (Zotero.Items.get(noteID) as Zotero.Item | false)?.eraseTx?.();
    await cleanup(); // Buch mit Print-Annotationen und Platzhalter
    if (failed.length) {
      Zotero.debug(`screenshots: ${failed.length} step(s) failed`);
    }
  });

  it("writes the window screenshots", async function () {
    if (!enabled()) return this.skip();

    // (a) Organizer
    await step("organizer", async () => {
      await api().OrganizerFactory.open();
      organizer = await waitFor(findOrganizerWindow);
      await waitFor(() =>
        organizer!.document.getElementById("flexannotate-scope"),
      );
      await Zotero.Promise.delay(800);
      return screenshot(organizer, "organizer");
    });
    organizer?.close();
    organizer = null;

    // (b) und (c) Zitierdialog mit und ohne Gliederungsansicht
    await step("citation-dialog", async () => {
      dialog = await openCitationDialog(true);
      return screenshot(dialog, "citation-dialog");
    });
    await step("citation-dialog-native", async () => {
      dialog = await openCitationDialog(false);
      return screenshot(dialog, "citation-dialog-native");
    });
    // Suchtext aus der Zoteros-Suchleiste filtert die Gliederungsliste
    await step("citation-dialog-search", async () => {
      dialog = await openCitationDialog(true);
      const doc = dialog.document;
      const input = doc.querySelector(
        "#bubble-input input",
      ) as HTMLInputElement;
      input.focus();
      input.value = "Vorstand";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await waitFor(
        () =>
          (
            doc.querySelector(
              "#flexannotate-list-pane input",
            ) as HTMLInputElement | null
          )?.value === "Vorstand",
      );
      await Zotero.Promise.delay(300);
      return screenshot(dialog, "citation-dialog-search");
    });
    // genau eine Annotation markiert: Button "Zitatstelle anzeigen"
    await step("citation-dialog-place", async () => {
      dialog = await openCitationDialog(true);
      const doc = dialog.document;
      const row = await waitFor(
        () =>
          doc.querySelector(
            "#flexannotate-list-pane [data-ann-id]",
          ) as HTMLElement | null,
      );
      click(row);
      await waitFor(() => doc.getElementById("flexannotate-show-place"));
      await Zotero.Promise.delay(300);
      return screenshot(dialog, "citation-dialog-place");
    });
    await closeDialogs();
    dialog = null;

    // (d) Einstellungsfenster mit der Pane des Plugins
    await step("preferences", async () => {
      const pane = Zotero.PreferencePanes.pluginPanes.find(
        (p: any) => p.pluginID === config.addonID,
      );
      if (!pane) throw new Error("plugin pane not registered");
      Zotero.Utilities.Internal.openPreferences(pane.id);
      prefs = await waitFor(() => {
        const en = Services.wm.getEnumerator("zotero:pref");
        return en.hasMoreElements() ? (en.getNext() as Window) : null;
      });
      await Zotero.Promise.delay(1500);
      return screenshot(prefs, "preferences");
    });
    prefs?.close();
    prefs = null;

    // (e) Ausschnitt der Hauptfenster-Leiste (Organizer-Button: flexannotate-tb-organizer)
    await step("main-toolbar", async () => {
      const main = Zotero.getMainWindow() as Window;
      return screenshot(main, "main-toolbar", {
        selector: "#zotero-tabs-toolbar",
        scale: 2,
      });
    });

    // (f) Die Print-Annotation-Maske fehlt bewusst: sie ist ein <panel>
    // (Popup), das drawWindow weder ohne noch mit USE_WIDGET_LAYERS erfasst;
    // das Bild zeigte nur den Inhalt darunter. Siehe Bericht.

    assert.isAbove(written.length, 0, "at least one screenshot written");
    Zotero.debug(
      `screenshots: written ${written.length}, failed ${failed.length}`,
    );
    for (const f of failed) Zotero.debug(`screenshots: failed: ${f}`);
  });
});
