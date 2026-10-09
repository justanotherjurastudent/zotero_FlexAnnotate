/**
 * outlineModel — Zotero-facing layer of the outline (tags, outline note).
 * The pure tree logic lives in ../../core/outline.ts.
 */

import {
  AnnotationIndex,
  AnnRecord,
  uriLibraryPrefix,
} from "./annotationIndex";
import { citationFor } from "./annotationExport";
import {
  HEADING_PREFIX,
  htmlToText,
  OUTLINE_TAG,
  OutlineNode,
  parseOutline,
  pickNewest,
  serializeOutline,
} from "../../core/outline";
export * from "../../core/outline";

/** A quote/note/source filed under a heading, flattened for display + export. */
export interface FiledItem {
  itemID: number;
  kind: "annotation" | "note" | "source";
  /** Source paper title (annotation/source) or note title. */
  title: string;
  /** Highlighted quote (annotation) or note body text. */
  quote: string;
  /** Reader's comment on an annotation. */
  comment: string;
  pageLabel: string;
  /** Formatted citation for the source paper (honours QuickCopy style). */
  citation: string;
  tags: string[];
  /** zotero:// deep link back to the source, when one can be built. */
  link: string;
  key: string;
}

// ── library-touching layer ───────────────────────────────────────────────────

function isAnnotation(item: Zotero.Item): boolean {
  return (
    !!item &&
    typeof (item as any).isAnnotation === "function" &&
    (item as any).isAnnotation()
  );
}

export class OutlineModel {
  /** Locate the outline-storage note for a library (newest wins), or null. */
  private static async findNote(
    libraryID: number,
  ): Promise<Zotero.Item | null> {
    const ids = (await (Zotero.Items as any).getAll(
      libraryID,
      false,
      false,
      true,
    )) as number[] | undefined;
    const items = (await Zotero.Items.getAsync(ids || [])) as Zotero.Item[];
    const notes = items.filter(
      (i) =>
        typeof i.isNote === "function" &&
        i.isNote() &&
        i.getTags().some((t) => t.tag === OUTLINE_TAG),
    );
    return pickNewest(notes);
  }

  /** Load the outline tree for a library (empty tree if none exists yet). */
  static async load(
    libraryID: number,
  ): Promise<{ noteID: number | null; roots: OutlineNode[] }> {
    const note = await this.findNote(libraryID);
    if (!note) return { noteID: null, roots: [] };
    return { noteID: note.id, roots: parseOutline(note.getNote()) };
  }

  /**
   * Persist the tree. Creates the storage note on first save, updates it after.
   * Returns the note id so the caller can keep saving to the same note.
   */
  static async save(
    libraryID: number,
    noteID: number | null,
    roots: OutlineNode[],
  ): Promise<number> {
    const html = serializeOutline(roots);
    let note = noteID ? (Zotero.Items.get(noteID) as Zotero.Item) : null;
    if (!note || !note.isNote?.()) {
      note = new Zotero.Item("note");
      note.libraryID = libraryID;
      note.setNote(html);
      note.addTag(OUTLINE_TAG);
      // skipSelect: a selected note opens in Zotero's note editor, which later
      // writes its own (older) copy over our saves.
      await note.saveTx({ skipSelect: true });
      return note.id;
    }
    note.setNote(html);
    if (!note.getTags().some((t) => t.tag === OUTLINE_TAG))
      note.addTag(OUTLINE_TAG);
    await note.saveTx();
    return note.id;
  }

  /** Item ids in a library carrying a given tag (annotations included). */
  private static async itemsWithTag(
    libraryID: number,
    tag: string,
  ): Promise<number[]> {
    try {
      const search = new Zotero.Search();
      (search as any).libraryID = libraryID;
      search.addCondition("tag", "is", tag);
      return (await search.search()) as number[];
    } catch (e) {
      ztoolkit.log("outlineModel itemsWithTag search failed:", e);
      return [];
    }
  }

  /** File an item (annotation, note or paper) under a heading. */
  static async fileUnder(itemID: number, tag: string): Promise<void> {
    const item = Zotero.Items.get(itemID) as Zotero.Item;
    if (!item) return;
    if (item.getTags().some((t) => t.tag === tag)) return;
    item.addTag(tag);
    await item.saveTx();
  }

  /** Remove an item from a heading. */
  static async unfile(itemID: number, tag: string): Promise<void> {
    const item = Zotero.Items.get(itemID) as Zotero.Item;
    if (!item) return;
    item.removeTag(tag);
    await item.saveTx();
  }

  /**
   * Rename a heading's tag across every item that carries it, so filed quotes
   * and notes follow the rename. Search covers annotations, notes and papers.
   */
  static async renameTag(
    libraryID: number,
    oldTag: string,
    newTag: string,
  ): Promise<void> {
    if (oldTag === newTag) return;
    const ids = await this.itemsWithTag(libraryID, oldTag);
    const items = (await Zotero.Items.getAsync(ids)) as Zotero.Item[];
    for (const item of items) {
      try {
        item.removeTag(oldTag);
        if (!item.getTags().some((t) => t.tag === newTag)) item.addTag(newTag);
        await item.saveTx();
      } catch (e) {
        ztoolkit.log("outlineModel renameTag: one item failed:", e);
      }
    }
  }

  /** Strip a heading's tag from every item (used when deleting a heading). */
  static async purgeTag(libraryID: number, tag: string): Promise<void> {
    const ids = await this.itemsWithTag(libraryID, tag);
    const items = (await Zotero.Items.getAsync(ids)) as Zotero.Item[];
    for (const item of items) {
      try {
        item.removeTag(tag);
        await item.saveTx();
      } catch (e) {
        ztoolkit.log("outlineModel purgeTag: one item failed:", e);
      }
    }
  }

  private static annotationToFiled(rec: AnnRecord): FiledItem {
    const paper = Zotero.Items.get(rec.parentItemID) as Zotero.Item | undefined;
    const link = rec.attachmentKey
      ? `zotero://open-pdf/${rec.libraryPrefix}/items/${rec.attachmentKey}?annotation=${rec.key}`
      : "";
    return {
      itemID: rec.id,
      kind: "annotation",
      title: rec.parentTitle,
      quote: rec.text,
      comment: rec.comment,
      pageLabel: rec.pageLabel,
      citation: paper ? citationFor(paper) : rec.parentTitle,
      tags: rec.tags,
      link,
      key: rec.key,
    };
  }

  private static noteToFiled(item: Zotero.Item): FiledItem {
    // A note filed under a heading (e.g. a manually filed note). Cite its first
    // related regular item, if any, so the draft still points at a source.
    let citation = "";
    for (const key of item.relatedItems || []) {
      const rel = Zotero.Items.getByLibraryAndKey(item.libraryID, key) as
        Zotero.Item | false;
      if (rel && rel.isRegularItem?.()) {
        citation = citationFor(rel);
        break;
      }
    }
    const prefix = uriLibraryPrefix(item.libraryID);
    return {
      itemID: item.id,
      kind: "note",
      title: item.getNoteTitle?.() || "(note)",
      quote: htmlToText(item.getNote()),
      comment: "",
      pageLabel: "",
      citation,
      tags: item.getTags().map((t) => t.tag),
      link: `zotero://select/${prefix}/items/${item.key}`,
      key: item.key,
    };
  }

  private static sourceToFiled(item: Zotero.Item): FiledItem {
    const prefix = uriLibraryPrefix(item.libraryID);
    return {
      itemID: item.id,
      kind: "source",
      title: item.getDisplayTitle?.() || "(item)",
      quote: "",
      comment: "",
      pageLabel: "",
      citation: citationFor(item),
      tags: item.getTags().map((t) => t.tag),
      link: `zotero://select/${prefix}/items/${item.key}`,
      key: item.key,
    };
  }

  /** Everything filed under a heading: quotes, notes and whole papers. */
  static async gather(libraryID: number, tag: string): Promise<FiledItem[]> {
    const out: FiledItem[] = [];
    const seen = new Set<number>();

    // Quotes come from the in-memory annotation index (fast, deep-linkable).
    await AnnotationIndex.ensureBuilt(libraryID);
    for (const rec of AnnotationIndex.filter({ tags: [tag] })) {
      if (rec.libraryID !== libraryID) continue;
      if (seen.has(rec.id)) continue;
      seen.add(rec.id);
      out.push(this.annotationToFiled(rec));
    }

    // Notes and whole papers come from a tag search (annotations may be omitted
    // from search results, which is why they're handled via the index above).
    const ids = await this.itemsWithTag(libraryID, tag);
    const items = (await Zotero.Items.getAsync(ids)) as Zotero.Item[];
    for (const item of items) {
      if (!item || seen.has(item.id)) continue;
      if (isAnnotation(item)) continue;
      seen.add(item.id);
      if (item.isNote?.()) out.push(this.noteToFiled(item));
      else if (item.isRegularItem?.()) out.push(this.sourceToFiled(item));
    }
    return out;
  }

  /**
   * Tag → count of items filed under it, for every heading-prefixed tag in the
   * library. One index pass + one tag search, so the tree can show live badges
   * without gathering each heading separately.
   */
  static async buildCountMap(libraryID: number): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    const bump = (tag: string) => counts.set(tag, (counts.get(tag) || 0) + 1);

    await AnnotationIndex.ensureBuilt(libraryID);
    for (const rec of AnnotationIndex.all()) {
      if (rec.libraryID !== libraryID) continue;
      for (const t of rec.tags) if (t.startsWith(HEADING_PREFIX)) bump(t);
    }

    // Notes/papers carrying a heading tag (annotations already counted above).
    try {
      const search = new Zotero.Search();
      (search as any).libraryID = libraryID;
      search.addCondition("tag", "contains", HEADING_PREFIX);
      const ids = (await search.search()) as number[];
      const items = (await Zotero.Items.getAsync(ids)) as Zotero.Item[];
      for (const item of items) {
        if (!item || isAnnotation(item)) continue;
        for (const t of item.getTags())
          if (t.tag.startsWith(HEADING_PREFIX)) bump(t.tag);
      }
    } catch (e) {
      ztoolkit.log("outlineModel buildCountMap search failed:", e);
    }
    return counts;
  }

  /**
   * Candidate quotes/notes for the assign picker: annotations
   * matching a keyword that are NOT already filed under `tag`.
   */
  static async assignCandidates(
    libraryID: number,
    tag: string,
    keyword: string,
    limit = 40,
  ): Promise<FiledItem[]> {
    await AnnotationIndex.ensureBuilt(libraryID);
    const kw = keyword.trim().toLowerCase();
    const out: FiledItem[] = [];
    for (const rec of AnnotationIndex.all()) {
      if (rec.libraryID !== libraryID) continue;
      if (rec.tags.includes(tag)) continue;
      if (kw) {
        const hay = (
          rec.text +
          "\n" +
          rec.comment +
          "\n" +
          rec.parentTitle
        ).toLowerCase();
        if (!hay.includes(kw)) continue;
      }
      out.push(this.annotationToFiled(rec));
      if (out.length >= limit) break;
    }
    return out;
  }
}
