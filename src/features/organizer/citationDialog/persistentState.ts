/**
 * Shared state and base functions of the persistent companion window
 * ("companion window") for Word and LibreOffice.
 *
 * This module is the base of the `dialogPersistent.ts` split: it holds the
 * module-wide state (command, agent, pending insert), the prefs, the
 * window-agent filter and the logging. The actual functionality lives in
 * `persistentPinning.ts`, `persistentWindow.ts`, `persistentPatches.ts` and
 * `persistentTestHooks.ts`.
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

/** Rect in CSS pixels (screenX/outerWidth) plus devicePixelRatio. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  dpr: number;
}

/** Selection from the companion window that is inserted on the next command. */
export interface PendingInsert {
  items: any[];
  rect: Rect;
}

/**
 * Agents for which the companion window is reopened after an insert.
 *
 * WinWord: tested. LibreOffice: the re-insert runs through the synchronous
 * sendCommand path (zoteroLibreOfficeIntegration.mjs:270-288), which blocks a nested
 * event loop without a timeout; normal insertion works in Writer through the
 * same path and was confirmed by the user. MacWord: the macOS integration speaks
 * asynchronously via ChromeWorker + Scripting Bridge
 * (zotero-word-for-mac-integration) and therefore does not block the main thread
 * like LibreOffice; enabled, real Mac test outstanding.
 * http (Google Docs) stays out: a re-run command would hang the server
 * (server.js:525-527).
 */
export function isPersistentAgent(
  agent: string | null | undefined,
): agent is string {
  return agent === "WinWord" || agent === "LibreOffice" || agent === "MacWord";
}

/** Target of the accept wrapper: position + optional height, source for the next window. */
export interface AcceptState {
  live: Rect | null;
}

/** Module-wide state shared by the persistent windows/patches. */
export interface PersistentRuntime {
  /** Between start() and stop(): only then may a companion window appear. */
  alive: boolean;
  /** Last Word/LibreOffice command run by the user (integration.js:240). */
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

/** Flow log (ms since the window opened); ztoolkit.log and Zotero.debug. */
// performance.now() is not available in the plugin scope; Date.now() is enough for the log.
const TRACE_START = Date.now();
export function trace(event: string, detail = "") {
  try {
    const ms = Date.now() - TRACE_START;
    const msg = `FlexAnnotate persistent [${ms}ms] ${event}${detail ? ` ${detail}` : ""}`;
    ztoolkit.log(msg);
    Zotero.debug(msg);
  } catch {
    // Logging must never stop the flow
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
    // Zotero.logError may be missing in test environments
  }
}
