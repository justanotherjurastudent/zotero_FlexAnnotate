/**
 * Dauerhaftes Begleitfenster ("Blätterfenster") für Word und LibreOffice.
 *
 * Ist die Option an, bleibt nach jeder Einfügung der Zitierdialog als Blätterfenster
 * offen: Er zeigt wieder die normale Ansicht (Sammlungen, alle Annotationen, Suche),
 * so dass man die nächste Annotation auswählen und einfügen kann, ohne Word zu verlassen.
 *
 * Ablauf:
 * 1. Eine echte Anfrage aus Word öffnet den Dialog (openNew). Nach "Einfügen" im Dialog
 *    läuft der Befehl zu Ende; execCommand schließt dabei currentWindow (integration.js
 *    :312-316). Danach öffnen wir das Blätterfenster an derselben Stelle.
 * 2. Im Blätterfenster ist "Einfügen" ein Befehl an Word: Die Auswahl wird gemerkt
 *    (pendingInsert), dann läuft execCommand(agent, "addAnnotation", docId, templateVersion)
 *    erneut. Dessen Dialog (displayDialog) öffnet kein Fenster mehr, sondern übergibt die
 *    gemerkte Auswahl an den echten io und akzeptiert ihn, so dass Word die Fußnote an der
 *    Cursorposition erhält. Vorher schließen wir das Blätterfenster.
 * 3. Eine echte Anfrage schließt ein offenes Blätterfenster und öffnet den Dialog an
 *    derselben Stelle. Schließt der Nutzer das Blätterfenster mit X, endet die Option bis
 *    zur nächsten echten Anfrage.
 *
 * Warum das Blätterfenster nicht der alte Dialog bleibt: Der Dialog liest io nur in onLoad
 * aus window.arguments[0] (citationDialog.js:60-62), und accept() klappt ihn ein und meldet
 * die Listen ab (citationDialog.js:159-170, 221-222). Er ist danach tot und wird neu
 * geöffnet. Beobachtung des Nutzers in Word: Der Fußnotentext erscheint erst, wenn der
 * Dialog schließt (Ursache ungeklärt).
 *
 * Anchors (Zotero 10.0.5, docs/anchors.md): integration.js:240-347 (execCommand),
 * :781-798 (addAnnotation = cite(null, false, true)), :1509-1600 (cite, io),
 * :1611-1615 (displayDialog ohne await, io.promise), citationDialog.js:155-196 (accept/cancel).
 */

import type { Feature } from "../../../shared/feature";
import { assignChecked } from "../../../shared/patch";
import { normalizePersistentOptions } from "../logic/persistentOptions";
import type { WindowPosition } from "../logic/persistentOptions";
import { parseStoredRect, serializeRect } from "../logic/persistentRect";
import { mergeCitationItems, nextLastCommand } from "../logic/lastCommand";
import type { CommandRef } from "../logic/lastCommand";

const PREF = "persistentCitationDialog";
const DIALOG_MARK = "citationDialog.xhtml";
const DIALOG_URL = `chrome://zotero/content/integration/${DIALOG_MARK}`;
const WINDOW_PARAMS_PREF = "integration.citationDialog.windowParams";
/** Fensteroptionen des normalen Zitierdialogs (integration.js:1603-1609). */
const DIALOG_OPTIONS = "chrome,centerscreen,resizable=true,alwaysRaised";

/** Rect in CSS-Pixeln (screenX/outerWidth) plus devicePixelRatio. */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  dpr: number;
}

/** Ziel des Accept-Wrappers: Lage + optional Höhe, Quelle für das nächste Fenster. */
interface AcceptState {
  live: Rect | null;
}

/**
 * Agenten, für die das Blätterfenster nach dem Einfügen wieder geöffnet wird.
 *
 * WinWord: getestet. LibreOffice: das erneute Einfügen läuft durch den synchronen
 * sendCommand-Pfad (zoteroLibreOfficeIntegration.mjs:270-288), der einen verschachtelten
 * Event-Loop ohne Timeout blockiert; die normale Einfügung funktioniert in Writer über
 * denselben Pfad und wurde vom Nutzer bestätigt. MacWord: die macOS-Integration spricht
 * asynchron über ChromeWorker + Scripting Bridge (zotero-word-for-mac-integration), blockiert
 * den Haupt-Thread also nicht wie LibreOffice; freigegeben, realer Mac-Test steht aus.
 * http (Google Docs) bleibt außen vor: ein erneuter Befehl ließe den Server hängen
 * (server.js:525-527).
 */
export function isPersistentAgent(
  agent: string | null | undefined,
): agent is string {
  return agent === "WinWord" || agent === "LibreOffice" || agent === "MacWord";
}

/** Auswahl aus dem Blätterfenster, die beim nächsten Befehl eingefügt wird. */
interface PendingInsert {
  items: any[];
  rect: Rect;
}

function prefKey(name: string): string {
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

/** Das offene Fenster (Blätterfenster oder laufender Dialog), sonst null. */
let openWindow: Window | null = null;
/** Fenster, die als Blätterfenster geöffnet wurden. */
const browseWindows = new WeakSet<Window>();
let activeAgent: string | null = null;
const windowAgents = new WeakMap<Window, string>();
let lastCommand: CommandRef | null = null;
let pendingInsert: PendingInsert | null = null;
/** Zwischen start() und stop(): nur dann darf ein Blätterfenster entstehen. */
let alive = false;
/** Gesetzt, sobald openNew das Fenster angelegt hat (danach kein Fallback mehr auf den Standarddialog). */
let windowOpened = false;

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
  if (activeAgent !== null) {
    windowAgents.set(win, activeAgent);
    return isPersistentAgent(activeAgent);
  }
  if (lastCommand !== null) {
    return isPersistentAgent(lastCommand.agent);
  }
  return true;
}

export function getPersistentWindow(): Window | null {
  if (openWindow && !openWindow.closed) return openWindow;
  openWindow = null;
  return null;
}

type DisplayDialogFn = (
  this: unknown,
  url: string,
  options?: string,
  io?: unknown,
  windowType?: string,
) => Promise<void>;

interface InstalledMethod<F> {
  target: Record<string, any>;
  name: string;
  native: F;
}

let installed: InstalledMethod<DisplayDialogFn> | null = null;
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
    // Ohne laufende Integration-Transaktion (nach addEditCitation) kein Fortschrittsfenster mehr.
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
  installedProgress = { target: proto, name: "show", native };
  return true;
}

export function unpatchProgressBar(): void {
  if (!installedProgress) return;
  const { target, name, native } = installedProgress;
  installedProgress = null;
  assignChecked(target, name, native);
}

/**
 * Zotero erzwingt im Bibliotheks-Layout eine Mindestbreite von 1000 px (citationDialog.js:510,
 * resizeWindow vergrößert das Fenster sonst). Im Begleitfenster soll es schmaler gehen. shortcut: 360 px
 * ist die Untergrenze des Layouts (CSS), upgrade wenn die Spalten anders gebaut werden. Das Listen-
 * Layout nutzt MIN_WIDTH als Höchstbreite (citationDialog.js:1180), es bleibt unverändert.
 */
export function relaxDialogMinWidth(win: Window): void {
  const w = win as any;
  if (w.libraryLayout) w.libraryLayout.MIN_WIDTH = 360;
  // zotero.css setzt zusaetzlich min-width 800/1000 px auf #citation-dialog (-moz-platform-unabhaengig)
  const doc = win.document;
  // Schaltet die schmale Ansicht (LAYOUT_CSS) nur fuer dieses Fenster ein
  doc.documentElement!.setAttribute("flexannotate-persistent", "");
  if (!doc.getElementById("flexannotate-persistent-style")) {
    const st = doc.createElement("style");
    st.id = "flexannotate-persistent-style";
    st.textContent =
      "#citation-dialog,#citation-dialog[dialog-layout=library]{min-width:0 !important;}";
    doc.documentElement!.appendChild(st);
  }
}

/** Schreibt die Größe in die Zotero-Pref, die onLoad beim Öffnen einliest (citationDialog.js:96-100). */
function writeStoredSize(width: number, height: number) {
  try {
    const all = JSON.parse(
      (Zotero as any).Prefs.get(WINDOW_PARAMS_PREF) || "{}",
    );
    // onLoad liest den Schlüssel des Startmodus (citationDialog.js:96-100): alle Modi schreiben
    for (const mode of ["library", "list"]) {
      all[mode] = { ...(all[mode] || {}), width, height };
    }
    (Zotero as any).Prefs.set(WINDOW_PARAMS_PREF, JSON.stringify(all));
  } catch (e) {
    ztoolkit.log("flexannotate persistent size write failed:", e);
  }
}

/** Zotero ändert Größe und Position noch nach dem Laden (onLoad, resizeWindow, Animation). */
const PIN_MS = 5000;
/**
 * Ladephase: Lage und Größe werden bis hierher festgehalten. Sie endet LOAD_SETTLE_MS nach dem
 * Laden (DIALOG_STATE.loaded), spätestens LOAD_CAP_MS nach dem Öffnen. Danach hält der Pin die Lage
 * nicht mehr, weil der Nutzer sie ab dann verschiebt (ein Verschieben ändert keine Größe und löst
 * kein resize-Ereignis aus, also ließe sich ein Pin dafür nicht unterscheiden).
 */
const LOAD_SETTLE_MS = 500;
const LOAD_CAP_MS = 1500;
/** Obergrenze für Korrekturen (Schutz gegen Hin-und-her mit Zotero, z. B. bei der Mindesthöhe). */
const MAX_FIXES = 30;
/** Live-Geometrie je Fenster (Innenmaße, Position): Quelle für das nächste Fenster. */
const liveRects = new WeakMap<Window, Rect>();
/** Fenster, deren Festhalten vorbei ist: ab dann misst captureLive das Fenster neu. */
const pinEnded = new WeakSet<Window>();

/** Rahmen und Titelleiste: outer minus inner. */
function chromeOf(win: Window): { w: number; h: number } {
  return {
    w: win.outerWidth - win.innerWidth,
    h: win.outerHeight - win.innerHeight,
  };
}

/** Die Geometrie für das nächste Fenster. Während des Festhaltens das Ziel, danach frisch gemessen. */
function captureLive(win: Window): Rect {
  // akzeptiert: Zotero hat schon eingeklappt (citationDialog.js:157-171); die Lage vor dem Accept gilt
  if ((win as any).accepted) return liveRects.get(win) ?? rectOf(win);
  if (pinEnded.has(win) || !liveRects.has(win)) liveRects.set(win, rectOf(win));
  const r = liveRects.get(win)!;
  rememberRect(r);
  return r;
}

/** Die zuletzt gemerkte Lage des Blätterfensters (Pref persistentWindowRect, über Neustarts). */
const RECT_PREF = "persistentWindowRect";
let pendingRect = "";
let lastRect = "";
let writeTimer: unknown = null;

function mainWin(): Window | null {
  try {
    return (Zotero as any).getMainWindow?.() ?? null;
  } catch {
    return null;
  }
}

/** Merkt die Lage, entprellt (500 ms), nie werfend. Geschrieben wird nur bei Änderung. */
function rememberRect(r: Rect): void {
  try {
    pendingRect = serializeRect(r);
    const w = mainWin();
    if (!w) return flushRect();
    if (!writeTimer) writeTimer = w.setTimeout(flushRect, 500);
  } catch (e) {
    logError("remember rect", e);
  }
}

function flushRect(): void {
  writeTimer = null;
  try {
    if (!pendingRect || pendingRect === lastRect) return;
    Zotero.Prefs.set(prefKey(RECT_PREF), pendingRect, true);
    lastRect = pendingRect;
  } catch (e) {
    logError("write rect", e);
  }
}

function trackLive(win: Window): void {
  if ((win as any).accepted) return; // eingeklappt: nicht übernehmen und nicht in die Pref schreiben
  liveRects.set(win, rectOf(win));
  rememberRect(liveRects.get(win)!);
}

/** Lage für den ersten Dialog nach dem Start: validiert (parseStoredRect), sonst null (Standard). */
function readStoredRect(): { rect: Rect; placed: boolean } | null {
  try {
    const main = mainWin();
    const s: any = main?.screen;
    const area = s
      ? {
          left: s.availLeft,
          top: s.availTop,
          width: s.availWidth,
          height: s.availHeight,
        }
      : null;
    const r = parseStoredRect(
      String(Zotero.Prefs.get(prefKey(RECT_PREF), true) ?? ""),
      area,
    );
    if (!r) return null;
    return {
      rect: {
        x: r.x ?? 0,
        y: r.y ?? 0,
        w: r.w,
        h: r.h,
        dpr: main?.devicePixelRatio || 1,
      },
      placed: r.x !== undefined,
    };
  } catch (e) {
    logError("read rect", e);
    return null;
  }
}

/**
 * Hält Innenmaße und Position für PIN_MS an `rect` fest. Zotero resized den Dialog nach dem Öffnen
 * mehrfach (gespeicherte Größe, resizeWindow mit Mindestbreite, Animation), daher wird über
 * einen Fenstertimer nachgezogen. Die Lage nur in der Ladephase, die Größe bis zur ersten fremden Größenänderung danach.
 */
function pinRect(win: Window, rect: Rect, placed = true): void {
  const host = mainWin() || win;
  const start = Date.now();
  liveRects.set(win, rect);
  let fixes = 0;
  let stopped = false;
  // Ende der Ladephase: danach fasst der Pin die Lage nicht mehr an (der Nutzer darf verschieben)
  let loadEnd: number | null = null;
  let ours = { w: -1, h: -1 };
  const off = (a: number, b: number, tol: number) => Math.abs(a - b) > tol;
  const inLoad = () => loadEnd === null || Date.now() < loadEnd;
  // Zotero ruft resizeTo/moveTo selbst auf (smoothResize zeitbasiert, helpers.mjs:449-492, resizeWindow):
  // in der Haltephase wird jeder Aufruf auf das Ziel begrenzt. shortcut: nur resizeTo/moveTo, Zotero
  // setzt die Größe nicht anders; upgrade wenn ein Zotero-Pfad direkt über Fenster-Internas geht.
  const nativeResize = win.resizeTo.bind(win);
  const nativeMove = win.moveTo.bind(win);
  const pinning = () => !stopped && Date.now() - start <= PIN_MS;
  // resizeTo setzt die äußere Größe: Innenmaß plus Rahmen
  const outerTarget = () => {
    const c = chromeOf(win);
    return { w: rect.w + c.w, h: rect.h + c.h };
  };
  (win as any).resizeTo = (w: number, h: number) => {
    if (!pinning()) return nativeResize(w, h);
    const o = outerTarget();
    return nativeResize(o.w, o.h);
  };
  (win as any).moveTo = (x: number, y: number) =>
    pinning() && placed && inLoad()
      ? nativeMove(rect.x, rect.y)
      : nativeMove(x, y);
  const release = () => {
    (win as any).resizeTo = nativeResize;
    (win as any).moveTo = nativeMove;
  };
  const timer = host.setInterval(() => {
    if (win.closed) {
      host.clearInterval(timer);
      release();
      return;
    }
    if (stopped || fixes >= MAX_FIXES || Date.now() - start > PIN_MS) {
      host.clearInterval(timer);
      release();
      pinEnded.add(win);
      trackLive(win);
      // ab jetzt die Geometrie laufend mitschreiben (nur lesen): der Nutzer darf verschieben und vergrößern
      const tracking = host.setInterval(() => {
        if (win.closed) {
          host.clearInterval(tracking);
          return;
        }
        trackLive(win);
      }, 200);
      return;
    }
    if (
      loadEnd === null &&
      ((win as any).DIALOG_STATE?.loaded || Date.now() - start >= LOAD_CAP_MS)
    ) {
      loadEnd = Math.min(Date.now() + LOAD_SETTLE_MS, start + LOAD_CAP_MS);
    }
    // Mindestbreite (CSS und Layout) wirkt schon beim Laden, vor inject: senken, sobald die Seite da ist
    const layouts = win as any;
    const relaxed =
      layouts.libraryLayout?.MIN_WIDTH === 360 &&
      !!win.document.getElementById("flexannotate-persistent-style");
    if (!relaxed && win.location.href !== "about:blank") {
      relaxDialogMinWidth(win);
    }
    const sizeOff =
      off(win.innerWidth, rect.w, 2) || off(win.innerHeight, rect.h, 2);
    // die Lage nur während der Ladephase halten: danach kann der Nutzer verschieben
    const posOff =
      placed &&
      inLoad() &&
      (off(win.screenX, rect.x, 4) || off(win.screenY, rect.y, 4));
    if (sizeOff || posOff) {
      fixes++;
      if (sizeOff) {
        const o = outerTarget();
        ours = o;
        nativeResize(o.w, o.h);
      }
      if (posOff) nativeMove(rect.x, rect.y);
      trace("pin corrected", `n=${fixes}`);
    } else if (!inLoad()) {
      trackLive(win);
    }
  }, 20);
  win.addEventListener("resize", () => {
    const ourSize = win.outerWidth === ours.w && win.outerHeight === ours.h;
    // erste fremde Größenänderung nach der Ladephase beendet das Festhalten der Größe
    if (!ourSize && loadEnd !== null && !inLoad()) stopped = true;
  });
}

function rectOf(win: Window): Rect {
  return {
    x: win.screenX,
    y: win.screenY,
    // Innenmaße: openWindow-Features setzen die Innengröße, Zotero resizeTo die äußere
    w: win.innerWidth,
    h: win.innerHeight,
    dpr: win.devicePixelRatio || 1,
  };
}

/** Features für openWindow: Position und Größe in Geräte-Pixeln (bei 125 % gemessen). */
function positionOf(rect: Rect): WindowPosition {
  return {
    left: rect.x * rect.dpr,
    top: rect.y * rect.dpr,
    width: rect.w * rect.dpr,
    height: rect.h * rect.dpr,
  };
}

/** Ablauf-Protokoll (ms seit Start des Fensters); ztoolkit.log und Zotero.debug. */
// performance.now() gibt es im Plugin-Scope nicht; Date.now() reicht für das Protokoll.
const TRACE_START = Date.now();
function trace(event: string, detail = "") {
  try {
    const ms = Date.now() - TRACE_START;
    const msg = `FlexAnnotate persistent [${ms}ms] ${event}${detail ? ` ${detail}` : ""}`;
    ztoolkit.log(msg);
    Zotero.debug(msg);
  } catch {
    // Protokoll darf den Ablauf nie stoeren
  }
}

function cw(): string {
  try {
    const w = (Zotero as any).Integration?.currentWindow;
    return `currentWindow=${w ? (w.closed ? "closed" : "open") : String(w)}`;
  } catch {
    return "currentWindow=?";
  }
}

function logError(where: string, e: unknown) {
  ztoolkit.log(`FlexAnnotate persistent ${where} failed:`, e);
  try {
    Zotero.logError(e as Error);
  } catch {
    // Zotero.logError fehlt ggf. in Testumgebungen
  }
}

/**
 * io für das Blätterfenster: wie der vorherige Befehl (addAnnotation oder addEditCitation),
 * ohne Dokument. Der Dialog liest nur diese Felder (citationDialog.js, searchHandler.mjs).
 */
function makeBrowseIo(command = "addAnnotation"): any {
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

function currentAgent(iface?: any): string | null {
  return activeAgent || iface?._session?.agent || lastCommand?.agent || null;
}

/**
 * Ermittelt die Geometrie für das nächste Blätterfenster: ein bereits offenes Fenster wird
 * gemessen und geschlossen; sonst die zuletzt gespeicherte Geometrie aus der Pref.
 */
async function prepareTargetRect(): Promise<{
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
function openBrowse(rect?: Rect | null, placed = true): void {
  // nach stop() kein neues Blätterfenster mehr (ein verspäteter Aufruf aus einem Befehl)
  if (!alive) return;
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
  const io = makeBrowseIo(lastCommand?.command);
  const win = (Services.ww as any).openWindow(
    null,
    DIALOG_URL,
    "",
    normalizePersistentOptions(DIALOG_OPTIONS, position),
    io,
  ) as Window;
  browseWindows.add(win);
  if (lastCommand?.agent) windowAgents.set(win, lastCommand.agent);
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
    if (!lastCommand) {
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
  const cmd = lastCommand!;
  pendingInsert = pend;
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
      if (pendingInsert) {
        trace("insert did not reach the command", "");
        pendingInsert = null;
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
  const state: AcceptState = { live: null };
  if (
    !io ||
    typeof io.accept !== "function" ||
    io.__flexannotatePersistentHooked
  )
    return state;
  io.__flexannotatePersistentHooked = true;
  const origAccept = io.accept;
  io.accept = function (this: unknown, ...args: unknown[]) {
    trace("io.accept entered", cw());
    state.live = null;
    try {
      // Der Schalter wird beim Einfuegen gelesen. Abbrechen leert citationItems vor dem accept.
      if (readPersistentPref() && io.citation?.citationItems?.length) {
        // vor allem, was das Fenster schließt: die Geometrie des Nutzers festhalten
        state.live = captureLive(win);
        const at = state.live;
        (command || Promise.resolve()).then(() => {
          trace("command finished", `dialogClosed=${win.closed} ${cw()}`);
          if (!win.closed) win.close();
          // Blätterfenster für Word für Windows und LibreOffice Writer; andere Agenten (http): keins
          if (
            readPersistentPref() &&
            lastCommand &&
            isPersistentAgent(lastCommand.agent)
          )
            openBrowse(at);
        });
      }
    } catch (e) {
      logError("accept", e);
    }
    const result = origAccept.apply(this, args);
    // Zotero hat eben windowParams mit der äußeren Größe geschrieben (cleanupBeforeDialogClosing); unsere gilt
    if (state.live) writeStoredSize(state.live.w, state.live.h);
    trace("io.accept finished", cw());
    return result;
  };
  return state;
}

/**
 * Wird aufgerufen, wenn die Checkbox nachträglich (bei einem bereits geöffneten, nativen
 * Dialog) aktiviert wird. Installiert den Accept-Wrapper auf dem offenen Fenster, damit es
 * nach dem nächsten Einfügen als Blätterfenster wieder aufgeht. Findet den aktuellen
 * Zitierdialog über den Befehlskontext (integration.currentWindow), ohne den nativen Pfad
 * zu verändern.
 */
export function activatePersistentOnOpenDialog(): void {
  if (!alive) return;
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
  if (activeAgent) windowAgents.set(win, activeAgent);
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
    if (pendingInsert && url.includes(DIALOG_MARK) && io) {
      const pend = pendingInsert;
      pendingInsert = null;
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
  installed = { target: integration, name: "displayDialog", native };
  return true;
}

export function unpatchDisplayDialog(): void {
  if (!installed) return;
  const { target, name, native } = installed;
  installed = null;
  assignChecked(target, name, native);
}

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
  return openWindow!;
}

/**
 * Test-Hilfe: Befehl ohne Word vormerken (sonst merkt sich patchExecCommand ihn beim Befehl selbst).
 */
export function lastCommandForTest(): CommandRef | null {
  return lastCommand;
}

export function rememberCommandForTest(ref: CommandRef | null): void {
  lastCommand = ref;
  activeAgent = ref?.agent ?? null;
}

export function setPendingInsertForTest(pend: PendingInsert | null): void {
  pendingInsert = pend;
}

export function makeBrowseIoForTest(command = "addAnnotation"): any {
  return makeBrowseIo(command);
}

/** Merkt sich bei jedem Befehl, an welches Dokument Word ihn geschickt hat (integration.js:240). */
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
    // WinWord und LibreOffice: der Befehl wird im Blätterfenster erneut ausgeführt. Für
    // http (Google Docs) würde das den Server hängen lassen (server.js:525-527), deshalb
    // bleibt http außen vor.
    activeAgent = agent;
    lastCommand = nextLastCommand(
      lastCommand,
      isPersistentAgent(agent),
      agent,
      command,
      docId,
      templateVersion,
    );
    try {
      return await native.call(this, agent, command, docId, templateVersion);
    } finally {
      activeAgent = null;
    }
  };
  if (!assignChecked(integration, "execCommand", patched)) {
    ztoolkit.log("FlexAnnotate: assignChecked for execCommand failed");
    return false;
  }
  installedExec = { target: integration, name: "execCommand", native };
  return true;
}

export function unpatchExecCommand(): void {
  if (!installedExec) return;
  const { target, name, native } = installedExec;
  installedExec = null;
  assignChecked(target, name, native);
}

async function interceptCommand(
  iface: any,
  agent: string | null,
  command: "addEditCitation" | "addAnnotation",
  nativeFn: (field?: any) => Promise<unknown>,
  docField?: any,
): Promise<unknown> {
  if (!readPersistentPref() || !isPersistentAgent(agent) || pendingInsert) {
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

  lastCommand = nextLastCommand(
    lastCommand,
    true,
    agent,
    command,
    lastCommand?.docId,
    lastCommand?.templateVersion ?? 0,
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
 * Fängt addEditCitation und addAnnotation am Interface-Prototyp ab: Ist der Begleitmodus aktiv,
 * erzeugt ein neuer Aufruf keinen Fußnoten-Platzhalter in Word, sondern schließt die Word-Transaktion
 * sofort ab und öffnet das Blätterfenster. Steht der Cursor in einem bestehenden Zitat, läuft der
 * native Pfad weiter.
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
    };
  }

  return true;
}

export function unpatchInterfaceMethods(): void {
  if (installedAddEditCitation) {
    const { target, name, native } = installedAddEditCitation;
    installedAddEditCitation = null;
    assignChecked(target, name, native);
  }
  if (installedAddAnnotation) {
    const { target, name, native } = installedAddAnnotation;
    installedAddAnnotation = null;
    assignChecked(target, name, native);
  }
}

export const persistentDialogPatch: Feature = {
  name: "persistentDialogPatch",
  start() {
    // Zotero ohne Annotationsmodus-Befehl (8.x, 7.x: integration.js ohne Interface.prototype.addAnnotation):
    // nichts patchen, das Blätterfenster und der Schalter entfallen dort
    if (!persistentSupported()) return;
    alive = true;
    // ohne Befehlsmerker würde ein Blätterfenster den Dialog verschlucken: lieber gar nicht patchen
    if (
      !patchDisplayDialog() ||
      !patchExecCommand() ||
      !patchInterfaceMethods()
    ) {
      unpatchDisplayDialog();
      unpatchExecCommand();
      unpatchInterfaceMethods();
      alive = false;
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
    alive = false;
    flushRect();
    if (writeTimer) mainWin()?.clearTimeout(writeTimer as number);
    writeTimer = null;
    unpatchDisplayDialog();
    unpatchProgressBar();
    unpatchExecCommand();
    unpatchInterfaceMethods();
    pendingInsert = null;
    lastCommand = null;
    activeAgent = null;
    const win = getPersistentWindow();
    openWindow = null;
    if (win) {
      try {
        win.close();
      } catch {
        // Fenster wurde möglicherweise bereits geschlossen
      }
    }
  },
};
