/**
 * `§`-Tag-Vorschläge in Gliederungsreihenfolge (Reader-Tag-Popup, Item-Fenster).
 *
 * Zoteros Tag-Feld holt seine Vorschläge bei der XPCOM-Suche `zotero`
 * (`ZoteroAutoComplete.prototype.startSearch`) und sortiert sie dort fest per
 * SQL (`ORDER BY val COLLATE locale`, LIMIT 50) — verifiziert gegen Zotero
 * 10.0.5 (zotero-autocomplete.mjs:76-93); die Suche ist in 7.0.32 dieselbe
 * (zotero-autocomplete.js). Es gibt keinen Hook, deshalb wird `startSearch` auf
 * der registrierten Instanz überschrieben: nur für Tag-Suchen, die mit `§`
 * beginnen; alles andere läuft unverändert durch das Original.
 *
 * Die Reihenfolge selbst steckt in logic/tagSuggest.ts.
 */

import type { Feature } from "../../shared/feature";
import { assignChecked } from "../../shared/patch";
import { getString } from "../../utils/locale";
import { getPref } from "../../utils/prefs";
import { topmostCollection } from "./logic/collections";
import { flatHeadings, type FlatHeading } from "./logic/flatHeadings";
import { HEADING_PREFIX } from "./logic/outline";
import { normalizeTagSuggestMode, suggestRows } from "./logic/tagSuggest";
import { OutlineModel } from "./outlineModel";
import { collectionKeyOf, listCollections } from "./panel/organizerData";

const CONTRACT = "@mozilla.org/autocomplete/search;1?name=zotero";

interface SearchService {
  startSearch: (...args: any[]) => unknown;
  _cancelled?: boolean;
}

let installed: {
  svc: SearchService;
  native: SearchService["startSearch"];
  patched: SearchService["startSearch"];
  hadOwn: boolean;
} | null = null;

/** Zähler: eine überholte Suche (neuer Tastendruck) liefert nichts mehr ab. */
let seq = 0;

/** Die von Zotero registrierte Suchinstanz (der Factory-Singleton). */
function service(): SearchService {
  const C = Components as any;
  const inst = C.classes[CONTRACT].createInstance(
    C.interfaces.nsIAutoCompleteSearch,
  );
  return inst.wrappedJSObject ?? inst;
}

/** `§`-Tags der Bibliothek, die passen und dem Item noch nicht anhängen. */
async function candidates(
  libraryID: number,
  itemID: number | null,
  typed: string,
): Promise<string[]> {
  let sql =
    "SELECT DISTINCT name FROM tags WHERE name LIKE ? ESCAPE '\\' " +
    "AND tagID IN (SELECT tagID FROM itemTags JOIN items USING (itemID) " +
    "WHERE itemID NOT IN (SELECT itemID FROM deletedItems) AND libraryID = ?)";
  const params: (string | number)[] = [
    Zotero.DB.escapeSQLExpression(typed) + "%",
    libraryID,
  ];
  if (itemID) {
    sql +=
      " AND name NOT IN (SELECT name FROM tags WHERE tagID IN " +
      "(SELECT tagID FROM itemTags WHERE itemID = ?))";
    params.push(itemID);
  }
  return ((await Zotero.DB.columnQueryAsync(sql, params)) as string[]) ?? [];
}

/**
 * Überschriften der Gliederung(en) der Hauptsammlung(en) des Items (Annotation
 * → Elternwerk), in Baumreihenfolge. Leer, wenn keine Hauptsammlung eine
 * eigene Gliederung hat.
 */
async function treeHeadingsOf(
  libraryID: number,
  itemID: number | null,
): Promise<FlatHeading[]> {
  const item = itemID
    ? (Zotero.Items.get(itemID) as Zotero.Item | false)
    : null;
  if (!item) return [];
  const top = ((item.isAnnotation?.() && item.topLevelItem) ||
    item) as Zotero.Item;
  const cols = listCollections(libraryID);
  const keys = new Set<string>();
  for (const id of top.getCollections?.() ?? []) {
    const main = topmostCollection(cols, id);
    const key = main && collectionKeyOf(main.id);
    if (key) keys.add(key);
  }
  if (!keys.size) return [];
  const trees = await OutlineModel.loadCollectionTrees(libraryID);
  return [...keys].flatMap((k) => flatHeadings(trees.get(k) ?? []));
}

/**
 * Beantwortet eine `§`-Tag-Suche in Gliederungsreihenfolge. false = nicht
 * zuständig (anderes Feld, keine `§`-Eingabe, Option aus): dann sucht das Original.
 */
async function answer(
  svc: SearchService,
  token: number,
  searchString: string,
  searchParams: string,
  listener: any,
): Promise<boolean> {
  const mode = normalizeTagSuggestMode(getPref("outlineTagSuggest"));
  if (mode === "off" || !searchString.startsWith(HEADING_PREFIX)) return false;
  const params = JSON.parse(searchParams);
  if (params?.fieldName !== "tag" || typeof params.libraryID !== "number")
    return false;
  const libraryID: number = params.libraryID;
  const itemID: number | null = params.itemID || null;

  const [cand, treeHeads, libraryRoots] = await Promise.all([
    candidates(libraryID, itemID, searchString),
    treeHeadingsOf(libraryID, itemID),
    OutlineModel.loadTreeOnly(libraryID),
  ]);
  // Überholt (neue Eingabe) oder abgebrochen (stopSearch, Popup geschlossen)
  if (token !== seq || svc._cancelled) return true;
  const rows = suggestRows({
    candidates: cand,
    treeHeads,
    libraryHeads: flatHeadings(libraryRoots),
    typed: searchString,
    mode,
    headingTree: getString("tag-suggest-heading-tree"),
    headingLibrary: getString("tag-suggest-heading-library"),
  });

  // Eigenes Ergebnis, ohne den Zustand der nativen Suche (_result usw.) zu berühren
  const C = Components as any;
  const result = C.classes[
    "@mozilla.org/autocomplete/simple-result;1"
  ].createInstance(C.interfaces.nsIAutoCompleteSimpleResult);
  result.setSearchString(searchString);
  for (const r of rows)
    result.appendMatch(r.value, null, null, null, null, r.label);
  const Result = C.interfaces.nsIAutoCompleteResult;
  result.setSearchResult(
    rows.length ? Result.RESULT_SUCCESS : Result.RESULT_NOMATCH,
  );
  listener.onSearchResult(svc, result);
  return true;
}

function patch(): void {
  if (installed) return;
  const svc = service();
  const native = svc.startSearch;
  const patched = async function (
    this: SearchService,
    searchString: string,
    searchParams: string,
    previousResult: unknown,
    listener: any,
  ) {
    // Nach unpatch() läuft die Kette weiter, falls ein anderes Plugin darüber liegt
    if (!installed)
      return native.call(
        this,
        searchString,
        searchParams,
        previousResult,
        listener,
      );
    const token = ++seq;
    this._cancelled = false;
    try {
      if (await answer(this, token, searchString, searchParams, listener))
        return;
    } catch (e) {
      ztoolkit.log("tagSuggest failed, using Zotero's list:", e);
    }
    if (token !== seq) return;
    return native.call(
      this,
      searchString,
      searchParams,
      previousResult,
      listener,
    );
  };
  const hadOwn = Object.prototype.hasOwnProperty.call(svc, "startSearch");
  if (!assignChecked(svc, "startSearch", patched)) {
    ztoolkit.log("Failed to patch ZoteroAutoComplete startSearch");
    return;
  }
  installed = { svc, native, patched, hadOwn };
}

function unpatch(): void {
  if (!installed) return;
  const { svc, native, patched, hadOwn } = installed;
  installed = null;
  // Hat ein anderes Plugin danach selbst gepatcht, dessen Patch stehen lassen
  if (svc.startSearch !== patched) {
    ztoolkit.log("ZoteroAutoComplete startSearch patched by others, kept");
    return;
  }
  if (hadOwn) assignChecked(svc, "startSearch", native);
  else delete (svc as Partial<SearchService>).startSearch;
}

const feature: Feature = { name: "tagSuggest", start: patch, stop: unpatch };

export const tagSuggest = {
  feature,
  service,
  isPatched: () => installed !== null,
};
