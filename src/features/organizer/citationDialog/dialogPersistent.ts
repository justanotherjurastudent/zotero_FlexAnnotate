/**
 * Entry point of the persistent companion window ("companion window").
 *
 * The logic is split into atomic modules so individual concerns can be
 * adjusted or replaced easily (e.g. when Zotero's integration APIs change):
 *
 * - `persistentState.ts`      – shared state, prefs, agent filter, logging
 * - `persistentPinning.ts`    – keep and save position/size
 * - `persistentWindow.ts`     – window lifecycle (open/close/insert)
 * - `persistentPatches.ts`    – execCommand-/Interface-/Progress patches
 * - `persistentFeature.ts`    – feature hook (start/stop)
 * - `persistentTestHooks.ts`  – test helpers
 *
 * This file re-exports the public API unchanged, so existing imports
 * (hooks.ts, dialogOutline.ts, dialogCited.ts, registry.ts) stay stable.
 */

export {
  isPersistentAgent,
  readPersistentPref,
  writePersistentPref,
  getLastCommand,
} from "./persistentState";
export { relaxDialogMinWidth } from "./persistentPinning";
export {
  getPersistentWindow,
  persistentSupported,
  activatePersistentOnOpenDialog,
  patchDisplayDialog,
  unpatchDisplayDialog,
} from "./persistentWindow";
export {
  patchProgressBar,
  unpatchProgressBar,
  patchExecCommand,
  unpatchExecCommand,
  patchInterfaceMethods,
  unpatchInterfaceMethods,
} from "./persistentPatches";
export { persistentDialogPatch } from "./persistentFeature";
export {
  openBrowseForTest,
  lastCommandForTest,
  rememberCommandForTest,
  setPendingInsertForTest,
  makeBrowseIoForTest,
} from "./persistentTestHooks";
