/**
 * Darstellung der Gliederungsansicht im Zitierdialog: Baum (links), Liste mit
 * Filter (Mitte) und Vorschau (rechts). Die Aktionen aus der Liste (Markieren,
 * Einfügen) liegen hier, weil sie die Ansicht neu zeichnen.
 */

import { record, unrecord } from "../../core/cited";
import type { AnnLike } from "../../core/dialogView";
import { formatLocator } from "../../core/locator";
import { applyClick, emptySelection } from "../../core/selection";
import type { SelectionState } from "../../core/selection";
import { flatten, numbering } from "../../core/outline";
import type { OutlineNode, Section } from "../../core/outline";
import { citationOfRow, locatorLabel } from "./organizerData";
import type { Row } from "./organizerData";
import { tr } from "./strings";
import {
  currentSessionId,
  readCitedStore,
  writeCitedStore,
} from "./dialogCited";

export const TREE_ID = "annotree-tree";
export const LIST_ID = "annotree-list-pane";
export const PREVIEW_ID = "annotree-preview";
export const NATIVE_ID = "annotree-native";
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

function el(doc: Document, tag: string, css = "", text?: string): HTMLElement {
  const e = doc.createElement(tag);
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderAll(win: Window, v: View) {
  renderTree(win, v);
  renderList(win, v);
  renderPreview(win, v);
}

function renderTree(win: Window, v: View) {
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
    const d = el(
      doc,
      "div",
      `display:flex;justify-content:space-between;gap:8px;cursor:pointer;` +
        `padding:5px 10px 5px ${10 + depth * 14}px;` +
        `background:${on ? SELECTED : "transparent"};font-weight:${on ? 600 : 400};`,
    );
    d.dataset.nodeId = id;
    const l = el(
      doc,
      "span",
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
      label,
    );
    l.title = label;
    d.append(
      l,
      el(
        doc,
        "span",
        `flex:none;font-size:11px;color:${MUTED};`,
        String(count),
      ),
    );
    d.addEventListener("click", () => {
      v.node = id;
      v.sel = emptySelection();
      renderAll(win, v);
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
export function visibleSections(v: View): Section<AnnLike>[] {
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

export function renderList(win: Window, v: View) {
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
    renderList(win, v);
    const again = doc.querySelector(`#${LIST_ID} input`) as HTMLInputElement;
    again?.focus();
    again?.setSelectionRange(again.value.length, again.value.length);
  });
  host.appendChild(filter);

  const list = el(
    doc,
    "div",
    "flex:1;overflow-y:auto;overflow-x:hidden;min-height:0;",
  );
  host.appendChild(list);
  const secs = visibleSections(v);
  if (!secs.length) {
    list.appendChild(
      el(
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
      el(
        doc,
        "div",
        `padding:6px 10px;font-weight:600;font-size:12px;border-bottom:1px solid ${LINE};` +
          "background:rgba(128,128,128,0.08);",
        `${sec.number}  ${sec.node!.title}`,
      ),
    );
    for (const a of sec.items) {
      const r = v.rows.get(a.id);
      if (r) list.appendChild(rowEl(win, v, r, order));
    }
  }
}

function rowEl(win: Window, v: View, r: Row, order: number[]): HTMLElement {
  const doc = win.document;
  const on = v.sel.selected.has(r.id);
  const d = el(
    doc,
    "div",
    `display:flex;align-items:center;gap:8px;min-height:28px;padding:2px 10px;` +
      `cursor:default;border-bottom:1px solid ${LINE};user-select:none;` +
      `background:${on ? SELECTED : "transparent"};`,
  );
  d.dataset.annId = String(r.id);
  const cited = v.cited.has(r.id);
  const check = el(
    doc,
    "span",
    `flex:none;width:16px;text-align:center;cursor:pointer;color:${GREEN};font-weight:700;`,
    cited ? "✓" : "",
  );
  check.className = cited ? "annotree-check annotree-cited" : "annotree-check";
  check.title = cited ? tr("dialogCited") : tr("dialogCheckHint");
  // manual correction: click toggles the mark of this row (or the selection)
  check.addEventListener("click", (e) => {
    e.stopPropagation();
    const ids = v.sel.selected.has(r.id) ? [...v.sel.selected] : [r.id];
    setCited(win, v, ids, !cited);
  });
  const dot = el(
    doc,
    "span",
    `flex:none;width:9px;height:9px;border-radius:2px;background:${r.color || LINE};`,
  );
  const text = el(
    doc,
    "span",
    "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
    (r.text || r.comment || r.workTitle).replace(/\s+/g, " "),
  );
  text.title = r.text;
  const place = el(
    doc,
    "span",
    `flex:none;font-size:11px;color:${MUTED};`,
    formatLocator(locatorLabel(r.locator), r.pageLabel),
  );
  const plus = el(
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
    void insert(win, ids);
  });
  d.append(check, dot, text, place, plus);
  d.addEventListener("click", (e: Event) => {
    const m = e as MouseEvent;
    v.sel = applyClick(v.sel, order, r.id, {
      ctrl: m.ctrlKey || m.metaKey,
      shift: m.shiftKey,
    });
    renderList(win, v);
    renderPreview(win, v);
  });
  d.addEventListener("dblclick", () => void insert(win, [r.id]));
  return d;
}

export function renderPreview(win: Window, v: View) {
  const doc = win.document;
  const host = doc.getElementById(PREVIEW_ID);
  if (!host) return;
  host.textContent = "";
  const picked = [...v.sel.selected]
    .map((id) => v.rows.get(id))
    .filter((r): r is Row => !!r);
  if (!picked.length) {
    host.appendChild(el(doc, "div", `color:${MUTED};`, tr("dialogHint")));
    return;
  }
  if (picked.length > 1) {
    host.appendChild(
      el(
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
        el(
          doc,
          "blockquote",
          `margin:0;padding:6px 10px;border-left:4px solid ${r.color || LINE};` +
            "white-space:pre-wrap;line-height:1.45;",
          r.text,
        ),
      );
    if (r.comment)
      host.appendChild(
        el(
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
      el(
        doc,
        "div",
        `border-top:1px solid ${LINE};padding-top:8px;font-size:12px;`,
        source,
      ),
    );
    if (v.cited.has(r.id))
      host.appendChild(
        el(
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
  btn.addEventListener("click", () => void insert(win, [...v.sel.selected]));
  host.appendChild(btn);

  // manual correction of the green check
  const allCited = picked.every((r) => v.cited.has(r.id));
  const mark = doc.createElement("button");
  mark.id = "annotree-toggle-cited";
  mark.textContent = allCited ? tr("dialogUncite") : tr("dialogMark");
  mark.style.cssText = "align-self:flex-start;padding:5px 12px;";
  mark.addEventListener("click", () =>
    setCited(win, v, [...v.sel.selected], !allCited),
  );
  host.appendChild(mark);
}

/** Set or remove the green check of annotations for this document. */
function setCited(win: Window, v: View, ids: number[], on: boolean) {
  const sessionID = currentSessionId();
  const store = readCitedStore();
  const entries = ids.flatMap((id) => {
    const r = v.rows.get(id);
    return r ? [{ id, workID: r.workID }] : [];
  });
  const next = on
    ? record(store, sessionID, entries)
    : unrecord(store, sessionID, ids);
  try {
    writeCitedStore(next);
  } catch (e) {
    ztoolkit.log("annotree cited store write failed:", e);
  }
  for (const id of ids) {
    if (on) v.cited.add(id);
    else v.cited.delete(id);
  }
  renderList(win, v);
  renderPreview(win, v);
}

// ── inserting via Zotero's own handler ───────────────────────────────────────

export async function insert(win: Window, ids: number[]) {
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
