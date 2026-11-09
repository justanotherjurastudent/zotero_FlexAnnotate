/**
 * Works and annotations in one citation (citation-only mode).
 *
 * Switching the dialog type (titles / annotations) makes Zotero throw away the entries chosen
 * so far: setDialogType() ends with `CitationDataManager.clearAll()` (citationDialog.js 306).
 * In citation-only mode both kinds end up as ordinary citations (see integrationPatch.ts), so
 * the entries are kept across the switch instead.
 */
import { assignChecked } from "../../shared/patch";
import { getPref } from "../../utils/prefs";

const installed = new WeakMap<Window, { orig: unknown; patched: unknown }>();

export function injectMixedCitation(win: Window): void {
  if (installed.has(win)) return;
  const cdm = (win as any).CitationDataManager;
  if (typeof cdm?.clearAll !== "function") return;
  const orig = cdm.clearAll;
  const patched = function (this: unknown, ...args: unknown[]) {
    const type = (win as any).DIALOG_STATE?.type;
    const switching = type === "citation" || type === "annotations"; // not "add-note"
    if (!getPref("citationOnly") || !switching || !cdm.items?.length) {
      return orig.apply(this, args);
    }
    // Keep the entries in the order the user built. `unsorted` stops the annotations-mode
    // sort() (citationDialog.js 2294) from regrouping them and keeps the order on insert.
    const io = (win as any).io;
    if (io?.citation) {
      io.citation.properties = io.citation.properties || {};
      io.citation.properties.unsorted = true;
    }
  };
  if (!assignChecked(cdm, "clearAll", patched)) {
    ztoolkit.log("FlexAnnotate: patch of CitationDataManager.clearAll failed");
    return;
  }
  installed.set(win, { orig, patched });
}

export function removeMixedCitation(win: Window): void {
  const entry = installed.get(win);
  if (!entry) return;
  installed.delete(win);
  const cdm = (win as any).CitationDataManager;
  if (cdm && cdm.clearAll === entry.patched) {
    if (!assignChecked(cdm, "clearAll", entry.orig)) {
      ztoolkit.log(
        "FlexAnnotate: restore of CitationDataManager.clearAll failed",
      );
    }
  }
}
