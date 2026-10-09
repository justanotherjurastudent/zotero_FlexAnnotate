/**
 * organizerData — rows for the organizer window and bulk filing.
 *
 * Two kinds of rows, like Citavi's two tabs: "work" rows (Titel) are regular
 * Zotero items, "annotation" rows (Wissen) come from the annotation index.
 * Filing a row under a heading = adding the heading's tag to the item.
 */

import { AnnotationIndex } from "./annotationIndex";
import { citationFor } from "./annotationExport";
import { collectionOptions, scopeCollectionIDs } from "../../core/collections";
import type { ColNode } from "../../core/collections";
import {
  FALLBACK_LOCATORS,
  locatorOf,
  locatorTagChanges,
} from "../../core/locator";

export type RowKind = "work" | "annotation";

export interface Row {
  id: number;
  kind: RowKind;
  /** Work title (for annotations: the title of the work they belong to). */
  workTitle: string;
  workID: number;
  /** Quote (annotation) or the work's title (work). */
  text: string;
  comment: string;
  pageLabel: string;
  color: string;
  type: string;
  tags: string[];
  /** Short "Author Year" for display. */
  byline: string;
  key: string;
  attachmentID: number;
  attachmentKey: string;
  libraryID: number;
  /** Annotation of another user in a group library: cannot be tagged. */
  readOnly: boolean;
  /** Citation place type (page, section, …). */
  locator: string;
}

function bylineOf(item: Zotero.Item): string {
  const author = (item as any).firstCreator || "";
  const date = (item.getField("date", true, true) as string) || "";
  const year = date.slice(0, 4);
  return [author, year !== "0000" ? year : ""].filter(Boolean).join(" ");
}

/** Annotations as rows (the "Wissen" tab). */
export async function loadAnnotationRows(libraryID: number): Promise<Row[]> {
  await AnnotationIndex.ensureBuilt(libraryID);
  const out: Row[] = [];
  // FlexAnnotate keeps a per-document default locator as a tag on the attachment
  const attachmentTags = new Map<number, string[]>();
  const tagsOfAttachment = (id: number): string[] => {
    if (!attachmentTags.has(id)) {
      const att = Zotero.Items.get(id) as Zotero.Item | false;
      attachmentTags.set(id, att ? att.getTags().map((t) => t.tag) : []);
    }
    return attachmentTags.get(id)!;
  };
  for (const rec of AnnotationIndex.all()) {
    if (rec.libraryID !== libraryID) continue;
    const paper = Zotero.Items.get(rec.parentItemID) as Zotero.Item | false;
    const item = Zotero.Items.get(rec.id) as Zotero.Item | false;
    out.push({
      id: rec.id,
      kind: "annotation",
      workTitle: rec.parentTitle,
      workID: rec.parentItemID,
      text: rec.text,
      comment: rec.comment,
      pageLabel: rec.pageLabel,
      color: rec.color,
      type: rec.type,
      tags: rec.tags,
      byline: paper ? bylineOf(paper) : "",
      key: rec.key,
      attachmentID: rec.attachmentID,
      attachmentKey: rec.attachmentKey,
      libraryID,
      locator: locatorOf(rec.tags, tagsOfAttachment(rec.attachmentID)),
      // Zotero 10 item.js:1587-1590 — others' group annotations are read-only
      readOnly: item ? !(item as any).isEditable?.() : false,
    });
  }
  return out;
}

/** Works (regular items) as rows (the "Titel" tab). */
export async function loadWorkRows(libraryID: number): Promise<Row[]> {
  const items = (await (Zotero.Items as any).getAll(
    libraryID,
    true,
    false,
  )) as Zotero.Item[];
  const out: Row[] = [];
  for (const item of items) {
    if (!item.isRegularItem()) continue;
    out.push({
      id: item.id,
      kind: "work",
      workTitle: item.getDisplayTitle(),
      workID: item.id,
      text: item.getDisplayTitle(),
      comment: "",
      pageLabel: "",
      color: "",
      type: item.itemType,
      tags: item.getTags().map((t) => t.tag),
      byline: bylineOf(item),
      key: item.key,
      attachmentID: 0,
      attachmentKey: "",
      libraryID,
      locator: "page",
      readOnly: !(item as any).isEditable?.(),
    });
  }
  out.sort((a, b) => a.workTitle.localeCompare(b.workTitle));
  return out;
}

/**
 * Add `tag` to many items in one transaction. Returns the ids actually
 * changed; read-only items and items that already carry the tag are skipped.
 */
export async function fileMany(ids: number[], tag: string): Promise<number[]> {
  const changed: number[] = [];
  await Zotero.DB.executeTransaction(async () => {
    for (const id of ids) {
      const item = Zotero.Items.get(id) as Zotero.Item | false;
      if (!item || !(item as any).isEditable?.()) continue;
      if (item.getTags().some((t) => t.tag === tag)) continue;
      item.addTag(tag);
      await item.save();
      changed.push(id);
    }
  });
  return changed;
}

/** Remove `tag` from many items in one transaction. */
export async function unfileMany(
  ids: number[],
  tag: string,
): Promise<number[]> {
  const changed: number[] = [];
  await Zotero.DB.executeTransaction(async () => {
    for (const id of ids) {
      const item = Zotero.Items.get(id) as Zotero.Item | false;
      if (!item || !(item as any).isEditable?.()) continue;
      if (!item.getTags().some((t) => t.tag === tag)) continue;
      item.removeTag(tag);
      await item.save();
      changed.push(id);
    }
  });
  return changed;
}

/** Formatted citation of the work behind a row (honours the Quick Copy style). */
export function citationOfRow(row: Row): string {
  const work = Zotero.Items.get(row.workID) as Zotero.Item | false;
  return work ? citationFor(work) : row.workTitle;
}

/** Plugin setting: show the works behind the annotations. */
export function readShowWorks(): boolean {
  try {
    return (
      Zotero.Prefs.get(
        `${addon.data.config.prefsPrefix}.showWorksInAnnotationView`,
        true,
      ) === true
    );
  } catch {
    return false;
  }
}

// ── collection scope ────────────────────────────────────────────────────────

export interface Scope {
  /** null = the whole library. */
  collectionID: number | null;
  includeSub: boolean;
}

/** Library and collection currently selected in Zotero's main window. */
export function defaultScope(): { libraryID: number; scope: Scope } {
  const pane = (Zotero.getMainWindow() as any)?.ZoteroPane;
  let libraryID = Zotero.Libraries.userLibraryID;
  let collectionID: number | null = null;
  try {
    libraryID = pane?.getSelectedLibraryID?.() ?? libraryID;
    const col = pane?.getSelectedCollection?.();
    if (col && col.libraryID === libraryID) collectionID = col.id;
  } catch (e) {
    ztoolkit.log("flexannotate default scope failed:", e);
  }
  return { libraryID, scope: { collectionID, includeSub: true } };
}

export function listCollections(libraryID: number): ColNode[] {
  return (
    Zotero.Collections.getByLibrary(libraryID, true) as Zotero.Collection[]
  ).map((c) => ({ id: c.id, parentID: c.parentID, name: c.name }));
}

export function collectionChoices(libraryID: number) {
  return collectionOptions(listCollections(libraryID));
}

/**
 * Top-level item ids that belong to the scope (null = no restriction). An
 * annotation belongs to the scope when its work does.
 */
export function loadScopeWorkIDs(
  libraryID: number,
  scope: Scope,
): Set<number> | null {
  if (scope.collectionID === null) return null;
  const ids = scopeCollectionIDs(
    listCollections(libraryID),
    scope.collectionID,
    scope.includeSub,
  );
  const out = new Set<number>();
  for (const cid of ids) {
    const col = Zotero.Collections.get(cid) as Zotero.Collection | false;
    if (!col) continue;
    for (const id of col.getChildItems(true) as number[]) out.add(id);
  }
  return out;
}

// ── editing ──────────────────────────────────────────────────────────────────

export interface AnnotationPatch {
  text?: string;
  comment?: string;
  pageLabel?: string;
  locator?: string;
}

/** Citation place types: Zotero's own list, or a fallback. */
export function locatorTypes(): string[] {
  const labels = (Zotero as any).Cite?.labels;
  return Array.isArray(labels) && labels.length ? labels : FALLBACK_LOCATORS;
}

/** Localised label of a locator type ("page" → "S."). */
export function locatorLabel(type: string, form: "short" | null = "short") {
  try {
    const s = (Zotero as any).Cite.getLocatorString(type, form) as string;
    if (s) return s;
  } catch {
    // styles not initialised: fall through
  }
  return type === "page" ? "S." : type;
}

/**
 * Save edits of an annotation (quote, comment, place, place type). Returns
 * false for read-only annotations. The place type lives in a private tag.
 */
export async function saveAnnotation(
  id: number,
  patch: AnnotationPatch,
): Promise<boolean> {
  const item = Zotero.Items.get(id) as Zotero.Item | false;
  if (!item || !(item as any).isEditable?.()) return false;
  const a = item as any;
  if (patch.text !== undefined && a.annotationText !== undefined)
    a.annotationText = patch.text;
  if (patch.comment !== undefined) a.annotationComment = patch.comment;
  if (patch.pageLabel !== undefined) a.annotationPageLabel = patch.pageLabel;
  if (patch.locator !== undefined) {
    const attachment = item.parentItem as Zotero.Item | undefined;
    const changes = locatorTagChanges(
      item.getTags().map((t) => t.tag),
      attachment ? attachment.getTags().map((t) => t.tag) : [],
      patch.locator,
    );
    for (const tag of changes.remove) item.removeTag(tag);
    for (const { tag, type } of changes.add) item.addTag(tag, type);
  }
  await item.saveTx();
  return true;
}
