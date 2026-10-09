/**
 * Export of the outline as a Zotero note (outline with its quotes).
 */

import { flatten } from "../../core/outline";
import { gatherAll, saveDraftAsNote } from "./outlineExport";
import { toast } from "./organizerDom";
import { tr } from "./strings";
import { State } from "./organizerState";

/** Write the outline with its quotes into a new Zotero note and show it. */
export async function exportNote(s: State) {
  const g = await gatherAll(s.libraryID, s.roots);
  const note = await saveDraftAsNote(s.roots, g, s.libraryID, {
    title: tr("exportNoteTitle"),
  });
  const n = [...g.values()].reduce((a, items) => a + items.length, 0);
  toast(
    tr("exportDone")
      .replace("{h}", String(flatten(s.roots).length))
      .replace("{n}", String(n)),
  );
  try {
    await (Zotero.getMainWindow() as any)?.ZoteroPane?.selectItem(note.id);
  } catch {
    // the note exists even if it cannot be shown
  }
}
