/**
 * openTarget — jump from an organizer row to its place in Zotero.
 *
 * Annotations open in Zotero's reader at the exact annotation. Zotero.Reader.open
 * reuses an already open tab (selects it and navigates), so we only have to
 * pass the location {annotationID: <annotation key>} and bring the main window
 * to the front, because the organizer is a separate window.
 * Anchors (Zotero 10.0.5): xpcom/reader.js `open(itemID, location, …)` reuses
 * open tabs and calls `navigate(location)`; xpcom/fileHandlers.js:91 shows the
 * `annotationID` location key.
 */

import type { Row } from "./organizerData";

function activateMainWindow(): any {
  const win = Zotero.getMainWindow() as any;
  try {
    if (win) (Zotero as any).Utilities.Internal.activate(win);
  } catch {
    win?.focus?.();
  }
  return win;
}

export async function openRow(row: Row): Promise<void> {
  try {
    if (row.kind === "work") {
      const win = activateMainWindow();
      await win?.ZoteroPane?.selectItem(row.id);
      return;
    }
    await (Zotero.Reader as any).open(row.attachmentID, {
      annotationID: row.key,
    });
    activateMainWindow();
  } catch (e) {
    ztoolkit.log("flexannotate open row failed:", e);
  }
}
