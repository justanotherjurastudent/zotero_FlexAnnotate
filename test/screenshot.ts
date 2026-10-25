/**
 * Test helper: renders a window (or a single element within it) to PNG.
 * Runs only in the test bundle; uses Zotero/Gecko globals, not ztoolkit.
 */

const HTML_NS = "http://www.w3.org/1999/xhtml";

export interface ScreenshotOptions {
  /** CSS selector; without this, the entire window is rendered. */
  selector?: string;
  /** Only without `selector`: width and height instead of window dimensions. */
  width?: number;
  height?: number;
  /** Only with `selector`: only the rightmost N CSS px of the element. */
  clipRight?: number;
  /** Scale factor for sharper images (default 1). */
  scale?: number;
  /**
   * drawWindow flags (Gecko constants, undocumented in Zotero sources):
   * 4 = DRAWWINDOW_USE_WIDGET_LAYERS, ensuring popups/panels are rendered.
   */
  flags?: number;
}

/**
 * Destination directory: `FLEXANNOTATE_SCREENSHOT_DIR` (set by test runner, see
 * scripts/run-zotero-tests.mjs), otherwise `.scaffold/test/shots` next to the profile.
 */
export function screenshotDir(): string {
  const fromEnv = Services.env.get("FLEXANNOTATE_SCREENSHOT_DIR");
  if (fromEnv) return fromEnv;
  return PathUtils.join(PathUtils.parent(PathUtils.profileDir)!, "shots");
}

/** Writes `<dir>/<fileName>.png` and returns the file path. */
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
    if (opts.clipRight) {
      x = r.right - opts.clipRight;
      w = opts.clipRight;
    }
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
  // fileName may contain "/" for a subfolder (PathUtils.join rejects it as one segment)
  const parts = `${fileName}.png`.split("/");
  const path = PathUtils.join(dir, ...parts);
  await IOUtils.makeDirectory(PathUtils.parent(path)!, {
    createAncestors: true,
    ignoreExisting: true,
  });
  await IOUtils.write(path, new Uint8Array(await blob.arrayBuffer()));
  return path;
}
