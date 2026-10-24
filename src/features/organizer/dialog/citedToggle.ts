/**
 * Grün-Haken-Umschalten im Zitierdialog: die Annotation als "bereits zitiert"
 * markieren bzw. die Markierung entfernen (Legacy-Pref-Store und
 * Word-Dokument-Variablen). Das Neuzeichnen übernimmt der Aufrufer über den
 * `refresh`-Callback, damit dieses Modul zyklenfrei bleibt.
 */

import type { View } from "./dialogOutlineRender";
import {
  readCitedStore,
  writeCitedStore,
  readDocCitedData,
  writeDocCitedData,
  currentSessionId,
} from "./dialogCited";
import { record, unrecord, toggleDocCited } from "../logic/cited";

export const GREEN = "#1f9d55";

/** Set or remove the green check of annotations for this document. */
export function setCited(
  win: Window,
  v: View,
  ids: number[],
  on: boolean,
  refresh: () => void,
): void {
  const sessionID = currentSessionId();
  const store = readCitedStore();
  const entries = ids.flatMap((id) => {
    const r = v.rows.get(id);
    return r ? [{ id, workID: r.workID }] : [];
  });
  const next = on
    ? record(store, sessionID, entries)
    : unrecord(store, sessionID, ids);
  try {
    writeCitedStore(next);
  } catch (e) {
    ztoolkit.log("flexannotate cited store write failed:", e);
  }

  // Update document-level persistent store
  try {
    const keys = ids
      .map((id) => v.rows.get(id)?.key)
      .filter((k): k is string => !!k);
    if (keys.length) {
      const docData = readDocCitedData() || { citations: {} };
      const updated = toggleDocCited(docData, keys, on);
      writeDocCitedData(updated);
    }
  } catch (e) {
    ztoolkit.log("flexannotate doc cited write failed:", e);
  }

  for (const id of ids) {
    if (on) v.cited.add(id);
    else v.cited.delete(id);
  }
  refresh();
}
