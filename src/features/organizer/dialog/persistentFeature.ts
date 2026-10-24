/**
 * Feature-Hook des persistenten Begleitfensters: start() patcht die
 * Integration (displayDialog, execCommand, Interface-Methoden, Progress),
 * stop() stellt alles zurück und schließt ein offenes Fenster. Das Feature
 * selbst ist hier sauber von der Fenster-Mechanik und den Patches getrennt.
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
    // Zotero ohne Annotationsmodus-Befehl (8.x, 7.x: integration.js ohne Interface.prototype.addAnnotation):
    // nichts patchen, das Blätterfenster und der Schalter entfallen dort
    if (!persistentSupported()) return;
    state.alive = true;
    // ohne Befehlsmerker würde ein Blätterfenster den Dialog verschlucken: lieber gar nicht patchen
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
    // Option aus: kein unmittelbares Schließen mehr. Ein offenes Blätterfenster bleibt
    // so lange, bis die nächste Einfügung kommt — danach schließt es und öffnet sich nicht
    // wieder (insertFromBrowse und der accept-Handler prüfen readPersistentPref()). Das ist
    // das gewünschte Verhalten: ausschalten legt das Fenster nicht sofort zu, sondern nur
    // nach dem nächsten Einfügen (wie Vanilla-Zotero).
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
        // Fenster wurde möglicherweise bereits geschlossen
      }
    }
  },
};
