/**
 * Citavi import: adopt quotes without an attachment as print annotations.
 * Origin: pre-merge:src/citaviImport.js. Pure parser and text logic lives in core/citavi.ts.
 *
 * Zotero's importer discards them. It processes `//Annotations/Annotation` — nodes that
 * carry PDF coordinates (`Quads`) — and additionally bails if the source has no
 * attachment (Zotero 10.0.5: import/citavi.js:76-80). Quotes on print sources have no
 * `<Annotation>` node, but exist only as `<KnowledgeItem>`.
 *
 * ## Why two hooks
 *
 * 1. `Zotero.Translate.Import.prototype.translate` (translate.js:1246, inherited from Base) —
 *    recognizes the Citavi export and keeps the translation object: `_itemSaver._IDMap`
 *    (Citavi-`ReferenceID` → Zotero item) and `_io` for the XML.
 * 2. `Zotero_File_Interface.importFile` / `importFromClipboard` (fileInterface.js:416,
 *    :511) — decides *when* the pass runs: after Zotero's own annotation
 *    pass (fileInterface.js:685-686). Each window has its own object,
 *    so every open window is checked.
 *
 * The order is not cosmetic: Zotero's pass takes `getAttachments()[0]`
 * (import/citavi.js:82). If the placeholder PDF were before it, PDF annotations would land there.
 */
import { assignChecked } from "../../shared/patch";
import type { Feature } from "../../shared/feature";
import { getPref } from "../../utils/prefs";
import { importPrintQuotes } from "./citaviPrintQuotes";
import { linkContributions, type CitaviTranslation } from "./citaviLinks";
import { isFeatureEnabled } from "../gates";

type AsyncFn = (...args: unknown[]) => unknown;

/** { proto, original, patched } of the global translate() patch */
let translatePatch: {
  proto: { translate?: AsyncFn };
  original: AsyncFn;
  patched: AsyncFn;
} | null = null;
/** Per-window replaced methods of Zotero_File_Interface */
const windowPatches = new WeakMap<
  Window,
  { target: object; name: string; original: AsyncFn; patched: AsyncFn }[]
>();
/** Translation object of a Citavi import whose pass is still pending */
let pending: CitaviTranslation | null = null;
/**
 * Windows that correctly sequence the pass. A Set instead of a flag: otherwise the
 * state would stay true after the last such window was closed.
 */
const sequencedWindows = new Set<Window>();
/** nsIObserver on domwindowopened */
let observer: { observe(subject: unknown, topic: string): void } | null = null;

const TRANSLATOR_LABEL = /^Citavi (?:[56]) XML/i;

/** Returns the first translator entry as an object, otherwise null. */
function translatorOf(translation: CitaviTranslation | null | undefined) {
  const translator = translation?.translator?.[0];
  return translator && typeof translator !== "string" ? translator : null;
}

/** Ordered hooks; state lives in the module, not on the caller. */
export const CitaviImport = {
  /**
   * Hooks the translate() patch. Returns false if the target path is missing or
   * the assignment does not provably take effect; the cause is logged.
   */
  patch(): boolean {
    // A second call would wrap the chain twice; unpatch() would then only restore the
    // intermediate layer (deviation from legacy, see report).
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
      // translate() always returns a promise; an error in it is passed through.
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

    translatePatch = { proto, original, patched };
    ztoolkit.log("Patched Translate.Import.translate for Citavi print quotes");
    CitaviImport._watchWindows();
    return true;
  },

  /**
   * Removes the global translate() patch. The per-window patches hang on
   * removeFromWindow() and are not touched here.
   */
  unpatch(): void {
    CitaviImport._unwatchWindows();

    const patch = translatePatch;
    if (!patch) {
      return;
    }
    translatePatch = null;
    pending = null;
    if (patch.proto.translate !== patch.patched) {
      ztoolkit.log(
        "FlexAnnotate: Translate.Import.prototype.translate patched by others, kept",
      );
      return;
    }
    if (!assignChecked(patch.proto, "translate", patch.original)) {
      ztoolkit.log(
        "FlexAnnotate: restore of Translate.Import.prototype.translate did not take effect",
      );
      return;
    }
    ztoolkit.log("Removed Translate.Import.translate patch");
  },

  async _afterTranslate(translation: CitaviTranslation): Promise<void> {
    try {
      const quotesOn =
        isFeatureEnabled("citaviPrintQuotes") && getPref("citaviImport");
      const linksOn =
        isFeatureEnabled("citaviLinks") && getPref("citaviLinkContributions");
      if (!quotesOn && !linksOn) {
        return;
      }
      if (!CitaviImport._isCitavi(translation)) {
        // Without this line it would be impossible to tell whether the patch is not
        // in effect or the translator just was not recognized as Citavi.
        ztoolkit.log(
          "Import finished, not Citavi: " +
            CitaviImport._describeTranslator(translation),
        );
        return;
      }
      if (pending) {
        // A reservation that nobody redeemed: the call path of this import does not
        // pass through any patched Zotero_File_Interface.
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

  /** For log output only. */
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
   * Every window that loads `fileInterface.js` gets its own
   * Zotero_File_Interface. The import wizard does too; a patch on the
   * main window would not reach it.
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
   * Queues the pass behind this window's import. Windows without
   * `Zotero_File_Interface` are silently skipped.
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

    const patches: {
      target: object;
      name: string;
      original: AsyncFn;
      patched: AsyncFn;
    }[] = [];

    for (const name of ["importFile", "importFromClipboard"]) {
      const original = fileInterface[name];
      if (typeof original !== "function") {
        continue;
      }

      const patched = async function (this: unknown, ...args: unknown[]) {
        // An earlier pass that was never redeemed must not have an after-effect.
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
        patched: patched as AsyncFn,
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
    for (const { target, name, original, patched } of patches) {
      if ((target as Record<string, unknown>)[name] !== patched) {
        ztoolkit.log(`Citavi sequencing: ${name} patched by others, kept`);
        continue;
      }
      if (!assignChecked(target, name, original)) {
        ztoolkit.log(
          `Citavi sequencing: restore of ${name} did not take effect`,
        );
      }
    }
    windowPatches.delete(window);
    sequencedWindows.delete(window);
    ztoolkit.log("Removed Citavi sequencing");
  },

  /**
   * Runs the pending pass. An error in it must not abort the import —
   * the regularly imported entries are already in place.
   */
  async _runPending(): Promise<void> {
    const translation = pending;
    pending = null;
    if (!translation) {
      return;
    }
    if (isFeatureEnabled("citaviPrintQuotes") && getPref("citaviImport")) {
      try {
        await importPrintQuotes(translation);
      } catch (e) {
        Zotero.logError(e as Error);
      }
    }
    if (isFeatureEnabled("citaviLinks") && getPref("citaviLinkContributions")) {
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
