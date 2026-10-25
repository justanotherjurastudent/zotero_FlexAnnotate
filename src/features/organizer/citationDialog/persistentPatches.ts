/**
 * Zotero-near patches of the persistent companion window: remembering the
 * command (execCommand), redirecting Interface methods
 * (addEditCitation/addAnnotation) and suppressed progress windows
 * (Progress.show). The displayDialog patch lives with the window mechanics in
 * `persistentWindow.ts`.
 */

import { assignChecked } from "../../../shared/patch";
import { nextLastCommand } from "../logic/lastCommand";
import {
  isPersistentAgent,
  logError,
  readPersistentPref,
  restoreMethod,
  state,
  type InstalledMethod,
} from "./persistentState";
import { openBrowse, prepareTargetRect } from "./persistentWindow";

let installedExec: InstalledMethod<(...args: any[]) => Promise<any>> | null =
  null;
let installedProgress: InstalledMethod<(...args: any[]) => unknown> | null =
  null;
let installedAddEditCitation: InstalledMethod<
  (docField?: unknown) => Promise<unknown>
> | null = null;
let installedAddAnnotation: InstalledMethod<() => Promise<unknown>> | null =
  null;

export function patchProgressBar(): boolean {
  if (installedProgress) return true;
  const proto = (Zotero as any).Integration?.Progress?.prototype;
  if (!proto || typeof proto.show !== "function") return false;
  const native = proto.show;
  const patched = function (this: unknown, ...args: unknown[]) {
    // No progress window without a running integration transaction (after addEditCitation).
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
  installedProgress = { target: proto, name: "show", native, patched };
  return true;
}

export function unpatchProgressBar(): void {
  if (!installedProgress) return;
  const entry = installedProgress;
  installedProgress = null;
  restoreMethod(entry);
}

/** Remembers on every command which document Word sent it to (integration.js:240). */
export function patchExecCommand(): boolean {
  if (installedExec) return true;
  const integration = (Zotero as any).Integration;
  if (!integration || typeof integration.execCommand !== "function")
    return false;
  const native = integration.execCommand;
  const patched = async function (
    this: unknown,
    agent: string,
    command: string,
    docId?: string,
    templateVersion = 0,
  ) {
    // WinWord and LibreOffice: the command is re-run in the companion window. For
    // http (Google Docs) that would hang the server (server.js:525-527), so
    // http stays out.
    state.activeAgent = agent;
    state.lastCommand = nextLastCommand(
      state.lastCommand,
      isPersistentAgent(agent),
      agent,
      command,
      docId,
      templateVersion,
    );
    try {
      return await native.call(this, agent, command, docId, templateVersion);
    } finally {
      state.activeAgent = null;
    }
  };
  if (!assignChecked(integration, "execCommand", patched)) {
    ztoolkit.log("FlexAnnotate: assignChecked for execCommand failed");
    return false;
  }
  installedExec = { target: integration, name: "execCommand", native, patched };
  return true;
}

export function unpatchExecCommand(): void {
  if (!installedExec) return;
  const entry = installedExec;
  installedExec = null;
  restoreMethod(entry);
}

function currentAgent(iface?: any): string | null {
  return (
    state.activeAgent ||
    iface?._session?.agent ||
    state.lastCommand?.agent ||
    null
  );
}

async function interceptCommand(
  iface: any,
  agent: string | null,
  command: "addEditCitation" | "addAnnotation",
  nativeFn: (field?: any) => Promise<unknown>,
  docField?: any,
): Promise<unknown> {
  if (
    !readPersistentPref() ||
    !isPersistentAgent(agent) ||
    state.pendingInsert
  ) {
    return nativeFn.call(iface, docField);
  }

  await iface._session.init(false, false);
  const fieldType = iface._session.data?.prefs?.fieldType;
  if (command === "addEditCitation") {
    const inField =
      docField ||
      (fieldType ? await iface._doc.cursorInField(fieldType) : null);
    if (inField) {
      return nativeFn.call(iface, inField);
    }
  }

  if (fieldType && !(await iface._doc.canInsertField(fieldType))) {
    throw new (Zotero as any).Exception.Alert(
      "integration.error.cannotInsertHere",
      [],
      "integration.error.title",
    );
  }

  // Load the document fields into the session (like session.cite in integration.js:1546-1565),
  // so that citationsByIndex, citationsByItemID and documentCitationIDs are current in the companion window.
  if (
    typeof iface._session?.updateFromDocument === "function" &&
    !(
      iface._session.data?.prefs?.delayCitationUpdates &&
      iface._session.citationsByItemID &&
      Object.keys(iface._session.citationsByItemID).length
    )
  ) {
    try {
      await iface._session.updateFromDocument(false);
    } catch (e) {
      logError("updateFromDocument", e);
    }
  }

  state.lastCommand = nextLastCommand(
    state.lastCommand,
    true,
    agent,
    command,
    state.lastCommand?.docId,
    state.lastCommand?.templateVersion ?? 0,
  );

  if (iface._session) {
    iface._session._dontActivateDocument = true;
  }

  const target = await prepareTargetRect();
  const cmdPromise = (Zotero as any).Integration?.currentDoc
    ? (Zotero as any).Integration?.currentCommandPromise
    : null;
  (cmdPromise || Promise.resolve()).then(
    () => {
      if (readPersistentPref() && isPersistentAgent(agent)) {
        try {
          openBrowse(target.rect, target.placed);
        } catch (e) {
          logError("openBrowse", e);
        }
      }
    },
    () => {},
  );

  return [];
}

/**
 * Intercepts addEditCitation and addAnnotation on the Interface prototype: when the
 * companion mode is active, a new call creates no footnote placeholder in Word but
 * closes the Word transaction immediately and opens the companion window. If the
 * cursor is in an existing citation, the native path continues.
 */
export function patchInterfaceMethods(): boolean {
  if (installedAddEditCitation && installedAddAnnotation) return true;
  const ifaceProto = (Zotero as any).Integration?.Interface?.prototype;
  if (!ifaceProto) return false;

  if (
    !installedAddEditCitation &&
    typeof ifaceProto.addEditCitation === "function"
  ) {
    const native = ifaceProto.addEditCitation;
    const patched = async function (this: any, docField?: any) {
      const agent = currentAgent(this);
      return interceptCommand(this, agent, "addEditCitation", native, docField);
    };

    if (!assignChecked(ifaceProto, "addEditCitation", patched)) {
      ztoolkit.log(
        "FlexAnnotate: assignChecked for Interface.prototype.addEditCitation failed",
      );
      return false;
    }
    installedAddEditCitation = {
      target: ifaceProto,
      name: "addEditCitation",
      native,
      patched,
    };
  }

  if (
    !installedAddAnnotation &&
    typeof ifaceProto.addAnnotation === "function"
  ) {
    const native = ifaceProto.addAnnotation;
    const patched = async function (this: any) {
      const agent = currentAgent(this);
      return interceptCommand(this, agent, "addAnnotation", native);
    };

    if (!assignChecked(ifaceProto, "addAnnotation", patched)) {
      ztoolkit.log(
        "FlexAnnotate: assignChecked for Interface.prototype.addAnnotation failed",
      );
      unpatchInterfaceMethods();
      return false;
    }
    installedAddAnnotation = {
      target: ifaceProto,
      name: "addAnnotation",
      native,
      patched,
    };
  }

  return true;
}

export function unpatchInterfaceMethods(): void {
  if (installedAddEditCitation) {
    const entry = installedAddEditCitation;
    installedAddEditCitation = null;
    restoreMethod(entry);
  }
  if (installedAddAnnotation) {
    const entry = installedAddAnnotation;
    installedAddAnnotation = null;
    restoreMethod(entry);
  }
}
