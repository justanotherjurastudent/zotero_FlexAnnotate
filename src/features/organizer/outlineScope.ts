/**
 * Geltungsbereich der Gliederungsnotiz: Der Name der Hauptsammlung (bzw. der
 * Bibliothek) steht in der `<h1>`-Überschrift der Notiz, damit mehrere
 * Gliederungsnotizen in der Item-Liste unterscheidbar sind. Bestehende Notizen
 * werden beim Laden umgeschrieben (idempotent), die Inhalts-Liste bleibt
 * unberührt.
 *
 * Dieses Modul ist vom Kernmodell (outlineModel.ts) getrennt, damit es einzeln
 * angepasst werden kann, falls Zotero die Überschrift künftig selbst pflegt.
 * Die reine Helfer-Logik (outlineHeading/outlineHeadingOf) liegt in
 * `logic/outline.ts`.
 */

import { outlineHeading, outlineHeadingOf } from "./logic/outline";
import { tr } from "./strings";

/** Anzeigename des Geltungsbereichs (Hauptsammlung oder Bibliothek). */
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
 * Schreibt die `<h1>`-Überschrift der Notiz auf den Geltungsbereich um,
 * falls sie abweicht (z. B. bestehende Notizen aus einer Version vor der
 * Überschriften-Erweiterung). Nur der Titel wird neu geschrieben, der
 * Gliederungsinhalt (JSON + Liste) bleibt unverändert und idempotent.
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
  // Nur die erste <h1>…</h1>-Zeile ersetzen, den Rest unangetastet lassen.
  const replaced = current.replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${wanted}</h1>`);
  if (replaced === current) return;
  note.setNote(replaced);
  await note.saveTx();
}
