/**
 * Einstiegspunkt des persistenten Begleitfensters ("Blätterfenster").
 *
 * Die Logik ist in atomare Module aufgeteilt, damit einzelne Belange leicht
 * angepasst oder ausgetauscht werden können (z. B. wenn sich Zoteros
 * Integration-APIs ändern):
 *
 * - `persistentState.ts`      – geteilter Zustand, Prefs, Agent-Filter, Protokoll
 * - `persistentPinning.ts`    – Lage/Größe festhalten und speichern
 * - `persistentWindow.ts`     – Fenster-Lebenszyklus (öffnen/schließen/einfügen)
 * - `persistentPatches.ts`    – execCommand-/Interface-/Progress-Patches
 * - `persistentFeature.ts`    – Feature-Hook (start/stop)
 * - `persistentTestHooks.ts`  – Test-Helfer
 *
 * Diese Datei re-exportiert die öffentliche API unverändert, damit bestehende
 * Importe (hooks.ts, dialogOutline.ts, dialogCited.ts, registry.ts) stabil
 * bleiben.
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
