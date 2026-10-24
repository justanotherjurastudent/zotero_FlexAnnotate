/**
 * §-Tag-Verankerung an der Gliederungsnotiz.
 *
 * Jede Überschrift im Gliederungsbaum trägt ein `§`-Tag auf der Gliederungsnotiz
 * selbst, damit der Tag in der Bibliothek existiert und beim Tippen von `§` in
 * der Tag-Zeile (PDF/Item) vorgeschlagen wird — auch ohne zugeordnete Items.
 * Umbenennen/Löschen einer Überschrift entfernt den zugehörigen Tag wieder.
 *
 * Dieses Modul ist vom Kernmodell (outlineModel.ts) getrennt, damit es einzeln
 * angepasst oder ersetzt werden kann, falls Zotero die Tag-Verankerung später
 * selbst übernimmt. Die Notiz zählt in gather/buildCountMap nie als zugeordnetes
 * Item (isOutlineNote schließt sie aus).
 */

import { anchorTagDiff, type OutlineNode } from "./logic/outline";

/**
 * Wendet die Anker-`§`-Tags auf das übergebene Notiz-Item im Speicher an.
 * Gibt true zurück, wenn Tags hinzugefügt oder entfernt wurden.
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
 * Synchronisiert die Überschriften-`§`-Tags auf der Gliederungsnotiz: Jede
 * Überschrift im Baum bekommt ein Tag auf der Notiz, damit der Tag in der
 * Bibliothek existiert und in der PDF-Ansicht beim Tippen von `§` in der
 * Tag-Zeile vorgeschlagen wird — auch ohne zugeordnete Items. Tags ohne
 * passende Überschrift (Umbenennen/Löschen) werden entfernt. Idempotent.
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
