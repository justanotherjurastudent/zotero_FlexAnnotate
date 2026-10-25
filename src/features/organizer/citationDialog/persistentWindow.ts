/**
 * Window lifecycle of the persistent companion window ("companion window"):
 * open, close, insert from the window and reopening after a real command
 * (patchDisplayDialog). The feature object lives in `persistentFeature.ts`,
 * the remaining patches in `persistentPatches.ts`.
 */

import { assignChecked } from "../../../shared/patch";
import { normalizePersistentOptions } from "../logic/persistentOptions";
import type { WindowPosition } from "../logic/persistentOptions";
import { mergeCitationItems } from "../logic/lastCommand";
import {
  captureLive,
  pinRect,
  positionOf,
  readStoredRect,
  writeStoredSize,
} from "./persistentPinning";
import {
  cw,
  isPersistentAgent,
  logError,
  readPersistentPref,
  restoreMethod,
  state,
  trace,
  type AcceptState,
  type DisplayDialogFn,
  type InstalledMethod,
  type PendingInsert,
  type Rect,
} from "./persistentState";

const DIALOG_MARK = "citationDialog.xhtml";
const DIALOG_URL = `chrome://zotero/content/integration/${DIALOG_MARK}`;
/** Window options of the normal citation dialog (integration.js:1603-1609). */
const DIALOG_OPTIONS = "chrome,centerscreen,resizable=true,alwaysRaised";

/** The open window (companion window or running dialog), otherwise null. */
let openWindow: Window | null = null;
/** Windows that were opened as companion windows. */
const browseWindows = new WeakSet<Window>();
const windowAgents = new WeakMap<Window, string>();
/** Set as soon as openNew created the window (after that no fallback to the standard dialog). */
let windowOpened = false;

export function getPersistentWindow(): Window | null {
  if (openWindow && !openWindow.closed) return openWindow;
  openWindow = null;
  return null;
}

/**
 * The companion window only exists if Zotero has the addAnnotation command (integration.js:781 in 9 and 10)
 * and the platform is supported (Word, LibreOffice; not Google Docs/http).
 */
export function persistentSupported(win?: Window): boolean {
  const versionOk =
    typeof (Zotero as any).Integration?.Interface?.prototype?.addAnnotation ===
    "function";
  if (!versionOk) return false;
  if (!win) return true;
  if (browseWindows.has(win)) return true;
  if (windowAgents.has(win)) {
    return isPersistentAgent(windowAgents.get(win));
  }
  if (state.activeAgent !== null) {
    windowAgents.set(win, state.activeAgent);
    return isPersistentAgent(state.activeAgent);
  }
  if (state.lastCommand !== null) {
    return isPersistentAgent(state.lastCommand.agent);
  }
  return true;
}

/**
 * io for the companion window: like the previous command (addAnnotation or addEditCitation),
 * without a document. The dialog only reads these fields (citationDialog.js, searchHandler.mjs).
 */
export function makeBrowseIo(command = "addAnnotation"): any {
  const integ = (Zotero as any).Integration;
  const citation: any = {
    citationItems: [],
    sortedItems: [],
    properties: {},
    citationID: "flexannotate-browse",
  };
  const syncSortedItems = () => {
    const items = citation.citationItems || [];
    citation.sortedItems = items.map((ci: any) => [ci, ci]);
  };
  const io = new integ.CitationEditInterface(
    citation,
    true,
    Promise.resolve(-1),
    // the session's citations (green checks); {} would give an empty set instead of the fallback (dialogCited.ts)
    Promise.resolve(integ.currentSession?.citationsByItemID ?? {}),
    async () => {
      syncSortedItems();
      return "";
    },
  );
  io.isCitingNotes = false;
  io.isAddingAnnotations = command === "addAnnotation";
  io.getItems = async () => [];
  io.sort = async () => {
    syncSortedItems();
    return "";
  };
  return io;
}

/** Closes the companion window if open. */
function closeBrowse(): Promise<void> {
  const win = getPersistentWindow();
  if (!win || !browseWindows.has(win)) return Promise.resolve();
  openWindow = null;
  const gone = new Promise<void>((resolve) =>
    win.addEventListener("unload", () => resolve(), { once: true }),
  );
  win.close();
  // shortcut: 3 s cap in case unload does not come; upgrade if Zotero delivers an event on the window
  return Promise.race([gone, Zotero.Promise.delay(3000)]);
}

/**
 * Determines the geometry for the next companion window: an already open window is
 * measured and closed; otherwise the last saved geometry from the pref.
 */
export async function prepareTargetRect(): Promise<{
  rect: Rect | null;
  placed: boolean;
}> {
  let rect: Rect | null = null;
  let placed = true;
  const old = getPersistentWindow();
  if (old) {
    try {
      rect = captureLive(old);
    } catch {
      rect = null;
    }
    try {
      if (browseWindows.has(old)) {
        await closeBrowse();
      } else {
        old.close();
        openWindow = null;
      }
    } catch {
      openWindow = null;
    }
  }
  if (!rect) {
    const stored = readStoredRect();
    if (stored) {
      rect = stored.rect;
      placed = stored.placed;
    } else {
      placed = false;
    }
  }
  return { rect, placed };
}

/**
 * Opens the companion window at `rect`: the dialog in the mode of the last command
 * with its own io. Inserting there is insertFromBrowse().
 */
export function openBrowse(rect?: Rect | null, placed = true): void {
  // after stop() no new companion window anymore (a late call from a command)
  if (!state.alive) return;
  if (rect === undefined) {
    const stored = readStoredRect();
    if (stored) {
      rect = stored.rect;
      placed = stored.placed;
    } else {
      rect = null;
      placed = false;
    }
  }
  let position: WindowPosition | null = null;
  if (rect) {
    writeStoredSize(rect.w, rect.h);
    position = placed ? positionOf(rect) : null;
  }
  const io = makeBrowseIo(state.lastCommand?.command);
  const win = (Services.ww as any).openWindow(
    null,
    DIALOG_URL,
    "",
    normalizePersistentOptions(DIALOG_OPTIONS, position),
    io,
  ) as Window;
  browseWindows.add(win);
  if (state.lastCommand?.agent) windowAgents.set(win, state.lastCommand.agent);
  openWindow = win;
  trace(
    "browse window opened",
    `rect=${rect ? `${rect.x},${rect.y} ${rect.w}x${rect.h}` : "default"}`,
  );
  (Zotero as any).Utilities.Internal.activate(win);
  if (rect) pinRect(win, rect, placed);
  win.addEventListener("unload", () => {
    // about:blank is unloaded before the dialog (integration.js:498), that is not a close
    if (win.location.toString() === "about:blank") return;
    if (openWindow === win) openWindow = null;
    trace("browse window closed");
  });
  io.accept = () => {
    // the dialog's accept() already collapsed the view; the original is dead afterwards.
    // Only insert when a selection exists (cancel clears citationItems before).
    const items = (io.citation?.citationItems ?? []).map((i: any) => ({
      ...i,
    }));
    if (!items.length) return undefined;
    if (!state.lastCommand) {
      logError("browse insert", new Error("no command known"));
      return undefined;
    }
    const live = captureLive(win);
    writeStoredSize(live.w, live.h);
    insertFromBrowse({ items, rect: live });
    return undefined;
  };
}

/**
 * Insert from the companion window: re-runs the last command (addAnnotation / addEditCitation).
 * The selection sits in pendingInsert; displayDialog passes it to the command. Afterwards the
 * companion window reopens at the same position.
 */
function insertFromBrowse(pend: PendingInsert): void {
  const integ = (Zotero as any).Integration;
  const cmd = state.lastCommand!;
  state.pendingInsert = pend;
  // leave currentWindow empty, otherwise shouldAbortCommand aborts the companion window (integration.js:358-373)
  integ.currentWindow = false;
  trace("insert from browse window", `items=${pend.items.length}`);
  Promise.resolve(
    integ.execCommand(
      cmd.agent,
      cmd.command || "addAnnotation",
      cmd.docId,
      cmd.templateVersion,
    ),
  )
    .catch((e: unknown) => logError("browse insert", e))
    .then(async () => {
      if (state.pendingInsert) {
        trace("insert did not reach the command", "");
        state.pendingInsert = null;
      }
      // The command failed before displayDialog: the collapsed window is still open.
      // Close first, then open a fresh window (otherwise two windows and a corrupted position).
      await closeBrowse();
      if (readPersistentPref()) openBrowse(pend.rect);
    });
}

/**
 * Wraps io.accept once per dialog: on an accepted insert the position is
 * kept and the companion window is opened after the command. Uses readPersistentPref()
 * and lastCommand on insert. Reused by openNew (persistent path) and by
 * activatePersistentOnOpenDialog (later clicking the checkbox in the native dialog).
 */
function wrapPersistentAccept(
  win: Window,
  io: any,
  command: Promise<unknown>,
): AcceptState {
  const acceptState: AcceptState = { live: null };
  if (
    !io ||
    typeof io.accept !== "function" ||
    io.__flexannotatePersistentHooked
  )
    return acceptState;
  io.__flexannotatePersistentHooked = true;
  const origAccept = io.accept;
  io.accept = function (this: unknown, ...args: unknown[]) {
    trace("io.accept entered", cw());
    acceptState.live = null;
    try {
      // The switch is read on insert. Cancel clears citationItems before accept.
      if (readPersistentPref() && io.citation?.citationItems?.length) {
        // before anything that closes the window: keep the user's geometry
        acceptState.live = captureLive(win);
        const at = acceptState.live;
        (command || Promise.resolve()).then(() => {
          trace("command finished", `dialogClosed=${win.closed} ${cw()}`);
          if (!win.closed) win.close();
          // companion window for Word for Windows and LibreOffice Writer; other agents (http): none
          if (
            readPersistentPref() &&
            state.lastCommand &&
            isPersistentAgent(state.lastCommand.agent)
          )
            openBrowse(at);
        });
      }
    } catch (e) {
      logError("accept", e);
    }
    const result = origAccept.apply(this, args);
    // Zotero just wrote windowParams with the outer size (cleanupBeforeDialogClosing); ours counts
    if (acceptState.live)
      writeStoredSize(acceptState.live.w, acceptState.live.h);
    trace("io.accept finished", cw());
    return result;
  };
  return acceptState;
}

/**
 * Called when the checkbox is activated later (on an already open, native
 * dialog). Installs the accept wrapper on the open window so it reopens as a
 * companion window after the next insert. Finds the current citation dialog via
 * the command context (integration.currentWindow), without changing the native
 * path.
 */
export function activatePersistentOnOpenDialog(): void {
  if (!state.alive) return;
  const integration = (Zotero as any).Integration;
  const win = integration?.currentWindow as Window | undefined;
  if (!win || win.closed) return;
  if (!persistentSupported(win)) return;
  const io = (win as any).io;
  if (!io || typeof io.accept !== "function") return;
  trace("persistent activated on the native dialog", cw());
  wrapPersistentAccept(win, io, integration.currentCommandPromise ?? null);
}

/**
 * Opens the dialog for a real request. The promise resolves when the user
 * accepts or cancels, or when the window is closed without accepting;
 * Zotero waits for that in addEditCitation (integration.js:1615).
 */
function openNew(
  url: string,
  options: string | undefined,
  io: any,
  windowType: string | undefined,
  rect: Rect | null,
  placed = true,
): Promise<void> {
  const integration = (Zotero as any).Integration;
  let position: WindowPosition | null = null;
  if (rect) {
    // screenX/outerWidth are CSS pixels, the features expect device pixels (measured at 125%)
    writeStoredSize(rect.w, rect.h);
    position = placed ? positionOf(rect) : null;
  }
  // End of the running command (integration.js:346-347): after that the companion window opens
  const command: Promise<unknown> =
    integration.currentCommandPromise ?? Promise.resolve();
  const win = (Services.ww as any).openWindow(
    null,
    url,
    "",
    normalizePersistentOptions(options, position),
    io,
  ) as Window;
  if (state.activeAgent) windowAgents.set(win, state.activeAgent);
  windowOpened = true;
  openWindow = win;
  integration.currentWindow = win;
  integration.currentWindowType = windowType;
  trace(
    "dialog opened",
    `rect=${rect ? `${rect.x},${rect.y} ${rect.w}x${rect.h}` : "new"} ${cw()}`,
  );
  (Zotero as any).Utilities.Internal.activate(win);
  if (rect) pinRect(win, rect, placed);

  return new Promise<void>((resolve) => {
    let finished = false;
    // The window stays currentWindow: execCommand's finally closes it (integration.js:312-316)
    const finish = () => {
      if (finished) return;
      finished = true;
      win.removeEventListener("unload", onUnload);
      trace("request finished", cw());
      resolve();
    };
    const onUnload = () => {
      // about:blank is unloaded before the dialog (integration.js:498)
      if (win.location.toString() === "about:blank") return;
      if (openWindow === win) openWindow = null;
      if (integration.currentWindow === win) integration.currentWindow = false;
      finish();
    };
    win.addEventListener("unload", onUnload);
    if (io && typeof io.promise?.then === "function") {
      io.promise.then(
        () => trace("io.promise settled"),
        () => trace("io.promise rejected"),
      );
    }
    if (io && typeof io.accept === "function") {
      // io.cancel calls this.accept() (citationDialog.js:189, integration.js:1844-1846):
      // the persistent wrapper (wrapPersistentAccept) catches both. finish() reports the
      // window back to openNew and runs before the native accept, as before.
      wrapPersistentAccept(win, io, command);
      const origAccept = io.accept;
      io.accept = function (this: unknown, ...args: unknown[]) {
        finish();
        return origAccept.apply(this, args);
      };
    }
  });
}

/**
 * Request from Zotero: an open companion window is closed, the dialog is opened at the
 * same position and with the same size.
 */
async function openPersistent(
  url: string,
  options: string | undefined,
  io: any,
  windowType: string | undefined,
): Promise<void> {
  const integration = (Zotero as any).Integration;
  windowOpened = false;
  // Like integration.js:481-482: start cleanup, hide progress; an error there is only logged
  const cleanupPromise = (
    integration.currentDoc?.cleanup?.() ?? Promise.resolve()
  ).catch((e: unknown) => logError("cleanup", e));
  await integration.currentSession?.progressBar?.hide?.(true);
  integration.currentWindowType = windowType;

  let rect: Rect | null = null;
  let placed = true;
  const old = getPersistentWindow();
  if (old) {
    // the geometry old currently has (target of the pinning or measured live)
    rect = captureLive(old);
    trace(
      "closes the open window",
      `rect=${rect.x},${rect.y} ${rect.w}x${rect.h}`,
    );
    // close() suffices: an open task is ended via cancel() in the dialog's onUnload
    // (citationDialog.js:193-195); io.cancel() before would run twice.
    old.close();
    openWindow = null;
  } else {
    // first dialog since start: the last remembered position (otherwise standard window)
    const stored = readStoredRect();
    if (stored) {
      rect = stored.rect;
      placed = stored.placed;
    }
  }
  await openNew(url, options, io, windowType, rect, placed);
  trace("request settled, waiting for cleanup");
  await cleanupPromise;
  trace("cleanup settled, displayDialog resolves");
}

let installed: InstalledMethod<DisplayDialogFn> | null = null;

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
    // Insert from the companion window: the command gets the remembered selection, without a window
    if (state.pendingInsert && url.includes(DIALOG_MARK) && io) {
      const pend = state.pendingInsert;
      state.pendingInsert = null;
      const realIo = io as any;
      // The companion window closes before the insert, like the dialog in the original before cleanup/complete
      await closeBrowse();
      realIo.citation.citationItems = mergeCitationItems(
        realIo.citation.citationItems,
        pend.items,
      );
      trace("insert into the command's io", `items=${pend.items.length}`);
      realIo.accept(() => {});
      return;
    }
    const persistent = readPersistentPref() && url.includes(DIALOG_MARK);
    trace(
      "displayDialog entered",
      `${persistent ? "persistent" : "native"} ${cw()}`,
    );
    if (!persistent) {
      // Option off: a companion window closes now
      await closeBrowse();
      return native.call(this, url, options, io, windowType);
    }
    try {
      return await openPersistent(url, options, io, windowType);
    } catch (e) {
      // Failed before opening: the normal path is safe and shows the error as usual
      if (windowOpened) {
        // The window already exists: a second dialog on the same io would be wrong
        logError("openPersistent after open", e);
        return;
      }
      logError("openPersistent", e);
      return native.call(this, url, options, io, windowType);
    }
  };

  if (!assignChecked(integration, "displayDialog", patched)) {
    ztoolkit.log("FlexAnnotate: assignChecked for displayDialog failed");
    return false;
  }
  installed = { target: integration, name: "displayDialog", native, patched };
  return true;
}

export function unpatchDisplayDialog(): void {
  if (!installed) return;
  const entry = installed;
  installed = null;
  restoreMethod(entry);
}
