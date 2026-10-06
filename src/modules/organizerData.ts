/**
 * organizerData — rows for the organizer window and bulk filing.
 *
 * Two kinds of rows, like Citavi's two tabs: "work" rows (Titel) are regular
 * Zotero items, "annotation" rows (Wissen) come from the annotation index.
 * Filing a row under a heading = adding the heading's tag to the item.
 */

import { AnnotationIndex } from "./annotationIndex";
import { citationFor } from "./annotationExport";

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
