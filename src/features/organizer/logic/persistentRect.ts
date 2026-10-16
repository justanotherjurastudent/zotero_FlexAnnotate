/**
 * Gemerktes Blätterfenster über Neustarts (rein, ohne Zotero-Globals).
 *
 * Gespeichert wird die Innengröße (w, h) und die äußere Position (x, y) in CSS-Pixeln, wie
 * der Rest des persistenten Fensters (dialogPersistent.ts, rectOf).
 */

/** Kleinste Größe, die beim Öffnen übernommen wird (sonst Standardfenster). */
export const MIN_WIDTH = 320;
export const MIN_HEIGHT = 300;

/** Die nutzbare Fläche des Bildschirms (CSS-Pixel, wie screen.avail*). */
export interface ScreenArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Position optional: fehlt sie oder liegt sie auf keinem Bildschirm, platziert das Betriebssystem das Fenster. */
export interface StoredRect {
  x?: number;
  y?: number;
  w: number;
  h: number;
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Überlappt das Fenster die Bildschirmfläche? */
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
 * Liest den gespeicherten Wert. Ungültiges (kein JSON, fehlende oder unsinnige Zahlen, zu klein)
 * ergibt null: dann öffnet das normale Standardfenster.
 *
 * Eine gespeicherte Größe, die den nutzbaren Bildschirmbereich überschreitet (z. B. nach einem
 * Wechsel von einem größeren Monitor), wird auf den nutzbaren Bereich geklemmt statt verworfen:
 * das Fenster öffnet dann maximal so groß wie der Bildschirm und lässt sich danach verkleinern.
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
    // Größe an den nutzbaren Bereich anpassen (Monitorwechsel auf kleineren Bildschirm)
    cw = Math.min(w, area.width);
    ch = Math.min(h, area.height);
    // Bildschirm kleiner als die Mindestgröße: passt nicht, Standardfenster
    if (cw < MIN_WIDTH || ch < MIN_HEIGHT) return null;
  }
  const hasPos = isNum(x) && isNum(y);
  if (hasPos && (!area || overlaps({ x, y, w: cw, h: ch }, area))) {
    return { x, y, w: cw, h: ch };
  }
  return { w: cw, h: ch };
}

/** Der Wert für die Pref (Position und Größe in CSS-Pixeln). */
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
