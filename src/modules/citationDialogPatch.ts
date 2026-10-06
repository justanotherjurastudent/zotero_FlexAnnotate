/**
 * citationDialogPatch — "arrange like in the plugin" for the citation dialog
 * that Zotero opens from Word (and LibreOffice / the note editor).
 *
 * Zotero's own views (works / annotations / notes) stay untouched. In the
 * annotations view we add one checkbox; when it is on, the three columns of
 * the dialog show the Annotree outline instead:
 *   left   the headings with their number of annotations
 *   middle the annotations of the chosen heading (green check = already cited)
 *   right  the quote, comment and source of the clicked annotation
 * Inserting goes through Zotero's own "+" handler: for each annotation to add
 * we create a hidden native <annotation-row> inside #annotations-list and click
 * its plus icon, so Zotero's citation logic stays untouched.
 *
 * Anchors (Zotero 10.0.5, see docs/anchors.md):
 *  - citationDialog.xhtml:83-107  columns (#collections-tree-container,
 *    #item-tree-container, #sidebar) and the native annotation list
 *  - citationDialog.js:812-818    "+" click handled by bubbling on #annotations-list
 *  - citationDialog.js:155-185    accept() ends in io.accept(), which we wrap
 *  - integration.js:1564, 2701    session.citationsByItemID and the document's
 *    session id are loaded by Zotero anyway
 */

import { buildDialogSections, nodeCounts } from "../core/dialogView";
import type { AnnLike } from "../core/dialogView";
import { activeIds, parseStore, record } from "../core/cited";
import { formatLocator } from "../core/locator";
import { applyClick, emptySelection } from "../core/selection";
import type { SelectionState } from "../core/selection";
import { flatten, numbering } from "../core/outline";
import type { OutlineNode, Section } from "../core/outline";
import { OutlineModel } from "./outlineModel";
import {
  citationOfRow,
  loadAnnotationRows,
  loadWorkRows,
  locatorLabel,
  readShowWorks,
} from "./organizerData";
import type { Row } from "./organizerData";
import { tr } from "../utils/strings";

const DIALOG_URL = "chrome://zotero/content/integration/citationDialog.xhtml";
const PREF = "dialogOutlineView";
const CITED_PREF = "citedAnnotations";
const STYLE_ID = "annotree-dialog-style";
const ROW_ID = "annotree-toggle-row";
const TREE_ID = "annotree-tree";
const LIST_ID = "annotree-list-pane";
const PREVIEW_ID = "annotree-preview";
const NATIVE_ID = "annotree-native";
/** Native elements hidden while our three columns are shown. */
const NATIVE_HIDE = [
  "zotero-collections-tree",
  "zotero-items-tree",
  "annotations-list-wrapper",
  "annotations-sidebar-filter-wrapper",
  "annotations-message",
];
const GREEN = "#1f9d55";
const SELECTED = "rgba(60,120,220,0.16)";
const LINE = "var(--fill-quinary, rgba(128,128,128,0.25))";
const MUTED = "var(--fill-secondary, #777)";

export interface View {
  roots: OutlineNode[];
  sections: Section<AnnLike>[];
  counts: Map<string, number>;
  rows: Map<number, Row>;
  cited: Set<number>;
  node: string; // "all" or a heading id
  query: string;
  sel: SelectionState;
}

interface Attached {
  observer: MutationObserver | null;
  enabled: boolean;
  view: View | null;
}

function prefKey(name: string): string {
  return `${addon.data.config.prefsPrefix}.${name}`;
}

function readPref(): boolean {
  try {
    return Zotero.Prefs.get(prefKey(PREF), true) === true;
  } catch {
    return false;
  }
}

function writePref(v: boolean) {
  try {
    Zotero.Prefs.set(prefKey(PREF), v, true);
  } catch (e) {
    ztoolkit.log("annotree dialog pref write failed:", e);
  }
}

/** Document id and works cited in it, from data Zotero has already loaded. */
function currentDocument(): { id: string; citedWorks: Set<number> | null } {
  const session = (Zotero as any).Integration?.currentSession;
  const id = String(session?.sessionID ?? "unknown");
  const map = session?.citationsByItemID;
  const citedWorks = map
    ? new Set<number>(Object.keys(map).map((k) => Number(k)))
    : null;
  return { id, citedWorks };
}

function readCitedStore() {
  try {
    return parseStore(Zotero.Prefs.get(prefKey(CITED_PREF), true) as string);
  } catch {
    return {};
  }
}

/** Remember which annotations the accepted citation contains. */
function recordCited(io: any) {
  if (!io?.isAddingAnnotations) return;
  const entries: { id: number; workID: number }[] = [];
  for (const ci of io.citation?.citationItems ?? []) {
    const item = Zotero.Items.get(ci.id) as Zotero.Item | false;
    if (!item || !item.isAnnotation()) continue;
    const attachment = item.parentItem as Zotero.Item | undefined;
    entries.push({ id: item.id, workID: Number(attachment?.parentID) || 0 });
  }
  if (!entries.length) return;
  const next = record(readCitedStore(), currentDocument().id, entries);
  Zotero.Prefs.set(prefKey(CITED_PREF), JSON.stringify(next), true);
}

export class CitationDialogPatch {
  private static listener: any = null;
  private static attached = new Map<Window, Attached>();

  static start() {
    if (this.listener) return;
    this.listener = {
      onOpenWindow: (xulWin: any) => {
        try {
          const win = xulWin.docShell.domWindow as Window;
          this.watch(win);
        } catch (e) {
          ztoolkit.log("annotree dialog watch failed:", e);
        }
      },
      onCloseWindow: () => {},
    };
    Services.wm.addListener(this.listener);
    const en = Services.wm.getEnumerator("");
    while (en.hasMoreElements()) this.watch(en.getNext() as Window);
  }

  static stop() {
    if (this.listener) Services.wm.removeListener(this.listener);
    this.listener = null;
    for (const win of [...this.attached.keys()]) this.detach(win);
  }

  /** The current outline view of a dialog window (for tests and debugging). */
  static viewOf(win: Window): View | null {
    return this.attached.get(win)?.view ?? null;
  }

  private static watch(win: Window) {
    const check = () => {
      if (win.location?.href !== DIALOG_URL || this.attached.has(win)) return;
      this.attached.set(win, { observer: null, enabled: false, view: null });
      win.addEventListener("unload", () => this.attached.delete(win), {
        once: true,
      });
      this.whenLoaded(win);
    };
    if (win.document?.readyState === "complete") check();
    win.addEventListener("load", check);
  }

  /** Wait until the dialog finished its own initialisation, then inject. */
  private static whenLoaded(win: Window, tries = 0) {
    const state = (win as any).DIALOG_STATE;
    if (state?.loaded) {
      this.inject(win);
      return;
    }
    if (tries > 150) return;
    win.setTimeout(() => this.whenLoaded(win, tries + 1), 200);
  }

  // ── injection ──────────────────────────────────────────────────────────────

  private static inject(win: Window) {
    const doc = win.document;
    const sidebar = doc.getElementById("annotations-sidebar");
    const info = this.attached.get(win);
    if (!sidebar || !info || doc.getElementById(ROW_ID)) return;

    // remember cited annotations when the citation is accepted
    const io = (win as any).io;
    if (io && typeof io.accept === "function" && !io.__annotreeHooked) {
      const original = io.accept;
      io.accept = function (...args: unknown[]) {
        try {
          recordCited(io);
        } catch (e) {
          ztoolkit.log("annotree record cited failed:", e);
        }
        return original.apply(this, args);
      };
      io.__annotreeHooked = true;
    }

    const row = doc.createElement("div");
    row.id = ROW_ID;
    row.style.cssText =
      "display:flex;gap:6px;align-items:center;padding:6px 8px;flex:none;";
    const cb = doc.createElement("input");
    cb.type = "checkbox";
    cb.id = "annotree-toggle";
    const label = doc.createElement("label");
    label.htmlFor = "annotree-toggle";
    label.textContent = tr("dialogOutline");
    row.append(cb, label);
    sidebar.insertBefore(row, sidebar.firstChild);

    const root = doc.documentElement as Element;
    const syncVisibility = () => {
      const isAnn = root.getAttribute("dialog-type") === "annotations";
      row.hidden = !isAnn;
      if (!isAnn && info.enabled) void this.disable(win, cb);
    };
    const observer = new win.MutationObserver(syncVisibility);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["dialog-type"],
    });
    info.observer = observer;
    syncVisibility();

    cb.addEventListener("change", () => {
      writePref(cb.checked);
      if (cb.checked) void this.enable(win, cb);
      else void this.disable(win, cb);
    });

    if (readPref() && root.getAttribute("dialog-type") === "annotations") {
      cb.checked = true;
      void this.enable(win, cb);
    }
  }

  private static detach(win: Window) {
    const info = this.attached.get(win);
    try {
      info?.observer?.disconnect();
      const doc = win.document;
      if (info?.enabled) this.restoreLayout(win);
      doc.getElementById(ROW_ID)?.remove();
    } catch (e) {
      ztoolkit.log("annotree dialog detach failed:", e);
    }
    this.attached.delete(win);
  }

  // ── outline view ───────────────────────────────────────────────────────────

  private static async enable(win: Window, cb: HTMLInputElement) {
    const info = this.attached.get(win);
    if (!info) return;
    try {
      const libraryID = Zotero.Libraries.userLibraryID;
      const { roots } = await OutlineModel.load(libraryID);
      const showWorks = readShowWorks();
      const rows = await loadAnnotationRows(libraryID);
      const works = showWorks ? await loadWorkRows(libraryID) : [];
      const sections = buildDialogSections(
        roots,
        rows.map((r) => ({ id: r.id, tags: r.tags, workID: r.workID })),
        new Map(works.map((w) => [w.id, w.tags])),
        showWorks,
      );
      const docInfo = currentDocument();
      const view: View = {
        roots,
        sections,
        counts: nodeCounts(roots, sections),
        rows: new Map(rows.map((r) => [r.id, r])),
        cited: activeIds(readCitedStore(), docInfo.id, docInfo.citedWorks),
        node: "all",
        query: "",
        sel: emptySelection(),
      };
      info.view = view;
      info.enabled = true;
      this.applyLayout(win);
      this.renderAll(win, view);
      cb.checked = true;
    } catch (e) {
      ztoolkit.log("annotree dialog enable failed:", e);
      info.enabled = false;
      this.restoreLayout(win);
    }
  }

  private static async disable(win: Window, cb: HTMLInputElement) {
    const info = this.attached.get(win);
    if (!info) return;
    info.enabled = false;
    info.view = null;
    cb.checked = false;
    this.restoreLayout(win);
  }

  /** Hide Zotero's native columns and add the containers for ours. */
  private static applyLayout(win: Window) {
    const doc = win.document;
    if (!doc.getElementById(STYLE_ID)) {
      const st = doc.createElement("style");
      st.id = STYLE_ID;
      st.textContent = NATIVE_HIDE.map((id) => `#${id}`)
        .concat(["#annotations-list collapsible-section"])
        .join(",")
        .concat("{display:none !important;}");
      doc.documentElement!.appendChild(st);
    }
    const mk = (parentId: string, id: string, css: string) => {
      const parent = doc.getElementById(parentId);
      if (!parent || doc.getElementById(id)) return;
      const d = doc.createElement("div");
      d.id = id;
      d.style.cssText = css;
      parent.appendChild(d);
    };
    mk(
      "collections-tree-container",
      TREE_ID,
      "flex:1;display:flex;flex-direction:column;overflow-y:auto;min-height:0;padding:4px 0;",
    );
    mk(
      "item-tree-container",
      LIST_ID,
      "flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;",
    );
    mk(
      "annotations-sidebar",
      PREVIEW_ID,
      "flex:1;overflow-y:auto;min-height:0;padding:10px 12px;display:flex;flex-direction:column;gap:10px;",
    );
    const sidebar = doc.getElementById("sidebar") as HTMLElement | null;
    if (sidebar)
      sidebar.style.cssText += ";flex:0 0 330px;width:330px;max-width:none;";
  }

  private static restoreLayout(win: Window) {
    const doc = win.document;
    for (const id of [TREE_ID, LIST_ID, PREVIEW_ID, NATIVE_ID, STYLE_ID])
      doc.getElementById(id)?.remove();
    const sidebar = doc.getElementById("sidebar") as HTMLElement | null;
    if (sidebar) {
      sidebar.style.flex = "";
      sidebar.style.width = "";
      sidebar.style.maxWidth = "";
    }
    try {
      const list = doc.getElementById("annotations-list") as any;
      if (list) {
        list.items = [];
        list.render?.();
      }
      // Let Zotero recompute its list from the current item selection.
      (win as any).libraryLayout?.itemsView?.selection?.clearSelection?.();
    } catch (e) {
      ztoolkit.log("annotree dialog restore failed:", e);
    }
  }

  // ── rendering ──────────────────────────────────────────────────────────────

  private static renderAll(win: Window, v: View) {
    this.renderTree(win, v);
    this.renderList(win, v);
    this.renderPreview(win, v);
  }

  private static el(
    doc: Document,
    tag: string,
    css = "",
    text?: string,
  ): HTMLElement {
    const e = doc.createElement(tag);
    if (css) e.style.cssText = css;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  private static renderTree(win: Window, v: View) {
    const doc = win.document;
    const host = doc.getElementById(TREE_ID);
    if (!host) return;
    host.textContent = "";
    const nums = numbering(v.roots);
    const total = new Set(v.sections.flatMap((s) => s.items.map((i) => i.id)))
      .size;
    const line = (
      id: string,
      depth: number,
      label: string,
      count: number,
    ): HTMLElement => {
      const on = v.node === id;
      const d = this.el(
        doc,
        "div",
        `display:flex;justify-content:space-between;gap:8px;cursor:pointer;` +
          `padding:5px 10px 5px ${10 + depth * 14}px;` +
          `background:${on ? SELECTED : "transparent"};font-weight:${on ? 600 : 400};`,
      );
      d.dataset.nodeId = id;
      const l = this.el(
        doc,
        "span",
        "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
        label,
      );
      l.title = label;
      d.append(
        l,
        this.el(
          doc,
          "span",
          `flex:none;font-size:11px;color:${MUTED};`,
          String(count),
        ),
      );
      d.addEventListener("click", () => {
        v.node = id;
        v.sel = emptySelection();
        this.renderAll(win, v);
      });
      return d;
    };
    host.appendChild(line("all", 0, tr("all"), total));
    for (const { node, depth } of flatten(v.roots)) {
      host.appendChild(
        line(
          node.id,
          depth,
          `${nums.get(node.id)}  ${node.title}`,
          v.counts.get(node.id) ?? 0,
        ),
      );
    }
  }

  /** Sections shown in the middle column for the chosen heading and filter. */
  private static visibleSections(v: View): Section<AnnLike>[] {
    let secs = v.sections;
    if (v.node !== "all") {
      const root = flatten(v.roots).find((f) => f.node.id === v.node)?.node;
      const ids = new Set(root ? flatten([root]).map((f) => f.node.id) : []);
      secs = secs.filter((s) => s.node && ids.has(s.node.id));
    }
    const q = v.query.trim().toLowerCase();
    if (!q) return secs;
    return secs
      .map((s) => ({
        ...s,
        items: s.items.filter((a) => {
          const r = v.rows.get(a.id);
          return (
            !!r &&
            `${r.text}\n${r.comment}\n${r.workTitle}`.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((s) => s.items.length);
  }

  private static renderList(win: Window, v: View) {
    const doc = win.document;
    const host = doc.getElementById(LIST_ID);
    if (!host) return;
    host.textContent = "";

    const filter = doc.createElement("input");
    filter.type = "text";
    filter.placeholder = tr("dialogFilter");
    filter.value = v.query;
    filter.style.cssText = "margin:6px;flex:none;padding:5px 8px;";
    filter.addEventListener("input", () => {
      v.query = filter.value;
      this.renderList(win, v);
      const again = doc.querySelector(`#${LIST_ID} input`) as HTMLInputElement;
      again?.focus();
      again?.setSelectionRange(again.value.length, again.value.length);
    });
    host.appendChild(filter);

    const list = this.el(doc, "div", "flex:1;overflow-y:auto;min-height:0;");
    host.appendChild(list);
    const secs = this.visibleSections(v);
    if (!secs.length) {
      list.appendChild(
        this.el(
          doc,
          "div",
          `padding:20px;text-align:center;color:${MUTED};`,
          tr("dialogEmpty"),
        ),
      );
      return;
    }
    const order = [...new Set(secs.flatMap((s) => s.items.map((i) => i.id)))];
    for (const sec of secs) {
      list.appendChild(
        this.el(
          doc,
          "div",
          `padding:6px 10px;font-weight:600;font-size:12px;border-bottom:1px solid ${LINE};` +
            "background:rgba(128,128,128,0.08);",
          `${sec.number}  ${sec.node!.title}`,
        ),
      );
      for (const a of sec.items) {
        const r = v.rows.get(a.id);
        if (r) list.appendChild(this.rowEl(win, v, r, order));
      }
    }
  }

  private static rowEl(
    win: Window,
    v: View,
    r: Row,
    order: number[],
  ): HTMLElement {
    const doc = win.document;
    const on = v.sel.selected.has(r.id);
    const d = this.el(
      doc,
      "div",
      `display:flex;align-items:center;gap:8px;min-height:28px;padding:2px 10px;` +
        `cursor:default;border-bottom:1px solid ${LINE};user-select:none;` +
        `background:${on ? SELECTED : "transparent"};`,
    );
    d.dataset.annId = String(r.id);
    const cited = v.cited.has(r.id);
    const check = this.el(
      doc,
      "span",
      `flex:none;width:14px;color:${GREEN};font-weight:700;`,
      cited ? "✓" : "",
    );
    if (cited) {
      check.title = tr("dialogCited");
      check.className = "annotree-cited";
    }
    const dot = this.el(
      doc,
      "span",
      `flex:none;width:9px;height:9px;border-radius:2px;background:${r.color || LINE};`,
    );
    const text = this.el(
      doc,
      "span",
      "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
      (r.text || r.comment || r.workTitle).replace(/\s+/g, " "),
    );
    text.title = r.text;
    const place = this.el(
      doc,
      "span",
      `flex:none;font-size:11px;color:${MUTED};`,
      formatLocator(locatorLabel(r.locator), r.pageLabel),
    );
    const plus = this.el(
      doc,
      "span",
      `flex:none;width:20px;height:20px;line-height:18px;text-align:center;` +
        `border:1px solid ${LINE};border-radius:50%;cursor:pointer;font-weight:700;`,
      "+",
    );
    plus.className = "annotree-plus";
    plus.title = tr("dialogInsert");
    plus.addEventListener("click", (e) => {
      e.stopPropagation();
      const ids = v.sel.selected.has(r.id) ? [...v.sel.selected] : [r.id];
      void this.insert(win, ids);
    });
    d.append(check, dot, text, place, plus);
    d.addEventListener("click", (e: Event) => {
      const m = e as MouseEvent;
      v.sel = applyClick(v.sel, order, r.id, {
        ctrl: m.ctrlKey || m.metaKey,
        shift: m.shiftKey,
      });
      this.renderList(win, v);
      this.renderPreview(win, v);
    });
    d.addEventListener("dblclick", () => void this.insert(win, [r.id]));
    return d;
  }

  private static renderPreview(win: Window, v: View) {
    const doc = win.document;
    const host = doc.getElementById(PREVIEW_ID);
    if (!host) return;
    host.textContent = "";
    const picked = [...v.sel.selected]
      .map((id) => v.rows.get(id))
      .filter((r): r is Row => !!r);
    if (!picked.length) {
      host.appendChild(
        this.el(doc, "div", `color:${MUTED};`, tr("dialogHint")),
      );
      return;
    }
    if (picked.length > 1) {
      host.appendChild(
        this.el(
          doc,
          "div",
          "font-weight:600;",
          tr("selected").replace("{n}", String(picked.length)),
        ),
      );
    } else {
      const r = picked[0];
      if (r.text)
        host.appendChild(
          this.el(
            doc,
            "blockquote",
            `margin:0;padding:6px 10px;border-left:4px solid ${r.color || LINE};` +
              "white-space:pre-wrap;line-height:1.45;",
            r.text,
          ),
        );
      if (r.comment)
        host.appendChild(
          this.el(
            doc,
            "div",
            `white-space:pre-wrap;font-style:italic;color:${MUTED};`,
            r.comment,
          ),
        );
      const source = [
        citationOfRow(r),
        formatLocator(locatorLabel(r.locator), r.pageLabel),
      ]
        .filter(Boolean)
        .join(", ");
      host.appendChild(
        this.el(
          doc,
          "div",
          `border-top:1px solid ${LINE};padding-top:8px;font-size:12px;`,
          source,
        ),
      );
      if (v.cited.has(r.id))
        host.appendChild(
          this.el(
            doc,
            "div",
            `color:${GREEN};font-weight:600;`,
            "✓ " + tr("dialogCited"),
          ),
        );
    }
    const btn = doc.createElement("button");
    btn.id = "annotree-insert";
    btn.textContent = tr("dialogInsert");
    btn.style.cssText = "align-self:flex-start;padding:5px 12px;";
    btn.addEventListener(
      "click",
      () => void this.insert(win, [...v.sel.selected]),
    );
    host.appendChild(btn);
  }

  // ── inserting via Zotero's own handler ─────────────────────────────────────

  private static async insert(win: Window, ids: number[]) {
    const doc = win.document;
    const list = doc.getElementById("annotations-list") as any;
    if (!list) return;
    let host: Element | null = doc.getElementById(NATIVE_ID);
    if (!host) {
      host = doc.createElement("div");
      host.id = NATIVE_ID;
      (host as HTMLElement).hidden = true;
      list.appendChild(host);
    }
    for (const id of ids) {
      const item = Zotero.Items.get(id) as Zotero.Item | false;
      if (!item) continue;
      const row = (doc as any).createXULElement("annotation-row");
      row.annotation = item;
      row.setAttribute("action", "plus");
      host.appendChild(row);
      let plus: HTMLElement | null = null;
      for (let i = 0; i < 20 && !plus; i++) {
        plus = row.querySelector(".zotero-clicky-plus");
        if (!plus) await new Promise((r) => win.setTimeout(r, 25));
      }
      plus?.click();
      await new Promise((r) => win.setTimeout(r, 30));
      row.remove();
    }
  }
}
