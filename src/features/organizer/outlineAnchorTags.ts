/**
 * §-tag anchoring on the outline note.
 *
 * Every heading in the outline tree carries a `§`-tag on the outline note
 * itself, so the tag exists in the library and is suggested when typing `§` in
 * the tag row (PDF/item) — even without filed items. Renaming/deleting a
 * heading removes its tag again.
 *
 * This module is separate from the core model (outlineModel.ts) so it can be
 * adjusted or replaced individually if Zotero later adopts the tag anchoring
 * itself. The note never counts as a filed item in gather/buildCountMap
 * (isOutlineNote excludes it).
 */

import { anchorTagDiff, type OutlineNode } from "./logic/outline";

/**
 * Applies the anchor `§` tags to the given note item in storage.
 * Returns true if tags were added or removed.
 */
export function applyAnchorTags(
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
 * Synchronizes the heading `§` tags on the outline note: every
 * heading in the tree gets a tag on the note so the tag exists in the
 * library and is suggested in the PDF view when typing `§` in the
 * tag row — even without assigned items. Tags without a
 * matching heading (rename/delete) are removed. Idempotent.
 */
export async function syncAnchorTags(
  noteID: number,
  roots: OutlineNode[],
): Promise<void> {
  const note = Zotero.Items.get(noteID) as Zotero.Item | null;
  if (!note || !note.isNote?.()) return;
  if (!note.isEditable?.()) return;
  const changed = applyAnchorTags(note, roots);
  if (!changed) return;
  await note.saveTx();
}
