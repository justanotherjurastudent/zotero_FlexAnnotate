/**
 * Position/size of the persistent companion window: pinning during the load
 * phase (Zotero resizes the dialog several times when opening), continuous
 * tracking after the load phase, and the saved geometry for the next opening
 * (pref `persistentWindowRect`, across restarts).
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

/** Zotero still changes size and position after loading (onLoad, resizeWindow, animation). */
const PIN_MS = 5000;
/**
 * Load phase: position and size are pinned until here. It ends LOAD_SETTLE_MS after
 * loading (DIALOG_STATE.loaded), at the latest LOAD_CAP_MS after opening. Afterwards the
 * pin no longer touches the position, because the user moves it from then on (moving
 * changes no size and fires no resize event, so a pin could not tell the difference).
 */
const LOAD_SETTLE_MS = 500;
const LOAD_CAP_MS = 1500;
/** Upper bound for corrections (protection against back-and-forth with Zotero, e.g. minimum height). */
const MAX_FIXES = 30;
/** Live geometry per window (inner size, position): source for the next window. */
const liveRects = new WeakMap<Window, Rect>();
/** Windows whose pinning is over: from then on captureLive measures the window fresh. */
const pinEnded = new WeakSet<Window>();

/** The last remembered position of the companion window (pref persistentWindowRect, across restarts). */
let pendingRect = "";
let lastRect = "";
let writeTimer: unknown = null;

/**
 * Zotero reads the saved size from this pref when opening (citationDialog.js:96-100).
 * onLoad reads the key of the start mode: we write all modes.
 */
const WINDOW_PARAMS_PREF = "integration.citationDialog.windowParams";

/** Frame and title bar: outer minus inner. */
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
    // Inner sizes: openWindow features set the inner size, Zotero the outer via resizeTo
    w: win.innerWidth,
    h: win.innerHeight,
    dpr: win.devicePixelRatio || 1,
  };
}

/** Features for openWindow: position and size in device pixels (measured at 125%). */
export function positionOf(rect: Rect): WindowPosition {
  return {
    left: rect.x * rect.dpr,
    top: rect.y * rect.dpr,
    width: rect.w * rect.dpr,
    height: rect.h * rect.dpr,
  };
}

/** Remembers the position, debounced (500 ms), never throws. Only written on change. */
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
  if ((win as any).accepted) return; // collapsed: do not adopt and not write into the pref
  liveRects.set(win, rectOf(win));
  rememberRect(liveRects.get(win)!);
}

/** Position for the first dialog after start: validated (parseStoredRect), otherwise null (default). */
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

/** Writes the size into the Zotero pref that onLoad reads when opening (citationDialog.js:96-100). */
export function writeStoredSize(width: number, height: number) {
  try {
    const all = JSON.parse(
      (Zotero as any).Prefs.get(WINDOW_PARAMS_PREF) || "{}",
    );
    // onLoad reads the key of the start mode (citationDialog.js:96-100): write all modes
    for (const mode of ["library", "list"]) {
      all[mode] = { ...(all[mode] || {}), width, height };
    }
    (Zotero as any).Prefs.set(WINDOW_PARAMS_PREF, JSON.stringify(all));
  } catch (e) {
    ztoolkit.log("flexannotate persistent size write failed:", e);
  }
}

/** Geometry for the next window. During pinning the target, afterwards measured fresh. */
export function captureLive(win: Window): Rect {
  // accepted: Zotero already collapsed (citationDialog.js:157-171); the position before accept counts
  if ((win as any).accepted) return liveRects.get(win) ?? rectOf(win);
  if (pinEnded.has(win) || !liveRects.has(win)) liveRects.set(win, rectOf(win));
  const r = liveRects.get(win)!;
  rememberRect(r);
  return r;
}

/**
 * Pins inner size and position to `rect` for PIN_MS. Zotero resizes the dialog several times
 * after opening (saved size, resizeWindow with minimum width, animation), so a window timer
 * re-applies it. Position only during the load phase, size until the first foreign size change after it.
 */
export function pinRect(win: Window, rect: Rect, placed = true): void {
  const host = mainWin() || win;
  const start = Date.now();
  liveRects.set(win, rect);
  let fixes = 0;
  let stopped = false;
  // End of the load phase: after that the pin no longer touches the position (the user may move)
  let loadEnd: number | null = null;
  let ours = { w: -1, h: -1 };
  const off = (a: number, b: number, tol: number) => Math.abs(a - b) > tol;
  const inLoad = () => loadEnd === null || Date.now() < loadEnd;
  // Zotero calls resizeTo/moveTo itself (smoothResize time-based, helpers.mjs:449-492, resizeWindow):
  // during the hold phase every call is clamped to the target. shortcut: only resizeTo/moveTo, Zotero
  // sets the size no other way; upgrade if a Zotero path goes through window internals directly.
  const nativeResize = win.resizeTo.bind(win);
  const nativeMove = win.moveTo.bind(win);
  const pinning = () => !stopped && Date.now() - start <= PIN_MS;
  // resizeTo sets the outer size: inner size plus frame
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
      // from now on keep writing the geometry (read-only): the user may move and grow
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
    // The minimum width (CSS and layout) already applies on load, before inject: lower it as soon as the page is there
    const layouts = win as any;
    const relaxed =
      layouts.libraryLayout?.MIN_WIDTH === 360 &&
      !!win.document.getElementById("flexannotate-persistent-style");
    if (!relaxed && win.location.href !== "about:blank") {
      relaxDialogMinWidth(win);
    }
    const sizeOff =
      off(win.innerWidth, rect.w, 2) || off(win.innerHeight, rect.h, 2);
    // hold the position only during the load phase: after that the user may move
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
    // the first foreign size change after the load phase ends the size pinning
    if (!ourSize && loadEnd !== null && !inLoad()) stopped = true;
  });
}

/**
 * Zotero enforces a minimum width of 1000 px in the library layout (citationDialog.js:510,
 * resizeWindow otherwise enlarges the window). In the companion window it should be narrower.
 * shortcut: 360 px is the lower bound of the layout (CSS), upgrade when the columns are built
 * differently. The list layout uses MIN_WIDTH as the maximum width (citationDialog.js:1180), it
 * stays unchanged.
 */
export function relaxDialogMinWidth(win: Window): void {
  const w = win as any;
  if (w.libraryLayout) w.libraryLayout.MIN_WIDTH = 360;
  // zotero.css additionally sets min-width 800/1000 px on #citation-dialog (-moz-platform-unabhaengig)
  const doc = win.document;
  // Switches the narrow view (LAYOUT_CSS) on only for this window
  doc.documentElement!.setAttribute("flexannotate-persistent", "");
  if (!doc.getElementById("flexannotate-persistent-style")) {
    const st = doc.createElement("style");
    st.id = "flexannotate-persistent-style";
    st.textContent =
      "#citation-dialog,#citation-dialog[dialog-layout=library]{min-width:0 !important;}";
    doc.documentElement!.appendChild(st);
  }
}

/** Flushes pending saving when the feature stops (only written read-only). */
export function flushStoredRect(): void {
  flushRect();
  if (writeTimer) mainWin()?.clearTimeout(writeTimer as number);
  writeTimer = null;
}
