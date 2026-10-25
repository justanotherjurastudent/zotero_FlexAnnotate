/**
 * Feature hook of the persistent companion window: start() patches the
 * integration (displayDialog, execCommand, Interface methods, Progress),
 * stop() restores everything and closes an open window. The feature itself is
 * cleanly separated here from the window mechanics and the patches.
 */

import type { Feature } from "../../../shared/feature";
import { flushStoredRect } from "./persistentPinning";
import {
  patchExecCommand,
  patchInterfaceMethods,
  patchProgressBar,
  unpatchExecCommand,
  unpatchInterfaceMethods,
  unpatchProgressBar,
} from "./persistentPatches";
import { state } from "./persistentState";
import {
  getPersistentWindow,
  patchDisplayDialog,
  persistentSupported,
  unpatchDisplayDialog,
} from "./persistentWindow";

export const persistentDialogPatch: Feature = {
  name: "persistentDialogPatch",
  start() {
    // Zotero without the annotation-mode command (8.x, 7.x: integration.js without Interface.prototype.addAnnotation):
    // do not patch anything, the companion window and the switch are omitted there
    if (!persistentSupported()) return;
    state.alive = true;
    // without a command tracker a companion window would swallow the dialog: better not patch at all
    if (
      !patchDisplayDialog() ||
      !patchExecCommand() ||
      !patchInterfaceMethods()
    ) {
      unpatchDisplayDialog();
      unpatchExecCommand();
      unpatchInterfaceMethods();
      state.alive = false;
      return;
    }
    patchProgressBar();
    // Option off: no immediate closing anymore. An open companion window stays
    // until the next insert — afterwards it closes and does not reopen
    // (insertFromBrowse and the accept handler check readPersistentPref()). That is
    // the desired behaviour: turning off does not close the window at once, but only
    // after the next insert (like vanilla Zotero).
  },
  stop() {
    state.alive = false;
    flushStoredRect();
    unpatchDisplayDialog();
    unpatchProgressBar();
    unpatchExecCommand();
    unpatchInterfaceMethods();
    state.pendingInsert = null;
    state.lastCommand = null;
    state.activeAgent = null;
    const win = getPersistentWindow();
    if (win) {
      try {
        win.close();
      } catch {
        // The window may already have been closed
      }
    }
  },
};
