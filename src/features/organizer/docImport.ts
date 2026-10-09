/**
 * docImport — import an outline from a Word (.docx) or LibreOffice (.odt)
 * document: file picker, ZIP reading, preview dialog, applying the plan.
 *
 * The parsing and merge rules are pure and live in core/docOutline.ts; this
 * file is the Zotero-facing layer. Nothing is deleted or moved: the headings
 * are appended to the current outline (append-merge). A heading is only a
 * node of the outline note; tags appear when items are filed (same as the
 * "add heading" button), so no item or annotation is touched here.
 */

import {
  applyImportPlan,
  type DocHeading,
  type ImportPlan,
  normalizeHeadings,
  parseDocxHeadings,
  parseOdtHeadings,
  planOutlineImport,
} from "../../core/docOutline";
import { button, el, toast } from "./organizerDom";
import { Ctx, persist } from "./organizerState";
import { tr } from "./strings";
import { getTheme } from "./theme";

/** Upper limit for one unpacked XML entry. */
export const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const PREVIEW_LINES = 15;

export type ImportCtx = Pick<Ctx, "s" | "render"> & { doc?: Document };

export interface Computed {
  plan: ImportPlan;
  numberingDetected: boolean;
}
/** Everything the preview needs; `compute` re-plans for the checkbox. */
export interface PreviewView {
  fileName: string;
  strip: boolean;
  compute: (strip: boolean) => Computed;
}
export type PreviewAnswer = boolean | { ok: boolean; strip: boolean };

export interface ImportOptions {
  /** Replaces the preview dialog (tests). `true` accepts with `stripNumbering`. */
  confirm?: (v: PreviewView) => PreviewAnswer | Promise<PreviewAnswer>;
  /** Remove manual numbering when detected (default true). */
  stripNumbering?: boolean;
}

export type ImportResult =
  | { status: "imported"; plan: ImportPlan }
  | { status: "cancelled" | "empty" }
  | { status: "error"; message: string };

class ImportError extends Error {}

/** Read the heading list of a .docx/.odt file. Always closes the reader. */
async function readHeadings(file: any): Promise<DocHeading[]> {
  const zr = (Components.classes as any)[
    "@mozilla.org/libjar/zip-reader;1"
  ].createInstance(Components.interfaces.nsIZipReader);
  const name = file.leafName as string;
  const bad = () =>
    new ImportError(tr("importBadFile").replace("{file}", name));
  try {
    try {
      zr.open(file);
    } catch (e) {
      ztoolkit.log("flexannotate docImport: not a zip:", e);
      throw bad();
    }
    const text = async (entry: string) => {
      if (zr.getEntry(entry).realSize > MAX_ENTRY_BYTES)
        throw new ImportError(
          tr("importTooBig")
            .replace("{file}", name)
            .replace("{entry}", entry)
            .replace("{mb}", String(MAX_ENTRY_BYTES / 1024 / 1024)),
        );
      const stream = zr.getInputStream(entry);
      try {
        const xml = (await Zotero.File.getContentsAsync(
          stream,
          "UTF-8",
        )) as string;
        return xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
      } finally {
        stream.close();
      }
    };
    try {
      if (zr.hasEntry("word/document.xml"))
        return parseDocxHeadings(
          await text("word/document.xml"),
          zr.hasEntry("word/styles.xml") ? await text("word/styles.xml") : "",
        );
      if (zr.hasEntry("content.xml"))
        return parseOdtHeadings(await text("content.xml"));
    } catch (e) {
      if (e instanceof ImportError) throw e;
      ztoolkit.log("flexannotate docImport: read failed:", e);
      throw bad();
    }
    throw bad();
  } finally {
    try {
      zr.close();
    } catch {
      // never opened
    }
  }
}

/** Preview dialog as an overlay in the organizer window. */
function showPreview(
  ctx: ImportCtx,
  v: PreviewView,
): Promise<{ ok: boolean; strip: boolean }> {
  const doc = ctx.doc!;
  const t = getTheme(doc);
  let strip = v.strip;
  return new Promise((resolve) => {
    const overlay = el(
      doc,
      "div",
      "position:fixed;inset:0;z-index:1000;display:flex;align-items:center;" +
        "justify-content:center;background:rgba(0,0,0,0.45);",
    );
    overlay.dataset.importPreview = "1";
    const box = el(
      doc,
      "div",
      `background:${t.bg};color:${t.text};border:1px solid ${t.border};` +
        "border-radius:8px;padding:16px;width:480px;max-width:90vw;" +
        "max-height:80vh;display:flex;flex-direction:column;gap:8px;",
    );
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-labelledby", "flexannotate-import-title");
    const title = el(
      doc,
      "div",
      "font-size:15px;font-weight:600;",
      tr("importDialogTitle"),
    );
    title.id = "flexannotate-import-title";
    const file = el(doc, "div", `color:${t.sub};`, v.fileName);
    const count = el(doc, "div", "font-weight:600;");
    const summary = el(doc, "div");
    const list = el(
      doc,
      "div",
      `overflow-y:auto;border:1px solid ${t.border};border-radius:4px;` +
        "padding:6px;max-height:300px;",
    );
    const check = el(doc, "input");
    check.type = "checkbox";
    check.checked = strip;
    const label = el(doc, "label", "display:flex;gap:6px;align-items:center;");
    label.append(check, doc.createTextNode(tr("importStrip")));
    const actions = el(
      doc,
      "div",
      "display:flex;justify-content:flex-end;gap:8px;margin-top:6px;",
    );

    const draw = () => {
      const { plan, numberingDetected } = v.compute(strip);
      count.textContent = tr("importCount").replace(
        "{n}",
        String(plan.ops.length),
      );
      summary.textContent = tr("importSummary")
        .replace("{c}", String(plan.created))
        .replace("{r}", String(plan.reused))
        .replace("{n}", String(plan.renamed));
      label.style.display = numberingDetected ? "flex" : "none";
      list.textContent = "";
      for (const op of plan.ops.slice(0, PREVIEW_LINES)) {
        list.appendChild(
          el(
            doc,
            "div",
            `padding-left:${(op.level - 1) * 16}px;white-space:nowrap;` +
              "overflow:hidden;text-overflow:ellipsis;" +
              (op.kind === "reuse" ? `color:${t.sub};` : ""),
            op.kind === "reuse"
              ? `${op.title} (${tr("importExists")})`
              : op.title,
          ),
        );
      }
      if (plan.ops.length > PREVIEW_LINES)
        list.appendChild(
          el(
            doc,
            "div",
            `color:${t.sub};`,
            tr("importMore").replace(
              "{n}",
              String(plan.ops.length - PREVIEW_LINES),
            ),
          ),
        );
    };
    check.addEventListener("change", () => {
      strip = check.checked;
      draw();
    });

    const finish = (ok: boolean) => {
      overlay.remove();
      resolve({ ok, strip });
    };
    const okButton = button(doc, t, tr("importDo"), "", () => finish(true));
    actions.append(
      button(doc, t, tr("cancel"), "", () => finish(false)),
      okButton,
    );
    overlay.addEventListener("keydown", (e: KeyboardEvent) => {
      e.stopPropagation(); // keep the organizer's shortcuts out
      if (e.key === "Escape") finish(false);
    });
    draw();
    box.append(title, file, count, summary, list, label, actions);
    overlay.appendChild(box);
    (ctx as Ctx).root.appendChild(overlay);
    okButton.focus();
  });
}

export const docImport = {
  /** Message box; replaceable so tests can capture the text. */
  alert: (win: unknown, text: string) =>
    (Services as any).prompt.alert(win, tr("importDialogTitle"), text),

  /**
   * Zotero's FilePicker wrapper (chrome/content/zotero/modules/filePicker.mjs,
   * same path in 7.0.32 to 10.0.5; it adapts init() to the platform).
   * Returns null when the user cancels.
   */
  async pickFile(win: Window): Promise<any | null> {
    const { FilePicker } = ChromeUtils.importESModule(
      "chrome://zotero/content/modules/filePicker.mjs",
    ) as any;
    const fp = new FilePicker();
    fp.init(win, tr("importPickTitle"), fp.modeOpen);
    fp.appendFilter(tr("importFilter"), "*.docx; *.odt");
    fp.appendFilters(fp.filterAll);
    const rv = await fp.show();
    return rv === fp.returnOK ? Zotero.File.pathToFile(fp.file) : null;
  },

  /** Toolbar action: pick a file, then import it. */
  async start(ctx: Ctx): Promise<ImportResult | null> {
    const win = ctx.doc.defaultView as Window;
    let file: any;
    try {
      file = await docImport.pickFile(win);
    } catch (e) {
      ztoolkit.log("flexannotate docImport: file picker failed:", e);
      docImport.alert(win, tr("importFailed").replace("{err}", String(e)));
      return null;
    }
    return file ? docImport.importFromFile(ctx, file, {}) : null;
  },

  async importFromFile(
    ctx: ImportCtx,
    file: any,
    opts: ImportOptions = {},
  ): Promise<ImportResult> {
    const { s } = ctx;
    const win = ctx.doc?.defaultView ?? null;
    const fail = (message: string): ImportResult => {
      docImport.alert(win, message);
      return { status: "error", message };
    };
    try {
      let headings: DocHeading[];
      try {
        headings = await readHeadings(file);
      } catch (e) {
        return fail(
          e instanceof ImportError
            ? e.message
            : tr("importFailed").replace("{err}", String(e)),
        );
      }
      if (!headings.length) {
        docImport.alert(win, tr("importNone"));
        return { status: "empty" };
      }
      const compute = (strip: boolean): Computed => {
        const n = normalizeHeadings(headings, { stripNumbering: strip });
        return {
          plan: planOutlineImport(s.roots, n.items),
          numberingDetected: n.numberingDetected,
        };
      };
      const view: PreviewView = {
        fileName: file.leafName,
        strip: opts.stripNumbering ?? true,
        compute,
      };
      const raw = await (opts.confirm
        ? opts.confirm(view)
        : showPreview(ctx, view));
      const answer =
        typeof raw === "boolean" ? { ok: raw, strip: view.strip } : raw;
      if (!answer.ok) return { status: "cancelled" };

      const { plan } = compute(answer.strip);
      if (plan.created) {
        s.roots = applyImportPlan(s.roots, plan);
        await persist(s);
        ctx.render();
      }
      toast(
        tr("importDone")
          .replace("{n}", String(plan.ops.length))
          .replace("{m}", String(plan.created)),
      );
      return { status: "imported", plan };
    } catch (e) {
      ztoolkit.log("flexannotate docImport failed:", e);
      return fail(tr("importFailed").replace("{err}", String(e)));
    }
  },
};
