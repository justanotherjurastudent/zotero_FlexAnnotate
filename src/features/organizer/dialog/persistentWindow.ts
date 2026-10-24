/**
 * Fenster-Lebenszyklus des persistenten Begleitfensters ("Blätterfenster"):
 * öffnen, schließen, Einfügen aus dem Fenster und das Wiederöffnen nach einem
 * echten Befehl (patchDisplayDialog). Das Feature-Objekt liegt in
 * `persistentFeature.ts`, die übrigen Patches in `persistentPatches.ts`.
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
/** Fensteroptionen des normalen Zitierdialogs (integration.js:1603-1609). */
const DIALOG_OPTIONS = "chrome,centerscreen,resizable=true,alwaysRaised";

/** Das offene Fenster (Blätterfenster oder laufender Dialog), sonst null. */
let openWindow: Window | null = null;
/** Fenster, die als Blätterfenster geöffnet wurden. */
const browseWindows = new WeakSet<Window>();
const windowAgents = new WeakMap<Window, string>();
/** Gesetzt, sobald openNew das Fenster angelegt hat (danach kein Fallback mehr auf den Standarddialog). */
let windowOpened = false;

export function getPersistentWindow(): Window | null {
  if (openWindow && !openWindow.closed) return openWindow;
  openWindow = null;
  return null;
}

/**
 * Blätterfenster gibt es nur, wenn Zotero den Befehl addAnnotation hat (integration.js:781 in 9 und 10)
 * und die Plattform unterstützt wird (Word, LibreOffice; nicht Google Docs/http).
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
 * io für das Blätterfenster: wie der vorherige Befehl (addAnnotation oder addEditCitation),
 * ohne Dokument. Der Dialog liest nur diese Felder (citationDialog.js, searchHandler.mjs).
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
    // die Sitzungs-Zitate (grüne Haken); {} ergäbe eine leere Menge statt des Rückfalls (dialogCited.ts)
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

/** Schließt das Blätterfenster, falls offen. */
function closeBrowse(): Promise<void> {
  const win = getPersistentWindow();
  if (!win || !browseWindows.has(win)) return Promise.resolve();
  openWindow = null;
  const gone = new Promise<void>((resolve) =>
    win.addEventListener("unload", () => resolve(), { once: true }),
  );
  win.close();
  // shortcut: 3 s Obergrenze, falls unload nicht kommt; upgrade wenn Zotero ein Ereignis am Fenster liefert
  return Promise.race([gone, Zotero.Promise.delay(3000)]);
}

/**
 * Ermittelt die Geometrie für das nächste Blätterfenster: ein bereits offenes Fenster wird
 * gemessen und geschlossen; sonst die zuletzt gespeicherte Geometrie aus der Pref.
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
 * Öffnet das Blätterfenster an der Stelle `rect`: der Dialog im Modus des letzten Befehls
 * mit einem eigenen io. Einfügen dort ist insertFromBrowse().
 */
export function openBrowse(rect?: Rect | null, placed = true): void {
  // nach stop() kein neues Blätterfenster mehr (ein verspäteter Aufruf aus einem Befehl)
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
    // about:blank wird vor dem Dialog entladen (integration.js:498), das ist kein Schließen
    if (win.location.toString() === "about:blank") return;
    if (openWindow === win) openWindow = null;
    trace("browse window closed");
  });
  io.accept = () => {
    // accept() des Dialogs hat die Ansicht schon eingeklappt; das Original ist danach tot.
    // Nur wenn Auswahl da ist, einfügen (cancel leert citationItems vorher).
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
 * Einfügen aus dem Blätterfenster: den letzten Befehl (addAnnotation / addEditCitation) erneut ausführen.
 * Die Auswahl liegt in pendingInsert; displayDialog übergibt sie an den Befehl. Danach öffnet
 * sich das Blätterfenster wieder an derselben Stelle.
 */
function insertFromBrowse(pend: PendingInsert): void {
  const integ = (Zotero as any).Integration;
  const cmd = state.lastCommand!;
  state.pendingInsert = pend;
  // currentWindow leer lassen, sonst bricht shouldAbortCommand das Blätterfenster ab (integration.js:358-373)
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
      // Der Befehl ist vor displayDialog gescheitert: das eingeklappte Fenster ist noch offen.
      // Erst schließen, dann ein frisches Fenster (sonst zwei Fenster und eine verdorbene Lage).
      await closeBrowse();
      if (readPersistentPref()) openBrowse(pend.rect);
    });
}

/**
 * Wrappt io.accept einmal pro Dialog: Bei einem akzeptierten Einfügen wird die Lage
 * festgehalten und das Blätterfenster nach dem Befehl geöffnet. Nutzt readPersistentPref()
 * und lastCommand beim Einfügen. Wiederverwendet von openNew (persistenter Pfad) und von
 * activatePersistentOnOpenDialog (nachträgliches Anklicken der Checkbox im nativen Dialog).
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
      // Der Schalter wird beim Einfuegen gelesen. Abbrechen leert citationItems vor dem accept.
      if (readPersistentPref() && io.citation?.citationItems?.length) {
        // vor allem, was das Fenster schließt: die Geometrie des Nutzers festhalten
        acceptState.live = captureLive(win);
        const at = acceptState.live;
        (command || Promise.resolve()).then(() => {
          trace("command finished", `dialogClosed=${win.closed} ${cw()}`);
          if (!win.closed) win.close();
          // Blätterfenster für Word für Windows und LibreOffice Writer; andere Agenten (http): keins
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
    // Zotero hat eben windowParams mit der äußeren Größe geschrieben (cleanupBeforeDialogClosing); unsere gilt
    if (acceptState.live)
      writeStoredSize(acceptState.live.w, acceptState.live.h);
    trace("io.accept finished", cw());
    return result;
  };
  return acceptState;
}

/**
 * Wird aufgerufen, wenn die Checkbox nachträglich (bei einem bereits geöffneten, nativen
 * Dialog) aktiviert wird. Installiert den Accept-Wrapper auf dem offenen Fenster, damit es
 * nach dem nächsten Einfügen als Blätterfenster wieder aufgeht. Findet den aktuellen
 * Zitierdialog über den Befehlskontext (integration.currentWindow), ohne den nativen Pfad
 * zu verändern.
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
 * Öffnet den Dialog für eine echte Anfrage. Die Promise löst auf, wenn der Nutzer
 * akzeptiert oder abbricht bzw. das Fenster ohne Akzeptieren geschlossen wird;
 * Zotero wartet darauf in addEditCitation (integration.js:1615).
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
    // screenX/outerWidth sind CSS-Pixel, die Features Geraetepixel (bei 125 % gemessen)
    writeStoredSize(rect.w, rect.h);
    position = placed ? positionOf(rect) : null;
  }
  // Ende des laufenden Befehls (integration.js:346-347): danach öffnet sich das Blätterfenster
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
    // Das Fenster bleibt currentWindow: execCommand's finally schließt es (integration.js:312-316)
    const finish = () => {
      if (finished) return;
      finished = true;
      win.removeEventListener("unload", onUnload);
      trace("request finished", cw());
      resolve();
    };
    const onUnload = () => {
      // about:blank wird vor dem Dialog entladen (integration.js:498)
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
      // io.cancel ruft this.accept() (citationDialog.js:189, integration.js:1844-1846):
      // der persistente Wrapper (wrapPersistentAccept) faengt beides. finish() meldet das
      // Fenster an openNew zurueck und laeuft vor dem nativen accept, wie zuvor.
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
 * Anfrage aus Zotero: ein offenes Blätterfenster wird geschlossen, der Dialog an derselben
 * Stelle mit derselben Größe geöffnet.
 */
async function openPersistent(
  url: string,
  options: string | undefined,
  io: any,
  windowType: string | undefined,
): Promise<void> {
  const integration = (Zotero as any).Integration;
  windowOpened = false;
  // Wie integration.js:481-482: Cleanup starten, Fortschritt ausblenden; ein Fehler dort wird nur protokolliert
  const cleanupPromise = (
    integration.currentDoc?.cleanup?.() ?? Promise.resolve()
  ).catch((e: unknown) => logError("cleanup", e));
  await integration.currentSession?.progressBar?.hide?.(true);
  integration.currentWindowType = windowType;

  let rect: Rect | null = null;
  let placed = true;
  const old = getPersistentWindow();
  if (old) {
    // die Geometrie, die old gerade hat (Ziel des Festhaltens oder laufend gemessen)
    rect = captureLive(old);
    trace(
      "closes the open window",
      `rect=${rect.x},${rect.y} ${rect.w}x${rect.h}`,
    );
    // close() reicht: ein offener Auftrag wird im onUnload des Dialogs ueber cancel() beendet
    // (citationDialog.js:193-195); io.cancel() davor wuerde doppelt laufen.
    old.close();
    openWindow = null;
  } else {
    // erster Dialog seit dem Start: die zuletzt gemerkte Lage (sonst Standardfenster)
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
    // Einfügen aus dem Blätterfenster: der Befehl bekommt die gemerkte Auswahl, ohne Fenster
    if (state.pendingInsert && url.includes(DIALOG_MARK) && io) {
      const pend = state.pendingInsert;
      state.pendingInsert = null;
      const realIo = io as any;
      // Das Blätterfenster schließt vor dem Einfügen, wie der Dialog im Original vor cleanup/complete
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
      // Option aus: ein Blätterfenster schließt jetzt
      await closeBrowse();
      return native.call(this, url, options, io, windowType);
    }
    try {
      return await openPersistent(url, options, io, windowType);
    } catch (e) {
      // Vor dem Öffnen gescheitert: der normale Weg ist sicher und zeigt den Fehler wie gewohnt
      if (windowOpened) {
        // Das Fenster existiert schon: ein zweiter Dialog auf demselben io wäre falsch
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
