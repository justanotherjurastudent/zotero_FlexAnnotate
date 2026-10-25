/**
 * Scope of the outline note: the name of the main collection (or the library)
 * is in the `<h1>` heading of the note, so several outline notes are
 * distinguishable in the item list. Existing notes are rewritten on load
 * (idempotent), the content list stays untouched.
 *
 * This module is separate from the core model (outlineModel.ts) so it can be
 * adjusted individually if Zotero later maintains the heading itself. The pure
 * helper logic (outlineHeading/outlineHeadingOf) lives in `logic/outline.ts`.
 */

import { outlineHeading, outlineHeadingOf } from "./logic/outline";
import { tr } from "./strings";

/** Display name of the scope (top-level collection or library). */
export function scopeName(
  libraryID: number,
  collectionKey: string | null,
): string | null {
  if (collectionKey) {
    const col = Zotero.Collections.getByLibraryAndKey(libraryID, collectionKey);
    return col ? col.name : null;
  }
  const lib = Zotero.Libraries.get(libraryID);
  return lib ? lib.name : null;
}

/**
 * Rewrites the note's `<h1>` heading to the scope
 * if it differs (e.g. existing notes from a version before the
 * heading extension). Only the title is rewritten, the
 * outline content (JSON + list) stays unchanged and idempotent.
 */
export async function syncNoteHeading(
  noteID: number,
  libraryID: number,
  collectionKey: string | null,
): Promise<void> {
  const note = Zotero.Items.get(noteID) as Zotero.Item | null;
  if (!note || !note.isNote?.()) return;
  if (!note.isEditable?.()) return;
  const current = note.getNote();
  const wanted = outlineHeading(
    scopeName(libraryID, collectionKey),
    tr("outlineTitle"),
  );
  if (outlineHeadingOf(current) === wanted) return;
  // Replace only the first <h1>…</h1> line, leave the rest untouched.
  const replaced = current.replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${wanted}</h1>`);
  if (replaced === current) return;
  note.setNote(replaced);
  await note.saveTx();
}
