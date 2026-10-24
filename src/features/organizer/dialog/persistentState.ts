/**
 * Geteilter Zustand und Grundfunktionen des persistenten Begleitfensters
 * ("Blätterfenster") für Word und LibreOffice.
 *
 * Dieses Modul ist die Basis der Aufteilung von `dialogPersistent.ts`: Es hält
 * den modulweiten Zustand (Befehl, Agent, vorgemerkte Einfügung), die Prefs,
 * den Fenster-Agent-Filter und das Protokoll. Die eigentliche Funktionalität
 * liegt in `persistentPinning.ts`, `persistentWindow.ts`,
 * `persistentPatches.ts` und `persistentTestHooks.ts`.
 */

import { assignChecked } from "../../../shared/patch";
import type { CommandRef } from "../logic/lastCommand";

export const PREF = "persistentCitationDialog";
export const RECT_PREF = "persistentWindowRect";

export function prefKey(name: string): string {
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

/** Rect in CSS-Pixeln (screenX/outerWidth) plus devicePixelRatio. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  dpr: number;
}

/** Auswahl aus dem Blätterfenster, die beim nächsten Befehl eingefügt wird. */
export interface PendingInsert {
  items: any[];
  rect: Rect;
}

/**
 * Agenten, für die das Blätterfenster nach dem Einfügen wieder geöffnet wird.
 *
 * WinWord: getestet. LibreOffice: das erneute Einfügen läuft durch den synchronen
 * sendCommand-Pfad (zoteroLibreOfficeIntegration.mjs:270-288), der einen verschachtelten
 * Event-Loop ohne Timeout blockiert; die normale Einfügung funktioniert in Writer über
 * denselben Pfad und wurde vom Nutzer bestätigt. MacWord: die macOS-Integration spricht
 * asynchron über ChromeWorker + Scripting Bridge (zotero-word-for-mac-integration), blockiert
 * den Haupt-Thread also nicht wie LibreOffice; freigegeben, realer Mac-Test steht aus.
 * http (Google Docs) bleibt außen vor: ein erneuter Befehl ließe den Server hängen
 * (server.js:525-527).
 */
export function isPersistentAgent(
  agent: string | null | undefined,
): agent is string {
  return agent === "WinWord" || agent === "LibreOffice" || agent === "MacWord";
}

/** Das Ziel des Accept-Wrappers: Lage + optional Höhe, Quelle für das nächste Fenster. */
export interface AcceptState {
  live: Rect | null;
}

/** Modulweiter Zustand, den die persistenten Fenster/Patches gemeinsam teilen. */
export interface PersistentRuntime {
  /** Zwischen start() und stop(): nur dann darf ein Blätterfenster entstehen. */
  alive: boolean;
  /** Letzter vom Nutzer ausgeführter Word/LibreOffice-Befehl (integration.js:240). */
  lastCommand: CommandRef | null;
  activeAgent: string | null;
  pendingInsert: PendingInsert | null;
}

export const state: PersistentRuntime = {
  alive: false,
  lastCommand: null,
  activeAgent: null,
  pendingInsert: null,
};

export function getLastCommand(): CommandRef | null {
  return state.lastCommand;
}

export type DisplayDialogFn = (
  this: unknown,
  url: string,
  options?: string,
  io?: unknown,
  windowType?: string,
) => Promise<void>;

export interface InstalledMethod<F> {
  target: Record<string, any>;
  name: string;
  native: F;
  patched: F;
}

export function restoreMethod<F>(entry: InstalledMethod<F> | null): void {
  if (!entry) return;
  const { target, name, native, patched } = entry;
  if (target[name] !== patched) {
    ztoolkit.log(`FlexAnnotate: ${name} patched by others, kept`);
    return;
  }
  if (!assignChecked(target, name, native)) {
    ztoolkit.log(`FlexAnnotate: restore of ${name} did not take effect`);
  }
}

export function mainWin(): Window | null {
  try {
    return (Zotero as any).getMainWindow?.() ?? null;
  } catch {
    return null;
  }
}

/** Ablauf-Protokoll (ms seit Start des Fensters); ztoolkit.log und Zotero.debug. */
// performance.now() gibt es im Plugin-Scope nicht; Date.now() reicht für das Protokoll.
const TRACE_START = Date.now();
export function trace(event: string, detail = "") {
  try {
    const ms = Date.now() - TRACE_START;
    const msg = `FlexAnnotate persistent [${ms}ms] ${event}${detail ? ` ${detail}` : ""}`;
    ztoolkit.log(msg);
    Zotero.debug(msg);
  } catch {
    // Protokoll darf den Ablauf nie stoeren
  }
}

export function cw(): string {
  try {
    const w = (Zotero as any).Integration?.currentWindow;
    return `currentWindow=${w ? (w.closed ? "closed" : "open") : String(w)}`;
  } catch {
    return "currentWindow=?";
  }
}

export function logError(where: string, e: unknown) {
  ztoolkit.log(`FlexAnnotate persistent ${where} failed:`, e);
  try {
    Zotero.logError(e as Error);
  } catch {
    // Zotero.logError fehlt ggf. in Testumgebungen
  }
}
