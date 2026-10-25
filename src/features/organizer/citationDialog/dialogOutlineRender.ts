/**
 * Rendering of the outline view in the citation dialog: tree (left), list with
 * filter (middle) and preview (right). The list actions (mark, insert) live here
 * because they redraw the view.
 */

import {
  formatCitationLocationList,
  getLocationsForRow,
  type FormatLocationOptions,
} from "../logic/cited";
import type { AnnLike } from "../logic/dialogView";
import { formatLocator } from "../../../core/locator";
import { applyClick, emptySelection } from "../logic/selection";
import type { SelectionState } from "../logic/selection";
import { flatten, numbering } from "../logic/outline";
import type { OutlineNode, Section } from "../logic/outline";
import { citationOfRow, locatorLabel } from "../panel/organizerData";
import type { Row } from "../panel/organizerData";
import { openRow } from "../openTarget";
import { isFeatureEnabled } from "../../gates";
import { tr } from "../strings";
import {
  getActiveCitedIDs,
  getAllCitationLocations,
  getAllWorkCitationLocations,
  jumpToCitation,
  syncSessionFromDocument,
  type CitationLocation,
} from "./dialogCited";
import { GREEN, setCited } from "./citedToggle";
import { attachFootnotePopover, makeCitationChip } from "./footnoteChips";

export const TREE_ID = "flexannotate-tree";
export const LIST_ID = "flexannotate-list-pane";
export const PREVIEW_ID = "flexannotate-preview";
export const NATIVE_ID = "flexannotate-native";
const SELECTED = "rgba(60,120,220,0.16)";
const LINE = "var(--fill-quinary, rgba(128,128,128,0.25))";
const MUTED = "var(--fill-secondary, #777)";
/** Preview action buttons: single row, wrap when space is constrained. */
const BUTTON_CSS = "flex:1 1 auto;padding:4px 8px;white-space:nowrap;";

export interface View {
  roots: OutlineNode[];
  sections: Section<AnnLike>[];
  counts: Map<string, number>;
  rows: Map<number, Row>;
  showCommentsInRows: boolean;
  cited: Set<number>;
  node: string; // "all", "none", or a heading id
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
  const jumpOn = isFeatureEnabled("footnoteJump");
  const locMap = jumpOn ? getAllCitationLocations() : undefined;
  const workLocMap = jumpOn ? getAllWorkCitationLocations() : undefined;
  renderList(win, v, false, locMap, workLocMap);
  renderPreview(win, v, locMap, workLocMap);
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
        `padding:4px 10px 4px ${10 + depth * 14}px;font-size:12px;` +
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
  const noneCount = v.sections
    .filter((s) => s.node === null)
    .reduce((n, s) => n + new Set(s.items.map((i) => i.id)).size, 0);
  host.appendChild(line("all", 0, tr("all"), total));
  host.appendChild(line("none", 0, tr("none"), noneCount));
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
  if (v.node === "none") {
    // only the unassigned "no category" bucket
    secs = secs.filter((s) => s.node === null);
  } else if (v.node !== "all") {
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
          `${r.text}\n${r.comment}\n${r.workTitle}\n${r.byline}`
            .toLowerCase()
            .includes(q)
        );
      }),
    }))
    .filter((s) => s.items.length);
}

/** keepScroll: selection and checkmarks rebuild the list, the scroll position should remain. */
export function renderList(
  win: Window,
  v: View,
  keepScroll = true,
  locMap?: Map<string, CitationLocation[]>,
  workLocMap?: Map<number, CitationLocation[]>,
) {
  const doc = win.document;
  const host = doc.getElementById(LIST_ID);
  if (!host) return;
  const scroll = keepScroll
    ? ((host.children[1] as HTMLElement | undefined)?.scrollTop ?? 0)
    : 0;
  host.textContent = "";

  const filter = doc.createElement("input");
  filter.type = "text";
  filter.placeholder = tr("dialogFilter");
  filter.value = v.query;
  // Height 24 + margin 2×5 = 34 px, exactly like the collection row on the left
  filter.style.cssText =
    "margin:5px 6px;flex:none;box-sizing:border-box;height:24px;padding:0 8px;font-size:12px;";
  filter.addEventListener("input", () => {
    v.query = filter.value;
    renderList(win, v, false);
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
  const citedOn = isFeatureEnabled("citedTracking");
  const jumpOn = isFeatureEnabled("footnoteJump");
  const resolvedLocMap = jumpOn
    ? (locMap ?? getAllCitationLocations())
    : undefined;
  const resolvedWorkLocMap = jumpOn
    ? (workLocMap ?? getAllWorkCitationLocations())
    : undefined;
  list.addEventListener(
    "scroll",
    () => {
      const existing = doc.getElementById("flexannotate-footnote-popover");
      if (existing) existing.remove();
    },
    { passive: true },
  );
  for (const sec of secs) {
    list.appendChild(
      el(
        doc,
        "div",
        `padding:6px 10px;font-weight:600;font-size:12px;border-bottom:1px solid ${LINE};` +
          "background:rgba(128,128,128,0.08);",
        sec.node ? `${sec.number}  ${sec.node.title}` : tr("none"),
      ),
    );
    for (const a of sec.items) {
      const r = v.rows.get(a.id);
      if (r)
        list.appendChild(
          rowEl(
            win,
            v,
            r,
            order,
            resolvedLocMap,
            resolvedWorkLocMap,
            citedOn,
            jumpOn,
          ),
        );
    }
  }
  list.scrollTop = scroll;
}

export async function refreshCitedInView(win: Window, v: View): Promise<void> {
  const changed = await syncSessionFromDocument();
  if (!changed || win.closed) return;
  const doc = win.document;
  const existing = doc.getElementById("flexannotate-footnote-popover");
  if (existing) existing.remove();
  const isCitation =
    (doc.documentElement?.getAttribute("dialog-type") ||
      (win as any).DIALOG_STATE?.type) === "citation";
  const session = (Zotero as any).Integration?.currentSession;
  const map = session?.citationsByItemID ?? null;
  const citedWorks = map
    ? new Set<number>(Object.keys(map).map((k) => Number(k)))
    : null;
  v.cited = isCitation
    ? (citedWorks ?? new Set<number>())
    : getActiveCitedIDs([...v.rows.values()], citedWorks);
  const locMap = getAllCitationLocations();
  const workLocMap = getAllWorkCitationLocations();
  renderList(win, v, true, locMap, workLocMap);
  renderPreview(win, v, locMap, workLocMap);
}

function getLocationOptions(): FormatLocationOptions {
  return {
    textLabel: tr("dialogLocationText"),
    footnotePattern: tr("dialogLocationFootnote"),
    endnotePattern: tr("dialogLocationEndnote"),
  };
}

function rowEl(
  win: Window,
  v: View,
  r: Row,
  order: number[],
  locMap?: Map<string, CitationLocation[]>,
  workLocMap?: Map<number, CitationLocation[]>,
  citedOn = isFeatureEnabled("citedTracking"),
  jumpOn = isFeatureEnabled("footnoteJump"),
): HTMLElement {
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
  const cited = citedOn && v.cited.has(r.id);
  const locs =
    cited && jumpOn ? getLocationsForRow(r, locMap, workLocMap) : undefined;
  let checkTitle = cited ? tr("dialogCited") : tr("dialogCheckHint");
  if (locs && locs.length) {
    const items = formatCitationLocationList(locs, getLocationOptions());
    const uniqueLabels = [...new Set(items.map((x) => x.label))];
    const maxVisible = 6;
    const summary =
      uniqueLabels.length > maxVisible
        ? `${uniqueLabels.slice(0, maxVisible).join(", ")}, … (+${uniqueLabels.length - maxVisible})`
        : uniqueLabels.join(", ");
    checkTitle = `${tr("dialogCited")} (${summary})`;
  }
  const canMark = citedOn && r.kind !== "work";
  const check = el(
    doc,
    "span",
    `flex:none;width:16px;text-align:center;cursor:${canMark ? "pointer" : "default"};color:${GREEN};font-weight:700;`,
    cited ? "✓" : "",
  );
  check.className = cited
    ? "flexannotate-check flexannotate-cited"
    : "flexannotate-check";
  check.title = checkTitle;
  check.hidden = !citedOn;
  if (locs && locs.length) {
    attachFootnotePopover(
      win,
      check,
      locs,
      () => void refreshCitedInView(win, v),
    );
  }
  check.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!canMark) return;
    const ids = v.sel.selected.has(r.id) ? [...v.sel.selected] : [r.id];
    setCited(win, v, ids, !cited, () => {
      const lm = jumpOn ? getAllCitationLocations() : undefined;
      const wlm = jumpOn ? getAllWorkCitationLocations() : undefined;
      renderList(win, v, true, lm, wlm);
      renderPreview(win, v, lm, wlm);
    });
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
    (
      (v.showCommentsInRows && r.comment ? r.comment : r.text) ||
      r.comment ||
      r.workTitle
    ).replace(/\s+/g, " "),
  );
  text.title = v.showCommentsInRows && r.comment ? r.comment : r.text;
  const placeText =
    r.kind === "work"
      ? r.byline
      : formatLocator(locatorLabel(r.locator), r.pageLabel);
  const place = el(
    doc,
    "span",
    `flex:none;font-size:11px;color:${MUTED};`,
    placeText,
  );
  const plus = el(
    doc,
    "span",
    `flex:none;width:20px;height:20px;line-height:18px;text-align:center;` +
      `border:1px solid ${LINE};border-radius:50%;cursor:pointer;font-weight:700;`,
    "+",
  );
  plus.className = "flexannotate-plus";
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
    renderList(win, v, true, locMap, workLocMap);
    renderPreview(win, v, locMap, workLocMap);
  });
  d.addEventListener("dblclick", () => void insert(win, [r.id]));
  return d;
}

export function renderPreview(
  win: Window,
  v: View,
  locMap?: Map<string, CitationLocation[]>,
  workLocMap?: Map<number, CitationLocation[]>,
) {
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
    if (isFeatureEnabled("citedTracking") && v.cited.has(r.id)) {
      host.appendChild(
        el(
          doc,
          "div",
          `color:${GREEN};font-weight:600;`,
          "✓ " + tr("dialogCited"),
        ),
      );
      const locs = isFeatureEnabled("footnoteJump")
        ? (getLocationsForRow(
            r,
            locMap ?? getAllCitationLocations(),
            workLocMap ?? getAllWorkCitationLocations(),
          ) ?? [])
        : [];
      if (locs.length) {
        const locContainer = el(
          doc,
          "div",
          "display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:12px;margin-top:2px;margin-bottom:2px;flex:none;",
        );
        locContainer.appendChild(
          el(
            doc,
            "span",
            `color:${MUTED};font-weight:500;`,
            tr("dialogCitedIn"),
          ),
        );
        const items = formatCitationLocationList(locs, getLocationOptions());
        for (const { loc, label } of items) {
          const hint = loc.plainCitation
            ? `${label}: ${loc.plainCitation}`
            : label;
          const chip = makeCitationChip(doc, label, hint, () => {
            void jumpToCitation(loc.citation || loc).then((ok) => {
              if (!ok) void refreshCitedInView(win, v);
            });
          });
          locContainer.appendChild(chip);
        }
        host.appendChild(locContainer);
      }
    }
  }
  const bar = el(
    doc,
    "div",
    "display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:8px;",
  );
  host.appendChild(bar);
  const btn = doc.createElement("button");
  btn.id = "flexannotate-insert";
  btn.textContent = tr("dialogInsert");
  btn.style.cssText = BUTTON_CSS;
  btn.addEventListener("click", () => void insert(win, [...v.sel.selected]));
  bar.appendChild(btn);

  // one annotation only: jump to its place in the reader (the dialog stays open)
  if (isFeatureEnabled("dialogShowPlace") && picked.length === 1) {
    const show = doc.createElement("button");
    show.id = "flexannotate-show-place";
    show.textContent = tr("dialogShowPlace");
    show.style.cssText = BUTTON_CSS;
    show.addEventListener("click", () => void openRow(picked[0]));
    bar.appendChild(show);
  }

  // manual marking/unmarking of the green check (only for annotations, works are strictly dynamic)
  const canToggle =
    isFeatureEnabled("citedTracking") &&
    picked.length > 0 &&
    picked.every((r) => r.kind !== "work");
  if (canToggle) {
    const allCited = picked.every((r) => v.cited.has(r.id));
    const mark = doc.createElement("button");
    mark.id = "flexannotate-toggle-cited";
    mark.textContent = allCited ? tr("dialogUncite") : tr("dialogMark");
    mark.style.cssText = BUTTON_CSS;
    mark.addEventListener("click", () =>
      setCited(win, v, [...v.sel.selected], !allCited, () => {
        const jumpOn = isFeatureEnabled("footnoteJump");
        const lm = jumpOn ? getAllCitationLocations() : undefined;
        const wlm = jumpOn ? getAllWorkCitationLocations() : undefined;
        renderList(win, v, true, lm, wlm);
        renderPreview(win, v, lm, wlm);
      }),
    );
    bar.appendChild(mark);
  }
}

// ── inserting via Zotero's own handler ───────────────────────────────────────

export async function insert(win: Window, ids: number[]) {
  const doc = win.document;
  const isCitation =
    (doc.documentElement?.getAttribute("dialog-type") ||
      (win as any).DIALOG_STATE?.type) === "citation";
  if (isCitation) {
    const works = ids
      .map((id) => Zotero.Items.get(id) as Zotero.Item | false)
      .filter(
        (item): item is Zotero.Item =>
          !!item && (item as any).isRegularItem?.(),
      );
    if (!works.length) return;
    const add = (win as any).IOManager?.addItemsToCitation;
    if (typeof add !== "function") {
      ztoolkit.log("flexannotate dialog: IOManager.addItemsToCitation missing");
      return;
    }
    await add.call((win as any).IOManager, works);
    return;
  }

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
