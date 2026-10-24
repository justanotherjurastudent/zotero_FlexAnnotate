/**
 * Darstellung der Gliederungsansicht im Zitierdialog: Baum (links), Liste mit
 * Filter (Mitte) und Vorschau (rechts). Die Aktionen aus der Liste (Markieren,
 * Einfügen) liegen hier, weil sie die Ansicht neu zeichnen.
 */

import {
  formatCitationLocationList,
  record,
  toggleDocCited,
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
import { tr } from "../strings";
import {
  currentSessionId,
  getActiveCitedIDs,
  getAllCitationLocations,
  getAllWorkCitationLocations,
  getCitationLocations,
  jumpToCitation,
  readCitedStore,
  readDocCitedData,
  syncSessionFromDocument,
  writeCitedStore,
  writeDocCitedData,
  type CitationLocation,
} from "./dialogCited";

export const TREE_ID = "flexannotate-tree";
export const LIST_ID = "flexannotate-list-pane";
export const PREVIEW_ID = "flexannotate-preview";
export const NATIVE_ID = "flexannotate-native";
const GREEN = "#1f9d55";
const SELECTED = "rgba(60,120,220,0.16)";
const LINE = "var(--fill-quinary, rgba(128,128,128,0.25))";
const MUTED = "var(--fill-secondary, #777)";
/** Aktionsbuttons der Vorschau: eine Zeile, bei Platzmangel umbrechen. */
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
  // neue Daten oder neuer Knoten: die Liste beginnt oben
  renderList(win, v, false);
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

/** keepScroll: Auswahl und Häkchen bauen die Liste neu auf, die Scrollposition soll bleiben. */
export function renderList(win: Window, v: View, keepScroll = true) {
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
  // Höhe 24 + Rand 2×5 = 34 px, genau wie die Sammlungs-Zeile links
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
  const locMap = getAllCitationLocations();
  const workLocMap = getAllWorkCitationLocations();
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
      if (r) list.appendChild(rowEl(win, v, r, order, locMap, workLocMap));
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
  renderList(win, v, true);
  renderPreview(win, v);
}

function getLocationOptions(): FormatLocationOptions {
  return {
    textLabel: tr("dialogLocationText"),
    footnotePattern: tr("dialogLocationFootnote"),
    endnotePattern: tr("dialogLocationEndnote"),
  };
}

function attachFootnotePopover(
  win: Window,
  v: View,
  check: HTMLElement,
  locs: CitationLocation[],
): void {
  const doc = win.document;
  let closeTimer: any = null;

  const removeActivePopover = () => {
    const existing = doc.getElementById("flexannotate-footnote-popover");
    if (existing) existing.remove();
  };

  const scheduleClose = () => {
    if (closeTimer) win.clearTimeout(closeTimer);
    closeTimer = win.setTimeout(() => {
      removeActivePopover();
      closeTimer = null;
    }, 200);
  };

  const cancelClose = () => {
    if (closeTimer) {
      win.clearTimeout(closeTimer);
      closeTimer = null;
    }
  };

  const show = () => {
    cancelClose();
    removeActivePopover();

    const rect = check.getBoundingClientRect();
    const popover = doc.createElement("div");
    popover.id = "flexannotate-footnote-popover";
    popover.style.cssText =
      "position:fixed;z-index:99999;background:var(--material-background,#ffffff);" +
      "color:var(--material-color,#222222);border:1px solid rgba(128,128,128,0.28);" +
      "border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,0.22);padding:6px 8px;" +
      "display:flex;flex-direction:column;gap:5px;font-size:11px;min-width:90px;max-width:260px;" +
      "box-sizing:border-box;pointer-events:auto;";

    const header = doc.createElement("div");
    header.style.cssText =
      `color:${MUTED};font-size:10px;font-weight:600;text-transform:uppercase;` +
      "letter-spacing:0.4px;user-select:none;";
    header.textContent =
      locs.length > 1
        ? `${tr("dialogCitedIn")} (${locs.length})`
        : tr("dialogCitedIn");
    popover.appendChild(header);

    const chips = doc.createElement("div");
    chips.style.cssText =
      "display:flex;gap:4px;flex-wrap:wrap;max-height:180px;overflow-y:auto;padding-right:2px;" +
      "scrollbar-width:thin;scrollbar-color:rgba(128,128,128,0.4) transparent;";

    const items = formatCitationLocationList(locs, getLocationOptions());
    for (const { loc: l, label } of items) {
      const chip = doc.createElement("button");
      chip.className = "flexannotate-loc-chip";
      chip.style.cssText =
        `background:rgba(31,157,85,0.12);color:${GREEN};border:1px solid rgba(31,157,85,0.4);` +
        "border-radius:4px;padding:2px 6px;font-size:11px;font-weight:600;cursor:pointer;" +
        "display:inline-flex;align-items:center;line-height:1.2;outline:none;";
      chip.textContent = label;
      const hint = l.plainCitation ? `${label}: ${l.plainCitation}` : label;
      chip.title = `${hint} (${tr("dialogJumpToFootnote")})`;
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        removeActivePopover();
        void jumpToCitation(l.citation || l).then((ok) => {
          if (!ok) void refreshCitedInView(win, v);
        });
      });
      chips.appendChild(chip);
    }
    popover.appendChild(chips);

    popover.addEventListener("mouseenter", cancelClose);
    popover.addEventListener("mouseleave", scheduleClose);

    (doc.body || doc.documentElement)?.appendChild(popover);

    const popWidth = popover.offsetWidth || 140;
    const popHeight = popover.offsetHeight || 100;
    const winWidth = win.innerWidth || 400;
    const winHeight = win.innerHeight || 500;
    const left = Math.max(8, Math.min(rect.left, winWidth - popWidth - 10));
    const fitsBelow = rect.bottom + popHeight + 8 <= winHeight;
    const top =
      fitsBelow || rect.top - popHeight - 4 < 0
        ? rect.bottom + 4
        : rect.top - popHeight - 4;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  };

  check.addEventListener("mouseenter", show);
  check.addEventListener("mouseleave", scheduleClose);
}

function rowEl(
  win: Window,
  v: View,
  r: Row,
  order: number[],
  locMap?: Map<string, CitationLocation[]>,
  workLocMap?: Map<number, CitationLocation[]>,
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
  const cited = v.cited.has(r.id);
  const locs = cited
    ? r.kind === "work"
      ? workLocMap?.get(r.id)
      : r.key
        ? locMap?.get(r.key)
        : undefined
    : undefined;
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
  const canMark = !cited && r.kind !== "work";
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
  if (locs && locs.length) {
    attachFootnotePopover(win, v, check, locs);
  }
  // Die Markierung wird dynamisch ermittelt und lässt sich nicht entfernen;
  // ein Klick auf eine leere Zelle markiert die Zeile (nur Annotationen, keine Werke) von Hand.
  check.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!canMark) return;
    const ids = v.sel.selected.has(r.id) ? [...v.sel.selected] : [r.id];
    setCited(win, v, ids);
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
    if (v.cited.has(r.id)) {
      host.appendChild(
        el(
          doc,
          "div",
          `color:${GREEN};font-weight:600;`,
          "✓ " + tr("dialogCited"),
        ),
      );
      const locs = r.key ? getCitationLocations(r.key) : [];
      if (locs.length) {
        const locContainer = el(
          doc,
          "div",
          "display:flex;align-items:center;flex-wrap:wrap;gap:6px;font-size:12px;margin-top:2px;margin-bottom:2px;" +
            "max-height:100px;overflow-y:auto;padding-right:2px;scrollbar-width:thin;" +
            "scrollbar-color:rgba(128,128,128,0.4) transparent;",
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
          const chip = doc.createElement("button");
          chip.type = "button";
          chip.className = "flexannotate-citation-chip";
          chip.textContent = label;
          const hint = loc.plainCitation
            ? `${label}: ${loc.plainCitation}`
            : label;
          chip.title = `${hint} (${tr("dialogJumpToFootnote")})`;
          chip.style.cssText =
            "cursor:pointer;padding:2px 8px;font-size:11px;line-height:normal;" +
            "font-family:inherit;margin:0;border-radius:10px;" +
            "border:1px solid var(--fill-quinary, rgba(128,128,128,0.3));" +
            "background:rgba(31,157,85,0.1);color:" +
            GREEN +
            ";font-weight:600;";
          chip.addEventListener("click", (e) => {
            e.stopPropagation();
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
  const bar = el(doc, "div", "display:flex;flex-wrap:wrap;gap:6px;");
  host.appendChild(bar);
  const btn = doc.createElement("button");
  btn.id = "flexannotate-insert";
  btn.textContent = tr("dialogInsert");
  btn.style.cssText = BUTTON_CSS;
  btn.addEventListener("click", () => void insert(win, [...v.sel.selected]));
  bar.appendChild(btn);

  // one annotation only: jump to its place in the reader (the dialog stays open)
  if (picked.length === 1) {
    const show = doc.createElement("button");
    show.id = "flexannotate-show-place";
    show.textContent = tr("dialogShowPlace");
    show.style.cssText = BUTTON_CSS;
    show.addEventListener("click", () => void openRow(picked[0]));
    bar.appendChild(show);
  }

  // manual marking of the green check (only for annotations, works are strictly dynamic)
  const canMarkManually = picked.some(
    (r) => !v.cited.has(r.id) && r.kind !== "work",
  );
  if (canMarkManually) {
    const mark = doc.createElement("button");
    mark.id = "flexannotate-toggle-cited";
    mark.textContent = tr("dialogMark");
    mark.style.cssText = BUTTON_CSS;
    mark.addEventListener("click", () => setCited(win, v, [...v.sel.selected]));
    bar.appendChild(mark);
  }
}

/** Set the green check of annotations for this document. */
function setCited(win: Window, v: View, ids: number[]) {
  const sessionID = currentSessionId();
  const store = readCitedStore();
  const entries = ids.flatMap((id) => {
    const r = v.rows.get(id);
    return r ? [{ id, workID: r.workID }] : [];
  });
  const next = record(store, sessionID, entries);
  try {
    writeCitedStore(next);
  } catch (e) {
    ztoolkit.log("flexannotate cited store write failed:", e);
  }

  // Update document-level persistent store
  try {
    const keys = ids
      .map((id) => v.rows.get(id)?.key)
      .filter((k): k is string => !!k);
    if (keys.length) {
      const docData = readDocCitedData() || { citations: {} };
      const updated = toggleDocCited(docData, keys, true);
      writeDocCitedData(updated);
    }
  } catch (e) {
    ztoolkit.log("flexannotate doc cited write failed:", e);
  }

  for (const id of ids) v.cited.add(id);
  renderList(win, v);
  renderPreview(win, v);
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
