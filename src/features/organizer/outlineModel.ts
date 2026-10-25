/**
 * outlineModel — Zotero-facing layer of the outline (tags, outline note).
 * The pure tree logic lives in ../../core/outline.ts.
 */

import {
  AnnotationIndex,
  AnnRecord,
  uriLibraryPrefix,
} from "./annotationIndex";
import { citationFor } from "./citation";
import {
  anchorTagDiff,
  HEADING_PREFIX,
  htmlToText,
  OUTLINE_TAG,
  outlineHeading,
  outlineHeadingOf,
  OutlineNode,
  parseOutline,
  pickNewest,
  serializeOutline,
} from "./logic/outline";
import { tr } from "./strings";
import { isFeatureEnabled } from "../gates";
export * from "./logic/outline";

/**
 * Extra tag with which an outline note is assigned to a collection
 * (library tree: note without extra tag). Base is the collection key,
 * not the id — the key survives sync and library changes stably.
 */
const COLLECTION_TAG_PREFIX = "#flexannotate-outline-";

function outlineCollectionTag(collectionKey: string): string {
  return `${COLLECTION_TAG_PREFIX}${collectionKey}`;
}

/** All extra tags of the note that assign a collection (foreign ones stay out). */
function outlineCollectionTags(note: Zotero.Item): string[] {
  return note
    .getTags()
    .map((t) => t.tag)
    .filter((t) => t.startsWith(COLLECTION_TAG_PREFIX));
}

/**
 * Work of an item: annotation → parent of the attachment, note/attachment →
 * parent item, otherwise the item itself. Same mapping as `Row.workID`.
 */
function workOf(item: Zotero.Item): number {
  if (isAnnotation(item)) {
    const att = Zotero.Items.get(item.parentItemID as number) as
      Zotero.Item | false;
    return (att && (att.parentItemID || att.id)) || item.id;
  }
  return item.parentItemID || item.id;
}

/**
 * Scope of a heading: work IDs of the top-level collection of the tree
 * (null = library tree, no restriction). The `§` tags are
 * library-wide; without a restriction, renaming or deleting in one
 * tree would also change the same-named heading in another tree.
 */
export type TagScope = Set<number> | null;

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

/** Whether an item is an outline note (carries the ★outline marker tag).
 *
 * Since the §-tag synchronization, this note itself carries `§` tags (as anchors,
 * so the heading tags exist in the library). It must therefore
 * never count as an assigned item (gather, buildCountMap).
 */
function isOutlineNote(item: Zotero.Item): boolean {
  return (
    !!item &&
    typeof item.isNote === "function" &&
    item.isNote() &&
    item.getTags().some((t) => t.tag === OUTLINE_TAG)
  );
}

export class OutlineModel {
  /** All outline notes of the library (tag search instead of loading all items). */
  private static async outlineNotes(libraryID: number): Promise<Zotero.Item[]> {
    const search = new Zotero.Search();
    (search as any).libraryID = libraryID;
    search.addCondition("tag", "is", OUTLINE_TAG);
    const ids = (await search.search()) as number[];
    return ((await Zotero.Items.getAsync(ids)) as Zotero.Item[]).filter(
      (i) => typeof i.isNote === "function" && i.isNote(),
    );
  }

  /** Locate the outline-storage note for a library (newest wins), or null. */
  private static async findNote(
    libraryID: number,
    collectionKey: string | null = null,
  ): Promise<Zotero.Item | null> {
    const notes = (await this.outlineNotes(libraryID)).filter((i) =>
      collectionKey === null
        ? // library tree: the note carries no assignment tag
          !outlineCollectionTags(i).length
        : i
            .getTags()
            .some((t) => t.tag === outlineCollectionTag(collectionKey)),
    );
    return pickNewest(notes);
  }

  /** Newest outline tree of every collection (key → roots), in one pass. */
  static async loadCollectionTrees(
    libraryID: number,
  ): Promise<Map<string, OutlineNode[]>> {
    const items = await this.outlineNotes(libraryID);
    const byKey = new Map<string, Zotero.Item[]>();
    for (const i of items) {
      const tags = i.getTags().map((t) => t.tag);
      for (const t of tags.filter((x) => x.startsWith(COLLECTION_TAG_PREFIX))) {
        const key = t.slice(COLLECTION_TAG_PREFIX.length);
        byKey.set(key, [...(byKey.get(key) ?? []), i]);
      }
    }
    const out = new Map<string, OutlineNode[]>();
    for (const [key, notes] of byKey) {
      const note = pickNewest(notes);
      if (note) out.set(key, parseOutline(note.getNote()));
    }
    return out;
  }

  /** Load the outline tree for a library (empty tree if none exists yet).
   *
   * `collectionKey` selects the tree: `null` = library tree (note without
   * assignment tag), otherwise the note with the matching extra tag.
   */
  static async load(
    libraryID: number,
    collectionKey: string | null = null,
  ): Promise<{ noteID: number | null; roots: OutlineNode[] }> {
    const note = await this.findNote(libraryID, collectionKey);
    if (!note) return { noteID: null, roots: [] };
    const roots = parseOutline(note.getNote());
    // Also pull forward the anchor § tags on load: thus a note that was created
    // before the §-tag synchronization gets its heading tags
    // retroactively. Idempotent — without a difference nothing is written.
    if (isFeatureEnabled("outlineAnchorTags")) {
      await this.syncAnchorTags(note.id, roots);
    }
    // Pull forward the heading (name of the top-level collection/library) of existing notes
    // so that several outline notes are distinguishable.
    if (isFeatureEnabled("outlineScopeHeading")) {
      await this.syncNoteHeading(note.id, libraryID, collectionKey);
    }
    return { noteID: note.id, roots };
  }

  /**
   * Purely reading load of the outline tree (without sync anchor tags / scope),
   * e.g. for tag suggestions (tagSuggest) in read-only libraries.
   */
  static async loadTreeOnly(
    libraryID: number,
    collectionKey: string | null = null,
  ): Promise<OutlineNode[]> {
    const note = await this.findNote(libraryID, collectionKey);
    if (!note) return [];
    return parseOutline(note.getNote());
  }

  /** Display name of the scope (top-level collection or library). */
  private static scopeName(
    libraryID: number,
    collectionKey: string | null,
  ): string | null {
    if (collectionKey) {
      const col = Zotero.Collections.getByLibraryAndKey(
        libraryID,
        collectionKey,
      );
      return col ? col.name : null;
    }
    const lib = Zotero.Libraries.get(libraryID);
    return lib ? lib.name : null;
  }

  /**
   * Rewrites the note's `<h1>` heading to the scope if it differs (e.g.
   * existing notes from an older version). Only the title is rewritten; the
   * outline content (JSON + list) stays unchanged and idempotent.
   */
  private static async syncNoteHeading(
    noteID: number,
    libraryID: number,
    collectionKey: string | null,
  ): Promise<void> {
    const note = Zotero.Items.get(noteID) as Zotero.Item | null;
    if (!note || !note.isNote?.() || !note.isEditable?.()) return;
    const current = note.getNote();
    const wanted = outlineHeading(
      this.scopeName(libraryID, collectionKey),
      tr("outlineTitle"),
    );
    if (outlineHeadingOf(current) === wanted) return;
    const replaced = current.replace(
      /<h1>[\s\S]*?<\/h1>/,
      `<h1>${wanted}</h1>`,
    );
    if (replaced === current) return;
    note.setNote(replaced);
    await note.saveTx();
  }

  /**
   * Applies the anchor `§` tags to the given note item in storage.
   * Returns true if tags were added or removed.
   */
  private static applyAnchorTags(
    note: Zotero.Item,
    roots: OutlineNode[],
  ): boolean {
    const current = note.getTags().map((t) => t.tag);
    const { add, remove } = anchorTagDiff(roots, current);
    if (!add.length && !remove.length) return false;
    for (const t of remove)
      if (note.getTags().some((x) => x.tag === t)) note.removeTag(t);
    for (const t of add)
      if (!note.getTags().some((x) => x.tag === t)) note.addTag(t);
    return true;
  }

  /**
   * Synchronizes the heading `§` tags on the outline note so every heading in
   * the tree has a tag in the library even without assigned items. Idempotent.
   */
  private static async syncAnchorTags(
    noteID: number,
    roots: OutlineNode[],
  ): Promise<void> {
    const note = Zotero.Items.get(noteID) as Zotero.Item | null;
    if (!note || !note.isNote?.() || !note.isEditable?.()) return;
    if (!this.applyAnchorTags(note, roots)) return;
    await note.saveTx();
  }

  static async save(
    libraryID: number,
    noteID: number | null,
    roots: OutlineNode[],
    collectionKey: string | null = null,
  ): Promise<number> {
    const scope = isFeatureEnabled("outlineScopeHeading")
      ? this.scopeName(libraryID, collectionKey)
      : null;
    const html = serializeOutline(roots, scope, tr("outlineTitle"));
    const anchorOn = isFeatureEnabled("outlineAnchorTags");
    let note = noteID ? (Zotero.Items.get(noteID) as Zotero.Item) : null;
    if (!note || !note.isNote?.()) {
      note = new Zotero.Item("note");
      note.libraryID = libraryID;
      note.setNote(html);
      note.addTag(OUTLINE_TAG);
      if (collectionKey) note.addTag(outlineCollectionTag(collectionKey));
      if (anchorOn) this.applyAnchorTags(note, roots);
      if (!note.isEditable?.()) return 0;
      // skipSelect: a selected note opens in Zotero's note editor, which later
      // writes its own (older) copy over our saves.
      await note.saveTx({ skipSelect: true });
      return note.id;
    }
    if (!note.isEditable?.()) return note.id;
    note.setNote(html);
    if (!note.getTags().some((t) => t.tag === OUTLINE_TAG))
      note.addTag(OUTLINE_TAG);
    if (anchorOn) this.applyAnchorTags(note, roots);
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
      const ids = (await search.search()) as number[];
      // Zotero 7 leaves annotations out of search results: add them from the index
      await AnnotationIndex.ensureBuilt(libraryID);
      for (const rec of AnnotationIndex.filter({ tags: [tag] }))
        if (rec.libraryID === libraryID && !ids.includes(rec.id))
          ids.push(rec.id);
      return ids;
    } catch (e) {
      ztoolkit.log("outlineModel itemsWithTag search failed:", e);
      return [];
    }
  }

  /** File an item (annotation, note or paper) under a heading. */
  static async fileUnder(itemID: number, tag: string): Promise<void> {
    const item = Zotero.Items.get(itemID) as Zotero.Item;
    if (!item) return;
    if (!item.isEditable?.()) return;
    if (item.getTags().some((t) => t.tag === tag)) return;
    item.addTag(tag);
    await item.saveTx();
  }

  /** Remove an item from a heading. */
  static async unfile(itemID: number, tag: string): Promise<void> {
    const item = Zotero.Items.get(itemID) as Zotero.Item;
    if (!item) return;
    if (!item.isEditable?.()) return;
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
    scope: TagScope = null,
  ): Promise<void> {
    if (oldTag === newTag) return;
    const ids = await this.itemsWithTag(libraryID, oldTag);
    const items = ((await Zotero.Items.getAsync(ids)) as Zotero.Item[]).filter(
      (i) => Boolean(i && (!scope || scope.has(workOf(i))) && i.isEditable?.()),
    );
    if (!items.length) return;
    try {
      await Zotero.DB.executeTransaction(async () => {
        for (const item of items) {
          item.removeTag(oldTag);
          if (!item.getTags().some((t) => t.tag === newTag))
            item.addTag(newTag);
          await item.save();
        }
      });
    } catch (e) {
      ztoolkit.log("outlineModel renameTag failed:", e);
    }
  }

  /** Strip a heading's tag from every item (used when deleting a heading). */
  static async purgeTag(
    libraryID: number,
    tag: string,
    scope: TagScope = null,
  ): Promise<void> {
    const ids = await this.itemsWithTag(libraryID, tag);
    const items = ((await Zotero.Items.getAsync(ids)) as Zotero.Item[]).filter(
      (i) => Boolean(i && (!scope || scope.has(workOf(i))) && i.isEditable?.()),
    );
    if (!items.length) return;
    try {
      await Zotero.DB.executeTransaction(async () => {
        for (const item of items) {
          item.removeTag(tag);
          await item.save();
        }
      });
    } catch (e) {
      ztoolkit.log("outlineModel purgeTag failed:", e);
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
  static async gather(
    libraryID: number,
    tag: string,
    scope: TagScope = null,
  ): Promise<FiledItem[]> {
    const out: FiledItem[] = [];
    const seen = new Set<number>();

    // Quotes come from the in-memory annotation index (fast, deep-linkable).
    await AnnotationIndex.ensureBuilt(libraryID);
    for (const rec of AnnotationIndex.filter({ tags: [tag] })) {
      if (rec.libraryID !== libraryID) continue;
      if (scope && !scope.has(rec.parentItemID)) continue;
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
      if (isOutlineNote(item)) continue; // Outline note is not a filed item
      if (scope && !scope.has(workOf(item))) continue;
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
  static async buildCountMap(
    libraryID: number,
    scope: TagScope = null,
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    const bump = (tag: string) => counts.set(tag, (counts.get(tag) || 0) + 1);

    await AnnotationIndex.ensureBuilt(libraryID);
    for (const rec of AnnotationIndex.all()) {
      if (rec.libraryID !== libraryID) continue;
      if (scope && !scope.has(rec.parentItemID)) continue;
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
        if (!item || isAnnotation(item) || isOutlineNote(item)) continue;
        if (scope && !scope.has(workOf(item))) continue;
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
