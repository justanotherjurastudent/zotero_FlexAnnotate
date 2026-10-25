/**
 * Lage/Größe des persistenten Begleitfensters: Festhalten während der
 * Ladephase (Zotero vergrößert den Dialog beim Öffnen mehrfach), laufendes
 * Festschreiben nach der Ladephase und die gespeicherte Geometrie für die
 * nächste Öffnung (Pref `persistentWindowRect`, über Neustarts).
 */

import type { WindowPosition } from "../logic/persistentOptions";
import { parseStoredRect, serializeRect } from "../logic/persistentRect";
import {
  logError,
  mainWin,
  prefKey,
  RECT_PREF,
  type Rect,
  trace,
} from "./persistentState";

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

/** Die zuletzt gemerkte Lage des Blätterfensters (Pref persistentWindowRect, über Neustarts). */
let pendingRect = "";
let lastRect = "";
let writeTimer: unknown = null;

/**
 * Zotero liest die gespeicherte Größe beim Öffnen aus dieser Pref ein (citationDialog.js:96-100).
 * onLoad liest den Schlüssel des Startmodus: alle Modi schreiben wir.
 */
const WINDOW_PARAMS_PREF = "integration.citationDialog.windowParams";

/** Rahmen und Titelleiste: outer minus inner. */
function chromeOf(win: Window): { w: number; h: number } {
  return {
    w: win.outerWidth - win.innerWidth,
    h: win.outerHeight - win.innerHeight,
  };
}

export function rectOf(win: Window): Rect {
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
export function positionOf(rect: Rect): WindowPosition {
  return {
    left: rect.x * rect.dpr,
    top: rect.y * rect.dpr,
    width: rect.w * rect.dpr,
    height: rect.h * rect.dpr,
  };
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

export function trackLive(win: Window): void {
  if ((win as any).accepted) return; // eingeklappt: nicht übernehmen und nicht in die Pref schreiben
  liveRects.set(win, rectOf(win));
  rememberRect(liveRects.get(win)!);
}

/** Lage für den ersten Dialog nach dem Start: validiert (parseStoredRect), sonst null (Standard). */
export function readStoredRect(): { rect: Rect; placed: boolean } | null {
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

/** Schreibt die Größe in die Zotero-Pref, die onLoad beim Öffnen einliest (citationDialog.js:96-100). */
export function writeStoredSize(width: number, height: number) {
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

/** Die Geometrie für das nächste Fenster. Während des Festhaltens das Ziel, danach frisch gemessen. */
export function captureLive(win: Window): Rect {
  // akzeptiert: Zotero hat schon eingeklappt (citationDialog.js:157-171); die Lage vor dem Accept gilt
  if ((win as any).accepted) return liveRects.get(win) ?? rectOf(win);
  if (pinEnded.has(win) || !liveRects.has(win)) liveRects.set(win, rectOf(win));
  const r = liveRects.get(win)!;
  rememberRect(r);
  return r;
}

/**
 * Hält Innenmaße und Position für PIN_MS an `rect` fest. Zotero resized den Dialog nach dem Öffnen
 * mehrfach (gespeicherte Größe, resizeWindow mit Mindestbreite, Animation), daher wird über
 * einen Fenstertimer nachgezogen. Die Lage nur in der Ladephase, die Größe bis zur ersten fremden Größenänderung danach.
 */
export function pinRect(win: Window, rect: Rect, placed = true): void {
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

/** Beim Stoppen des Features ausstehendes Speichern abgeben (nur lesend ausgeschrieben). */
export function flushStoredRect(): void {
  flushRect();
  if (writeTimer) mainWin()?.clearTimeout(writeTimer as number);
  writeTimer = null;
}
