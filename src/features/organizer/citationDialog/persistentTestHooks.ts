/**
 * Test-Helfer für das persistente Begleitfenster (addon.api und Integrationstests).
 * Die eigentliche Logik liegt in persistentState / persistentPinning /
 * persistentWindow / persistentPatches; dieses Modul stellt nur die kleinen
 * Test-Zugriffe bereit.
 */

import type { CommandRef } from "../logic/lastCommand";
import { state, type PendingInsert } from "./persistentState";
import {
  getPersistentWindow,
  makeBrowseIo,
  openBrowse,
} from "./persistentWindow";

/**
 * Test-Hilfe: ein Blätterfenster an `rect` (CSS-Pixel) öffnen, ohne Befehl.
 */
export function openBrowseForTest(rect?: {
  x: number;
  y: number;
  w: number;
  h: number;
}): Window {
  const dpr = (Zotero as any).getMainWindow?.()?.devicePixelRatio || 1;
  openBrowse(rect ? { ...rect, dpr } : undefined);
  return getPersistentWindow()!;
}

/**
 * Test-Hilfe: Befehl ohne Word vormerken (sonst merkt sich patchExecCommand ihn beim Befehl selbst).
 */
export function lastCommandForTest(): CommandRef | null {
  return state.lastCommand;
}

export function rememberCommandForTest(ref: CommandRef | null): void {
  state.lastCommand = ref;
  state.activeAgent = ref?.agent ?? null;
}

export function setPendingInsertForTest(pend: PendingInsert | null): void {
  state.pendingInsert = pend;
}

export function makeBrowseIoForTest(command = "addAnnotation"): any {
  return makeBrowseIo(command);
}
