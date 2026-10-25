/**
 * Remembered browse window across restarts (pure, without Zotero globals).
 *
 * Stored are the inner size (w, h) and the outer position (x, y) in CSS pixels, like
 * the rest of the persistent window (dialogPersistent.ts, rectOf).
 */

/** Smallest size adopted when opening (otherwise standard window). */
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 300;

/** The usable area of the screen (CSS pixels, like screen.avail*). */
export interface ScreenArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Position optional: if it is missing or on no screen, the OS places the window. */
export interface StoredRect {
  x?: number;
  y?: number;
  w: number;
  h: number;
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Does the window overlap the screen area? */
export function overlaps(
  r: { x: number; y: number; w: number; h: number },
  a: ScreenArea,
): boolean {
  return (
    r.x < a.left + a.width &&
    r.x + r.w > a.left &&
    r.y < a.top + a.height &&
    r.y + r.h > a.top
  );
}

/**
 * Reads the stored value. Invalid (no JSON, missing or nonsensical numbers, too small)
 * yields null: then the normal standard window opens.
 *
 * A stored size that exceeds the usable screen area (e.g. after a
 * switch from a larger monitor) is clamped to the usable area instead of discarded:
 * the window then opens at most as large as the screen and can be shrunk afterwards.
 */
export function parseStoredRect(
  raw: string,
  area: ScreenArea | null,
): StoredRect | null {
  let v: any;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const { x, y, w, h } = v;
  if (!isNum(w) || !isNum(h)) return null;
  if (w < MIN_WIDTH || h < MIN_HEIGHT) return null;
  let cw = w;
  let ch = h;
  if (area) {
    // Adapt the size to the usable area (monitor switch to a smaller screen)
    cw = Math.min(w, area.width);
    ch = Math.min(h, area.height);
    // Screen smaller than the minimum size: does not fit, standard window
    if (cw < MIN_WIDTH || ch < MIN_HEIGHT) return null;
  }
  const hasPos = isNum(x) && isNum(y);
  if (hasPos && (!area || overlaps({ x, y, w: cw, h: ch }, area))) {
    return { x, y, w: cw, h: ch };
  }
  return { w: cw, h: ch };
}

/** The value for the pref (position and size in CSS pixels). */
export function serializeRect(r: {
  x: number;
  y: number;
  w: number;
  h: number;
}): string {
  return JSON.stringify({
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.w),
    h: Math.round(r.h),
  });
}
