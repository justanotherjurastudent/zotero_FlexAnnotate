/**
 * docExport — export the organizer outline as a Word (.docx) or LibreOffice
 * (.odt) document: save dialog, ZIP writing, toasts. The XML parts are pure
 * and live in core/docExport.ts; heading styles plus a multilevel numbering
 * come from there. Nothing in the library is touched.
 */

import {
  buildDocxParts,
  buildOdtParts,
  ODT_MIMETYPE,
} from "../../core/docExport";
import { flatten, type OutlineNode } from "../../core/outline";
import { toast } from "./organizerDom";
import { Ctx } from "./organizerState";
import { tr } from "./strings";

export type DocFormat = "docx" | "odt";

export interface ExportPick {
  path: string;
  format: DocFormat;
}

export type ExportResult =
  | { status: "exported"; path: string; count: number }
  | { status: "cancelled" | "empty" }
  | { status: "error"; message: string };

/** ZIP mit den Einträgen {Name: Text} schreiben; mimetype unkomprimiert zuerst. */
export function writeZip(path: string, entries: Record<string, string>): void {
  const zw = (Components.classes as any)[
    "@mozilla.org/zipwriter;1"
  ].createInstance(Components.interfaces.nsIZipWriter);
  zw.open(Zotero.File.pathToFile(path), 0x04 | 0x08 | 0x20); // rw, create, truncate
  try {
    for (const [name, text] of Object.entries(entries)) {
      const stream = (Components.classes as any)[
        "@mozilla.org/io/string-input-stream;1"
      ].createInstance(Components.interfaces.nsIStringInputStream);
      stream.setUTF8Data(text);
      const stored = name === "mimetype";
      zw.addEntryStream(
        name,
        Date.now() * 1000,
        stored
          ? Components.interfaces.nsIZipWriter.COMPRESSION_NONE
          : Components.interfaces.nsIZipWriter.COMPRESSION_DEFAULT,
        stream,
        false,
      );
    }
  } finally {
    zw.close();
  }
}

export const docExport = {
  /** Message box; replaceable so tests can capture the text. */
  alert: (win: unknown, text: string) =>
    (Services as any).prompt.alert(win, tr("exportDocTitle"), text),

  /** Open exported document with system default handler (Word / LibreOffice). */
  openDocument: (path: string) => {
    try {
      (Zotero as any).launchFile(path);
    } catch (e) {
      ztoolkit.log("flexannotate docExport: launchFile failed:", e);
    }
  },

  writeDocx: (path: string, roots: OutlineNode[]) => {
    const p = buildDocxParts(roots);
    writeZip(path, {
      "[Content_Types].xml": p.contentTypesXml,
      "_rels/.rels": p.rootRelsXml,
      "word/_rels/document.xml.rels": p.docRelsXml,
      "word/document.xml": p.documentXml,
      "word/styles.xml": p.stylesXml,
      "word/numbering.xml": p.numberingXml,
    });
  },

  writeOdt: (path: string, roots: OutlineNode[]) => {
    const p = buildOdtParts(roots);
    writeZip(path, {
      mimetype: p.mimetype,
      "content.xml": p.contentXml,
      "styles.xml": p.stylesXml,
      "META-INF/manifest.xml": p.manifestXml,
    });
  },

  /**
   * Zotero's FilePicker wrapper (chrome/content/zotero/modules/filePicker.mjs,
   * 7.0.32 to 10.0.5), save mode. The native picker asks before overwriting
   * (returnReplace). Returns null when the user cancels.
   */
  async pickSaveFile(win: Window): Promise<ExportPick | null> {
    const { FilePicker } = ChromeUtils.importESModule(
      "chrome://zotero/content/modules/filePicker.mjs",
    ) as any;
    const fp = new FilePicker();
    fp.init(win, tr("exportDocTitle"), fp.modeSave);
    fp.defaultString = tr("exportDefaultName");
    fp.appendFilter(tr("exportFilterDocx"), "*.docx");
    fp.appendFilter(tr("exportFilterOdt"), "*.odt");
    const rv = await fp.show();
    if (rv !== fp.returnOK && rv !== fp.returnReplace) return null;
    const format: DocFormat = fp.filterIndex === 1 ? "odt" : "docx";
    let path: string = fp.file;
    if (!/\.(docx|odt)$/i.test(path))
      path += format === "odt" ? ".odt" : ".docx";
    return { path, format };
  },

  /** Toolbar action: pick a target, then write the outline. */
  async start(ctx: Ctx): Promise<ExportResult | null> {
    const win = ctx.doc.defaultView as Window;
    let pick: ExportPick | null;
    try {
      pick = await docExport.pickSaveFile(win);
    } catch (e) {
      ztoolkit.log("flexannotate docExport: file picker failed:", e);
      docExport.alert(
        win,
        tr("exportFailed").replace("{file}", "").replace("{err}", String(e)),
      );
      return null;
    }
    if (!pick) {
      try {
        win?.focus?.();
      } catch {
        // window may not be available
      }
      return null;
    }
    return docExport.exportTo(ctx.s.roots, pick, win);
  },

  async exportTo(
    roots: OutlineNode[],
    pick: ExportPick,
    win: unknown = null,
  ): Promise<ExportResult> {
    if (!roots.length) {
      docExport.alert(win, tr("exportNone"));
      return { status: "empty" };
    }
    try {
      if (pick.format === "odt") docExport.writeOdt(pick.path, roots);
      else docExport.writeDocx(pick.path, roots);
      const count = flatten(roots).filter((f) => f.node.title.trim()).length;
      toast(tr("exportDocDone").replace("{n}", String(count)), {
        actionLabel: tr("exportOpenDoc"),
        onAction: () => docExport.openDocument(pick.path),
        window: (win as Window) ?? undefined,
        doc: (win as any)?.document ?? undefined,
      });
      try {
        (win as Window)?.focus?.();
      } catch {
        // window may not be available
      }
      return { status: "exported", path: pick.path, count };
    } catch (e) {
      ztoolkit.log("flexannotate docExport failed:", e);
      const message = tr("exportFailed")
        .replace("{file}", pick.path)
        .replace("{err}", String(e));
      docExport.alert(win, message);
      return { status: "error", message };
    }
  },
};
