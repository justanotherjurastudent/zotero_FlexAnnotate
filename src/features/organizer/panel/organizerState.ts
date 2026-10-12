/**
 * Shared state of the organizer window: the State record, the context that
 * the panels receive, and the helpers that derive the visible rows from it.
 */

import {
  itemsUnder,
  locate,
  orphanHeadingTags,
  OutlineNode,
  tagIndex,
  unassignedItems,
} from "../logic/outline";
import { emptySelection, SelectionState } from "../logic/selection";
import { formatLocator } from "../../../core/locator";
import { OutlineModel } from "../outlineModel";
import {
  collectionKeyOf,
  listCollections,
  loadAnnotationRows,
  loadScopeWorkIDs,
  loadWorkRows,
  locatorLabel,
  readShowCommentsInRows,
  readShowWorks,
  Row,
  Scope,
  treeWorkIDs,
} from "./organizerData";
import { topmostCollection } from "../logic/collections";
import { tr } from "../strings";

export type Tab = "wissen" | "titel";
export type NodeSel = "all" | "none" | string;
export type Col = "tree" | "list";

export interface State {
  libraryID: number;
  noteID: number | null;
  /** Outline tree of the active scope (library or topmost collection). */
  roots: OutlineNode[];
  /**
   * Key of the collection whose outline note holds the tree (null =
   * Bibliotheksbaum). Der Key bleibt über Sync stabil; die id kann sich ändern.
   */
  collectionKey: string | null;
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
  /** Plugin setting: show annotation comments in row text if available. */
  showCommentsInRows: boolean;
  renaming: string | null;
  /** Pending outline saves, in order. */
  saveChain: Promise<void>;
  /** Last save events (newest last), for diagnosing a lagging save. */
  saveLog: string[];
  /** Ends the open inline rename (set while a heading is being renamed). */
  endRename: (() => void) | null;
  editing: number | null;
  focusCol: Col;
  lastTreeClick: { id: string; t: number } | null;
  /** Re-focus the search box after a re-render. */
  focusSearch: boolean;
  /** `§`-Tags im Bereich des Baums ohne passende Überschrift (mit Anzahl). */
  orphans: { tag: string; count: number }[];
  orphanOpen: boolean;
  /**
   * Überschriften-Tags der übrigen Sammlungsbäume (key → Name, Tags); null =
   * noch nicht geladen. Nur für den "auch in Baum"-Hinweis.
   */
  otherTrees: Map<string, { name: string; tags: Set<string> }> | null;
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
 * Wechselt Scope und Kategorienbaum auf die gewählte Sammlung (Untersammlung →
 * Baum der Hauptsammlung, via topmostCollection). null = Bibliotheksbaum.
 * Läuft in der saveChain: offene Speicherungen landen noch im alten Baum, und
 * zwei schnelle Wechsel legen keine doppelte Notiz an (der letzte gewinnt).
 *
 * `opts.confirm` wird beim ersten Öffnen einer Sammlung ohne eigenen Baum
 * gefragt: Bibliotheksbaum als Anfang übernehmen? Ohne `confirm` startet der
 * Baum leer.
 */
export function loadScope(
  ctx: Ctx,
  collectionID: number | null,
  opts: { confirm?: (title: string, text: string) => boolean } = {},
): Promise<void> {
  const { s } = ctx;
  const run = s.saveChain.then(async () => {
    s.scope = { ...s.scope, collectionID };
    const top =
      collectionID === null
        ? null
        : topmostCollection(listCollections(s.libraryID), collectionID);
    const collectionKey = top ? collectionKeyOf(top.id) : null;

    const loaded = await OutlineModel.load(s.libraryID, collectionKey);
    let roots = loaded.roots;
    s.noteID = loaded.noteID;
    // Erstöffnung: keine eigene Notiz → einmal fragen, ob der Bibliotheksbaum
    // als Anfang kopiert wird. Die Notiz sofort anlegen, damit die Frage nur
    // einmal kommt.
    if (collectionKey !== null && loaded.noteID === null) {
      if (opts.confirm) {
        const lib = await OutlineModel.load(s.libraryID, null);
        const yes = opts.confirm(
          tr("collectFirstTitle"),
          tr("collectFirstText"),
        );
        if (yes) roots = clone(lib.roots);
        s.noteID = await OutlineModel.save(
          s.libraryID,
          null,
          roots,
          collectionKey,
        );
      }
    }

    s.collectionKey = collectionKey;
    s.roots = roots;
    s.node = "all";
    applyScope(s);
    s.sel = emptySelection();
    s.renaming = null;
    s.editing = null;
    s.endRename = null;
    s.otherTrees = null;
    ctx.render();
    void refreshOrphans(ctx);
  });
  s.saveChain = run.catch((e) =>
    ztoolkit.log("flexannotate loadScope failed:", e),
  );
  return s.saveChain;
}

/** Tiefe Kopie der Baumstruktur (separate Notiz, dieselben Knoten-Ids ok). */
function clone(roots: OutlineNode[]): OutlineNode[] {
  return JSON.parse(JSON.stringify(roots)) as OutlineNode[];
}

/**
 * Save the outline. Saves run one after the other and each one reads the
 * tree when it actually runs, so two quick changes (e.g. a rename followed
 * by a move) can never overwrite each other with an older state.
 */
export function persist(s: State): Promise<void> {
  const log = (what: string) => {
    s.saveLog.push(`${Date.now() % 100000} ${what}`);
    if (s.saveLog.length > 30) s.saveLog.shift();
  };
  const n = ++saveSeq;
  log(`#${n} queued roots=${s.roots.map((r) => r.title)}`);
  s.saveChain = s.saveChain
    .then(async () => {
      log(`#${n} start roots=${s.roots.map((r) => r.title)}`);
      s.noteID = await OutlineModel.save(
        s.libraryID,
        s.noteID,
        s.roots,
        s.collectionKey,
      );
      log(`#${n} done`);
    })
    .catch((e) => {
      log(`#${n} FAILED ${e}`);
      ztoolkit.log("flexannotate outline save failed:", e);
    });
  return s.saveChain;
}
let saveSeq = 0;

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
  s.showCommentsInRows = readShowCommentsInRows();
  ctx.render();
  void refreshOrphans(ctx);
}

/**
 * Verwaiste `§`-Tags des aktiven Baums und die Tags der anderen Bäume neu
 * bestimmen (eigene Suche, darum nicht bei jedem Render) und bei Änderung
 * neu zeichnen.
 */
export async function refreshOrphans(ctx: Ctx) {
  const { s } = ctx;
  try {
    const key = s.collectionKey;
    const counts = await OutlineModel.buildCountMap(
      s.libraryID,
      treeWorkIDs(s.libraryID, key),
    );
    if (s.collectionKey !== key) return; // Baum wurde inzwischen gewechselt
    const orphans = orphanHeadingTags(counts.keys(), s.roots).map((tag) => ({
      tag,
      count: counts.get(tag) ?? 0,
    }));
    let changed = JSON.stringify(orphans) !== JSON.stringify(s.orphans);
    s.orphans = orphans;
    if (!orphans.length && s.orphanOpen) {
      s.orphanOpen = false;
      changed = true;
    }
    if (!s.otherTrees) {
      s.otherTrees = new Map();
      for (const [k, roots] of await OutlineModel.loadCollectionTrees(
        s.libraryID,
      )) {
        const col = Zotero.Collections.getByLibraryAndKey(s.libraryID, k);
        if (col)
          s.otherTrees.set(k, {
            name: col.name,
            tags: new Set(tagIndex(roots).keys()),
          });
      }
      changed = true;
    }
    if (changed && !ctx.doc.defaultView?.closed) ctx.render();
  } catch (e) {
    ztoolkit.log("flexannotate refreshOrphans failed:", e);
  }
}
