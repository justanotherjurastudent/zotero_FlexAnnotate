/**
 * Dauerhaftes Begleitfenster für Word und LibreOffice.
 *
 * Wenn die Option in den Einstellungen aktiviert ist, bleibt der Zitierdialog
 * nach dem Einfügen als persistente Aufgabenleiste geöffnet und wird bei
 * erneuten Aufrufen aus Word oder LibreOffice wiederverwendet, statt ein
 * neues Fenster zu öffnen.
 */

import type { Feature } from "../../shared/feature";
import { assignChecked } from "../../shared/patch";
import { hookAccept } from "./dialogCited";
import { tr } from "./strings";

const PREF = "persistentCitationDialog";

function prefKey(name: string): string {
  return `${addon.data.config.prefsPrefix}.${name}`;
}

export function readPersistentPref(): boolean {
  try {
    return Zotero.Prefs.get(prefKey(PREF), true) === true;
  } catch {
    return false;
  }
}

export function writePersistentPref(v: boolean): void {
  try {
    Zotero.Prefs.set(prefKey(PREF), v, true);
  } catch (e) {
    ztoolkit.log("flexannotate persistent pref write failed:", e);
  }
}

let activePersistentWindow: Window | null = null;

export function getPersistentWindow(): Window | null {
  if (activePersistentWindow && !activePersistentWindow.closed) {
    return activePersistentWindow;
  }
  activePersistentWindow = null;
  return null;
}

export function setPersistentWindow(win: Window | null): void {
  activePersistentWindow = win;
}

/**
 * Verhindert das automatische Schließen des Fensters nach dem Einfügen,
 * lässt aber explizite Schließungen durch den Nutzer (Escape, Abbrechen, X) zu.
 */
export function setupPersistentClose(win: Window): void {
  const anyWin = win as any;
  if (anyWin.__flexannotatePersistentCloseHooked) return;
  anyWin.__flexannotatePersistentCloseHooked = true;

  setPersistentWindow(win);

  try {
    win.document.documentElement?.setAttribute("resizable", "true");
  } catch {
    // Falls document noch nicht bereit ist
  }
  if (anyWin.libraryLayout) {
    anyWin.libraryLayout.MIN_WIDTH = 360;
  }

  const origClose = win.close;
  win.close = function (this: Window) {
    if (readPersistentPref() && !anyWin.__flexannotateUserClose) {
      return;
    }
    origClose.apply(this);
  };

  win.addEventListener(
    "keydown",
    (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Escape") {
        anyWin.__flexannotateUserClose = true;
      }
    },
    true,
  );

  const doc = win.document;
  const cancelBtn =
    doc.getElementById("cancel-button") ||
    doc.getElementById("cancel") ||
    doc.querySelector("button[name='cancel']");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      anyWin.__flexannotateUserClose = true;
    });
  }

  win.addEventListener("close", () => {
    anyWin.__flexannotateUserClose = true;
  });

  win.addEventListener("unload", () => {
    if (getPersistentWindow() === win) {
      setPersistentWindow(null);
    }
    try {
      const session = (Zotero as any).Integration?.currentSession;
      if (session?.progressBar?.window && !session.progressBar.window.closed) {
        session.progressBar.hide(true);
      }
    } catch {
      // Ignorieren falls keine Sitzung oder kein Fenster existiert
    }
  });
}

type DisplayDialogFn = (
  this: unknown,
  url: string,
  options?: string,
  io?: unknown,
  windowType?: string,
) => Promise<void>;

interface InstalledDisplayDialog {
  target: { displayDialog: DisplayDialogFn };
  native: DisplayDialogFn;
}

interface InstalledProgressShow {
  target: { show: (...args: unknown[]) => unknown };
  native: (...args: unknown[]) => unknown;
}

let installed: InstalledDisplayDialog | null = null;
let installedProgress: InstalledProgressShow | null = null;

export function patchProgressBar(): boolean {
  if (installedProgress) return true;
  const proto = (Zotero as any).Integration?.Progress?.prototype;
  if (!proto || typeof proto.show !== "function") return false;
  const native = proto.show;
  const patched = function (this: unknown, ...args: unknown[]) {
    // Wenn keine Integration-Transaktion aktiv ist (z. B. nach Abschluss von addEditCitation),
    // darf kein Fortschrittsbalken mehr geöffnet werden.
    if (!(Zotero as any).Integration?.currentDoc) {
      ztoolkit.log("FlexAnnotate: Suppressed orphan progressBar.show()");
      return;
    }
    return native.apply(this, args);
  };
  if (!assignChecked(proto, "show", patched)) {
    ztoolkit.log(
      "FlexAnnotate: assignChecked for Progress.prototype.show failed",
    );
    return false;
  }
  installedProgress = { target: proto, native };
  return true;
}

export function unpatchProgressBar(): void {
  if (!installedProgress) return;
  const { target, native } = installedProgress;
  installedProgress = null;
  assignChecked(target, "show", native);
}

export function normalizePersistentOptions(options?: string): string {
  const parts = (options || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "popup" && s !== "alwaysRaised");
  if (!parts.includes("dialog=no")) parts.push("dialog=no");
  if (!parts.some((s) => s.startsWith("resizable")))
    parts.push("resizable=yes");
  return parts.join(",");
}

export function patchDisplayDialog(): boolean {
  if (installed) return true;
  const integration = (Zotero as any).Integration;
  if (!integration || typeof integration.displayDialog !== "function") {
    return false;
  }
  const native = integration.displayDialog as DisplayDialogFn;
  const patched: DisplayDialogFn = async function (
    url,
    options,
    io,
    windowType,
  ) {
    const existing = getPersistentWindow();
    if (
      readPersistentPref() &&
      existing &&
      !existing.closed &&
      url.includes("citationDialog.xhtml")
    ) {
      ztoolkit.log("FlexAnnotate: Reusing persistent citation window");
      const cleanupPromise =
        (Zotero as any).Integration?.currentDoc?.cleanup?.() ??
        Promise.resolve();
      await (Zotero as any).Integration?.currentSession?.progressBar?.hide?.(
        true,
      );
      (Zotero as any).Integration.currentWindowType = windowType;
      (Zotero as any).Integration.currentWindow = existing;

      (existing as any).io = io;
      try {
        existing.focus();
      } catch {
        // Fenster kann während des Fokussierens bereits geschlossen sein
      }

      hookAccept(existing);

      existing.dispatchEvent(
        new (existing as any).CustomEvent("flexannotate-reuse-dialog"),
      );

      if (io && (io as any).promise) {
        await (io as any).promise;
      }

      await cleanupPromise;
      return;
    }

    let effectiveOptions = options;
    if (readPersistentPref() && url.includes("citationDialog.xhtml")) {
      effectiveOptions = normalizePersistentOptions(options);
    }

    const result = await native.call(
      this,
      url,
      effectiveOptions,
      io,
      windowType,
    );
    if (
      readPersistentPref() &&
      url.includes("citationDialog.xhtml") &&
      (Zotero as any).Integration?.currentWindow
    ) {
      setPersistentWindow((Zotero as any).Integration.currentWindow);
    }
    return result;
  };

  if (!assignChecked(integration, "displayDialog", patched)) {
    ztoolkit.log("FlexAnnotate: assignChecked for displayDialog failed");
    return false;
  }
  installed = { target: integration, native };
  return true;
}

export function unpatchDisplayDialog(): void {
  if (!installed) return;
  const { target, native } = installed;
  installed = null;
  assignChecked(target, "displayDialog", native);
}

export const persistentDialogPatch: Feature = {
  name: "persistentDialogPatch",
  start() {
    patchDisplayDialog();
    patchProgressBar();
  },
  stop() {
    unpatchDisplayDialog();
    unpatchProgressBar();
    const win = getPersistentWindow();
    if (win && !win.closed) {
      (win as any).__flexannotateUserClose = true;
      try {
        win.close();
      } catch {
        // Fenster wurde möglicherweise bereits geschlossen
      }
    }
    setPersistentWindow(null);
  },
};
