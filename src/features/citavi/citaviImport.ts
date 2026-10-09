/**
 * Citavi-Import: Zitate ohne Dateianhang als Print-Annotationen übernehmen.
 * Herkunft: legacy/citaviImport.js. Reine Parser- und Textlogik liegt in core/citavi.ts.
 *
 * Zoteros Importer verwirft sie. Er läuft über `//Annotations/Annotation` — Knoten, die
 * PDF-Koordinaten (`Quads`) tragen — und steigt zusätzlich aus, wenn die Quelle keinen
 * Anhang hat (Zotero 10.0.5: import/citavi.js:76-80). Zitate an Printquellen haben
 * keinen `<Annotation>`-Knoten, sondern existieren nur als `<KnowledgeItem>`.
 *
 * ## Warum zwei Einhängepunkte
 *
 * 1. `Zotero.Translate.Import.prototype.translate` (translate.js:1246, geerbt von Base) —
 *    erkennt den Citavi-Export und hält das Translation-Objekt fest: `_itemSaver._IDMap`
 *    (Citavi-`ReferenceID` → Zotero-Item) und `_io` für das XML.
 * 2. `Zotero_File_Interface.importFile` / `importFromClipboard` (fileInterface.js:416,
 *    :511) — bestimmt, *wann* der Durchlauf läuft: nach Zoteros eigenem Annotations-
 *    Durchlauf (fileInterface.js:685-686). Jedes Fenster hat sein eigenes Objekt,
 *    deshalb wird jedes geöffnete Fenster geprüft.
 *
 * Die Reihenfolge ist nicht kosmetisch: Zoteros Durchlauf nimmt `getAttachments()[0]`
 * (import/citavi.js:82). Läge die Platzhalter-PDF davor, landeten PDF-Annotationen dort.
 */
import { assignChecked } from "../../shared/patch";
import type { Feature } from "../../shared/feature";
import { getPref } from "../../utils/prefs";
import { importPrintQuotes } from "./citaviPrintQuotes";
import { linkContributions, type CitaviTranslation } from "./citaviLinks";

type AsyncFn = (...args: unknown[]) => unknown;

/** { proto, original } des globalen translate()-Patches */
let translatePatch: {
  proto: { translate?: AsyncFn };
  original: AsyncFn;
} | null = null;
/** Pro Fenster die ersetzten Methoden von Zotero_File_Interface */
const windowPatches = new WeakMap<
  Window,
  { target: object; name: string; original: AsyncFn }[]
>();
/** Translation-Objekt eines Citavi-Imports, dessen Durchlauf noch aussteht */
let pending: CitaviTranslation | null = null;
/**
 * Fenster, die den Durchlauf richtig einreihen. Ein Set statt eines Flags: sonst bliebe
 * der Zustand nach dem Schließen des letzten solchen Fensters auf true stehen.
 */
const sequencedWindows = new Set<Window>();
/** nsIObserver auf domwindowopened */
let observer: { observe(subject: unknown, topic: string): void } | null = null;

const TRANSLATOR_LABEL = /^Citavi (?:[56]) XML/i;

/** Liefert den ersten Übersetzer-Eintrag als Objekt, sonst null. */
function translatorOf(translation: CitaviTranslation | null | undefined) {
  const translator = translation?.translator?.[0];
  return translator && typeof translator !== "string" ? translator : null;
}

/** Eingeordnete Einhängepunkte; Zustand liegt im Modul, nicht am Aufrufer. */
export const CitaviImport = {
  /**
   * Hängt den translate()-Patch ein. Gibt false zurück, wenn der Zielpfad fehlt oder
   * die Zuweisung nicht nachweislich greift; die Ursache wird geloggt.
   */
  patch(): boolean {
    // Ein zweiter Aufruf würde die Kette doppelt wickeln; unpatch() stellte dann nur die
    // Zwischenschicht wieder her (Abweichung von legacy, siehe Bericht).
    if (translatePatch) {
      return true;
    }
    const proto = (
      Zotero as unknown as {
        Translate?: { Import?: { prototype?: { translate?: AsyncFn } } };
      }
    ).Translate?.Import?.prototype;
    if (!proto || typeof proto.translate !== "function") {
      ztoolkit.log(
        "FlexAnnotate: Zotero.Translate.Import.prototype.translate not found — " +
          "Citavi-Zitate ohne Anhang werden nicht importiert.",
      );
      return false;
    }

    const original = proto.translate;
    const patched = function (this: CitaviTranslation, ...args: unknown[]) {
      // translate() liefert immer ein Promise; ein Fehler darin wird weitergereicht.
      return Promise.resolve(original.apply(this, args)).then(async (items) => {
        await CitaviImport._afterTranslate(this);
        return items;
      });
    };

    if (!assignChecked(proto, "translate", patched)) {
      ztoolkit.log(
        "FlexAnnotate: patch of Translate.Import.translate did not take effect — " +
          "Citavi-Zitate ohne Anhang werden nicht importiert.",
      );
      return false;
    }

    translatePatch = { proto, original };
    ztoolkit.log("Patched Translate.Import.translate for Citavi print quotes");
    CitaviImport._watchWindows();
    return true;
  },

  /**
   * Nimmt den globalen translate()-Patch zurück. Die fensterweisen Patches hängen an
   * removeFromWindow() und werden hier nicht berührt.
   */
  unpatch(): void {
    CitaviImport._unwatchWindows();

    const patch = translatePatch;
    if (!patch) {
      return;
    }
    assignChecked(patch.proto, "translate", patch.original);
    translatePatch = null;
    pending = null;
    ztoolkit.log("Removed Translate.Import.translate patch");
  },

  async _afterTranslate(translation: CitaviTranslation): Promise<void> {
    try {
      if (!getPref("citaviImport") && !getPref("citaviLinkContributions")) {
        return;
      }
      if (!CitaviImport._isCitavi(translation)) {
        // Ohne diese Zeile wäre nicht zu unterscheiden, ob der Patch nicht greift oder
        // der Übersetzer nur nicht als Citavi erkannt wurde.
        ztoolkit.log(
          "Import finished, not Citavi: " +
            CitaviImport._describeTranslator(translation),
        );
        return;
      }
      if (pending) {
        // Eine Vormerkung, die niemand eingelöst hat: der Aufrufweg dieses Imports geht
        // an keinem gepatchten Zotero_File_Interface vorbei.
        ztoolkit.log(
          "FlexAnnotate: a queued Citavi pass was never triggered — " +
            "der Aufrufweg dieses Imports ist nicht eingereiht.",
        );
      }
      pending = translation;
      if (sequencedWindows.size) {
        ztoolkit.log("Citavi import detected; print quotes queued");
        return;
      }
      ztoolkit.log(
        "FlexAnnotate: Citavi print quotes run right after translate() — " +
          "PDF-Annotationen derselben Quellen können auf dem Platzhalter landen.",
      );
      await CitaviImport._runPending();
    } catch (e) {
      Zotero.logError(e as Error);
    }
  },

  _isCitavi(translation: CitaviTranslation): boolean {
    const label = CitaviImport._getLabel(translation);
    return !!label && TRANSLATOR_LABEL.test(label);
  },

  _getLabel(translation: CitaviTranslation): string | null {
    return translatorOf(translation)?.label || null;
  },

  /** Nur für die Logausgabe. */
  _describeTranslator(translation: CitaviTranslation): string {
    const translator = translation?.translator?.[0];
    if (!translator) {
      return "(kein Übersetzer gesetzt)";
    }
    if (typeof translator === "string") {
      return `ID ${translator}`;
    }
    return translator.label || `ID ${translator.translatorID}`;
  },

  /**
   * Jedes Fenster, das `fileInterface.js` lädt, bekommt ein eigenes
   * Zotero_File_Interface. Der Importassistent tut das ebenfalls; ein Patch am
   * Hauptfenster erreicht ihn nicht.
   */
  _watchWindows(): void {
    if (observer) {
      return;
    }

    observer = {
      observe(subject, topic) {
        if (topic !== "domwindowopened") {
          return;
        }
        const win = subject as Window;
        win.addEventListener(
          "load",
          () => {
            try {
              CitaviImport.addToWindow(win);
            } catch (e) {
              Zotero.logError(e as Error);
            }
          },
          { once: true },
        );
      },
    };

    Services.ww.registerNotification(observer as never);
    ztoolkit.log("Watching for windows with their own Zotero_File_Interface");
  },

  _unwatchWindows(): void {
    if (!observer) {
      return;
    }
    Services.ww.unregisterNotification(observer as never);
    observer = null;
  },

  /**
   * Reiht den Durchlauf hinter den Import dieses Fensters ein. Fenster ohne
   * `Zotero_File_Interface` werden still übergangen.
   */
  addToWindow(window: Window): void {
    if (windowPatches.has(window)) {
      return;
    }

    const fileInterface = (
      window as unknown as { Zotero_File_Interface?: Record<string, unknown> }
    ).Zotero_File_Interface;
    if (!fileInterface) {
      return;
    }

    const patches: { target: object; name: string; original: AsyncFn }[] = [];

    for (const name of ["importFile", "importFromClipboard"]) {
      const original = fileInterface[name];
      if (typeof original !== "function") {
        continue;
      }

      const patched = async function (this: unknown, ...args: unknown[]) {
        // Ein früherer, nie eingelöster Durchlauf darf nicht nachwirken.
        pending = null;
        try {
          return await (original as AsyncFn).apply(this, args);
        } finally {
          await CitaviImport._runPending();
        }
      };

      if (!assignChecked(fileInterface, name, patched)) {
        ztoolkit.log(`Citavi sequencing: ${name} is not writable`);
        continue;
      }
      patches.push({
        target: fileInterface,
        name,
        original: original as AsyncFn,
      });
    }

    if (!patches.length) {
      ztoolkit.log(
        "FlexAnnotate: could not sequence the Citavi pass — " +
          "es läuft ersatzweise direkt nach translate().",
      );
      return;
    }

    windowPatches.set(window, patches);
    sequencedWindows.add(window);
    ztoolkit.log(
      `Sequenced Citavi pass after ${patches.map((p) => p.name).join(", ")}` +
        ` in ${window.location?.href || "window"}`,
    );
  },

  removeFromWindow(window: Window): void {
    const patches = windowPatches.get(window);
    if (!patches) {
      return;
    }
    for (const { target, name, original } of patches) {
      assignChecked(target, name, original);
    }
    windowPatches.delete(window);
    sequencedWindows.delete(window);
    ztoolkit.log("Removed Citavi sequencing");
  },

  /**
   * Holt den vorgemerkten Durchlauf nach. Ein Fehler darin darf den Import nicht
   * abbrechen — die regulär importierten Einträge stehen bereits.
   */
  async _runPending(): Promise<void> {
    const translation = pending;
    pending = null;
    if (!translation) {
      return;
    }
    if (getPref("citaviImport")) {
      try {
        await importPrintQuotes(translation);
      } catch (e) {
        Zotero.logError(e as Error);
      }
    }
    if (getPref("citaviLinkContributions")) {
      try {
        await linkContributions(translation);
      } catch (e) {
        Zotero.logError(e as Error);
      }
    }
  },
};

export const citaviImport: Feature = {
  name: "citaviImport",
  start: () => {
    CitaviImport.patch();
  },
  stop: () => CitaviImport.unpatch(),
  addToWindow: (win) => CitaviImport.addToWindow(win),
  removeFromWindow: (win) => CitaviImport.removeFromWindow(win),
};
