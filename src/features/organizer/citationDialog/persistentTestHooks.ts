/**
 * Test helpers for the persistent companion window (addon.api and integration tests).
 * The actual logic lives in persistentState / persistentPinning /
 * persistentWindow / persistentPatches; this module only provides the small
 * test access points.
 */

import type { CommandRef } from "../logic/lastCommand";
import { state, type PendingInsert } from "./persistentState";
import {
  getPersistentWindow,
  makeBrowseIo,
  openBrowse,
} from "./persistentWindow";

/**
 * Test helper: open a companion window at `rect` (CSS pixels) without a command.
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
 * Test helper: pre-remember a command without Word (otherwise patchExecCommand remembers it on the command itself).
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
