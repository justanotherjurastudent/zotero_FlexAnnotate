/**
 * Test-Hilfe: rendert ein Fenster (oder nur ein Element darin) als PNG.
 * Läuft nur im Test-Bundle; nutzt die Zotero/Gecko-Globals, nicht ztoolkit.
 */

const HTML_NS = "http://www.w3.org/1999/xhtml";

export interface ScreenshotOptions {
  /** CSS-Selektor; ohne Angabe wird das ganze Fenster gerendert. */
  selector?: string;
  /** Nur ohne `selector`: Breite und Höhe statt der Fenstergröße. */
  width?: number;
  height?: number;
  /** Skalierung für schärfere Bilder (Standard 1). */
  scale?: number;
  /**
   * drawWindow-Flags (Gecko-Konstanten, in den Zotero-Quellen nicht belegt):
   * 4 = DRAWWINDOW_USE_WIDGET_LAYERS, damit auch Popups/Panels mitgezeichnet werden.
   */
  flags?: number;
}

/**
 * Zielordner: `FLEXANNOTATE_SCREENSHOT_DIR` (vom Testläufer gesetzt, siehe
 * scripts/run-zotero-tests.mjs), sonst `.scaffold/test/shots` neben dem Profil.
 */
export function screenshotDir(): string {
  const fromEnv = Services.env.get("FLEXANNOTATE_SCREENSHOT_DIR");
  if (fromEnv) return fromEnv;
  return PathUtils.join(PathUtils.parent(PathUtils.profileDir)!, "shots");
}

/** Schreibt `<dir>/<fileName>.png` und gibt den Pfad zurück. */
export async function screenshot(
  win: Window,
  fileName: string,
  opts: ScreenshotOptions = {},
): Promise<string> {
  const doc = win.document;
  const scale = opts.scale ?? 1;
  let x = 0;
  let y = 0;
  let w = opts.width ?? win.innerWidth;
  let h = opts.height ?? win.innerHeight;
  if (opts.selector) {
    const el = doc.querySelector(opts.selector);
    if (!el) throw new Error(`screenshot: no element for ${opts.selector}`);
    const r = el.getBoundingClientRect();
    x = r.left;
    y = r.top;
    w = Math.ceil(r.width);
    h = Math.ceil(r.height);
  }
  if (!(w > 0 && h > 0)) {
    throw new Error(`screenshot: empty area for ${fileName} (${w}x${h})`);
  }

  const canvas = doc.createElementNS(HTML_NS, "canvas") as HTMLCanvasElement;
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d") as any;
  // drawWindow is chrome-only (not available to web content)
  if (typeof ctx?.drawWindow !== "function") {
    throw new Error("screenshot: CanvasRenderingContext2D.drawWindow missing");
  }
  ctx.scale(scale, scale);
  ctx.drawWindow(win, x, y, w, h, "rgb(255,255,255)", opts.flags ?? 0);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("screenshot: toBlob failed"))),
      "image/png",
    ),
  );
  const dir = screenshotDir();
  await IOUtils.makeDirectory(dir, {
    createAncestors: true,
    ignoreExisting: true,
  });
  const path = PathUtils.join(dir, `${fileName}.png`);
  await IOUtils.write(path, new Uint8Array(await blob.arrayBuffer()));
  return path;
}
