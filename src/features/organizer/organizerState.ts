/**
 * Shared state of the organizer window: the State record, the context that
 * the panels receive, and the helpers that derive the visible rows from it.
 */

import {
  itemsUnder,
  locate,
  OutlineNode,
  unassignedItems,
} from "../../core/outline";
import { emptySelection, SelectionState } from "../../core/selection";
import { formatLocator } from "../../core/locator";
import { OutlineModel } from "./outlineModel";
import {
  loadAnnotationRows,
  loadScopeWorkIDs,
  loadWorkRows,
  locatorLabel,
  readShowWorks,
  Row,
  Scope,
} from "./organizerData";

export type Tab = "wissen" | "titel";
export type NodeSel = "all" | "none" | string;
export type Col = "tree" | "list";

export interface State {
  libraryID: number;
  noteID: number | null;
  roots: OutlineNode[];
  tab: Tab;
  /** Every row of the tab, and the rows inside the collection scope. */
  allRows: Row[];
  rows: Row[];
  scope: Scope;
  scopeWorks: Set<number> | null;
  sel: SelectionState;
  node: NodeSel;
  query: string;
  goto: string;
  sections: boolean;
  /** Plugin setting: show the works behind the annotations. */
  showWorks: boolean;
  renaming: string | null;
  /** Pending outline saves, in order. */
  saveChain: Promise<void>;
  /** Ends the open inline rename (set while a heading is being renamed). */
  endRename: (() => void) | null;
  editing: number | null;
  focusCol: Col;
  lastTreeClick: { id: string; t: number } | null;
  /** Re-focus the search box after a re-render. */
  focusSearch: boolean;
}

/** What a panel gets: the window, its state, and the two actions it needs. */
export interface Ctx {
  doc: Document;
  root: HTMLElement;
  s: State;
  /** Re-draw the whole window from the current state. */
  render: () => void;
  /** Yes/no question to the user (the factory's replaceable confirm). */
  confirm: (win: unknown, title: string, text: string) => boolean;
}

/** "S. 22" style citation place of a row, with its place type. */
export function placeOf(r: Row): string {
  return formatLocator(locatorLabel(r.locator), r.pageLabel);
}

export function applyScope(s: State) {
  s.scopeWorks = loadScopeWorkIDs(s.libraryID, s.scope);
  s.rows = s.allRows.filter((r) => !s.scopeWorks || s.scopeWorks.has(r.workID));
}

/**
 * Save the outline. Saves run one after the other and each one reads the
 * tree when it actually runs, so two quick changes (e.g. a rename followed
 * by a move) can never overwrite each other with an older state.
 */
export function persist(s: State): Promise<void> {
  s.saveChain = s.saveChain
    .then(async () => {
      s.noteID = await OutlineModel.save(s.libraryID, s.noteID, s.roots);
    })
    .catch((e) => ztoolkit.log("flexannotate outline save failed:", e));
  return s.saveChain;
}

/** Rows of the current node, after the keyword filter. */
export function visibleRows(s: State): Row[] {
  let rows = s.rows;
  if (s.node === "none") rows = unassignedItems(s.roots, rows);
  else if (s.node !== "all") {
    const n = locate(s.roots, s.node)?.node;
    rows = n ? itemsUnder(n, rows, true) : [];
  }
  const q = s.query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    `${r.text}\n${r.comment}\n${r.workTitle}\n${r.byline}`
      .toLowerCase()
      .includes(q),
  );
}

export function orderIds(s: State): number[] {
  return [...new Set(visibleRows(s).map((r) => r.id))];
}

/** Reload the rows of the current tab from Zotero and redraw. */
export async function reload(ctx: Ctx) {
  const { s } = ctx;
  s.allRows =
    s.tab === "wissen"
      ? await loadAnnotationRows(s.libraryID)
      : await loadWorkRows(s.libraryID);
  applyScope(s);
  s.sel = emptySelection();
  s.editing = null;
  s.showWorks = readShowWorks();
  ctx.render();
}
