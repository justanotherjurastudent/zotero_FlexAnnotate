/**
 * Zitierte Anmerkungen im Zitierdialog: Speicher in Word-Dokument-Variablen
 * (session.data.prefs.flexannotate_cited) und Fallback in einer Zotero-Pref
 * (citedAnnotations). Übernahme beim Akzeptieren (io.accept) und Abgleich gegen
 * im Dokument vorhandene Zitierungen (session.documentCitationIDs).
 */

import {
  activeIds,
  parseDocData,
  parseStore,
  record,
  recordDocCitation,
  reconcileDocData,
  serializeDocData,
} from "../logic/cited";
import type { CitedDocData, CitedStore } from "../logic/cited";

const CITED_PREF = "citedAnnotations";
export const DOC_CITED_PREF = "flexannotate_cited";

function prefKey(name: string): string {
  return `${addon.data.config.prefsPrefix}.${name}`;
}

export function readCitedStore(): CitedStore {
  try {
    return parseStore(Zotero.Prefs.get(prefKey(CITED_PREF), true) as string);
  } catch {
    return {};
  }
}

/** Wirft bei Fehlern; der Aufrufer entscheidet, ob er protokolliert. */
export function writeCitedStore(store: CitedStore): void {
  Zotero.Prefs.set(prefKey(CITED_PREF), JSON.stringify(store), true);
}

/** Active integration session if any. */
export function currentSession(): any {
  return (Zotero as any).Integration?.currentSession;
}

/** Id of the document the dialog was opened from (stored in the document). */
export function currentSessionId(): string {
  const session = currentSession();
  return String(session?.sessionID ?? "unknown");
}

export function readDocCitedData(): CitedDocData | null {
  const session = currentSession();
  const raw = session?.data?.prefs?.[DOC_CITED_PREF];
  if (typeof raw === "string") {
    return parseDocData(raw);
  }
  return null;
}

export function writeDocCitedData(data: CitedDocData): boolean {
  const session = currentSession();
  if (session?.data?.prefs && typeof session.data.prefs === "object") {
    session.data.prefs[DOC_CITED_PREF] = serializeDocData(data);
    return true;
  }
  return false;
}

/**
 * Works cited in the document. Zotero loads this when the dialog opens, so we
 * wait for the same promise the dialog itself waits for (max. 5 s) instead of
 * reading a possibly still empty map.
 */
export async function citedWorksOf(win: Window): Promise<Set<number> | null> {
  let map: Record<string, unknown> | null = null;
  try {
    const loaded = (win as any).io?.allCitedDataLoadedPromise;
    if (loaded) {
      const result: any = await Promise.race([
        loaded,
        new Promise((resolve) => win.setTimeout(() => resolve(null), 5000)),
      ]);
      map = result?.[1] ?? null;
    }
  } catch (e) {
    ztoolkit.log("flexannotate cited works wait failed:", e);
  }
  map ??=
    (Zotero as any).Integration?.currentSession?.citationsByItemID ?? null;
  return map ? new Set<number>(Object.keys(map).map((k) => Number(k))) : null;
}

/**
 * Returns the set of annotation IDs currently marked as cited.
 * Uses Word document variables (flexannotate_cited) reconciled against active
 * citation IDs in the document (session.documentCitationIDs) with O(1) Set lookup.
 * Falls back to legacy Zotero.Prefs store when document prefs are not available.
 */
export function getActiveCitedIDs(
  rows: { id: number; key?: string; workID: number }[],
  citedWorks: Set<number> | null,
): Set<number> {
  const session = currentSession();
  const docData = readDocCitedData();

  if (docData !== null) {
    const docCitationIDs = session?.documentCitationIDs;
    const {
      data: reconciled,
      activeKeys,
      pruned,
    } = reconcileDocData(docData, docCitationIDs);
    if (pruned) {
      writeDocCitedData(reconciled);
    }
    const cited = new Set<number>();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.key && activeKeys.has(r.key)) {
        cited.add(r.id);
      }
    }
    return cited;
  }

  // Fallback to legacy Pref-based store
  return activeIds(readCitedStore(), currentSessionId(), citedWorks);
}

/** Remember which annotations the accepted citation contains. */
function recordCited(io: any) {
  const entries: { id: number; workID: number }[] = [];
  const annKeys: string[] = [];
  for (const ci of io.citation?.citationItems ?? []) {
    const item = Zotero.Items.get(ci.id) as Zotero.Item | false;
    if (!item || !item.isAnnotation()) continue;
    const attachment = item.parentItem as Zotero.Item | undefined;
    entries.push({ id: item.id, workID: Number(attachment?.parentID) || 0 });
    if (item.key) annKeys.push(item.key);
  }
  if (!entries.length) return;

  // Legacy store update
  writeCitedStore(record(readCitedStore(), currentSessionId(), entries));

  // Word document store update
  if (annKeys.length && io.citation) {
    if (
      !io.citation.citationID ||
      io.citation.citationID === "flexannotate-browse"
    ) {
      io.citation.citationID =
        (Zotero as any).Utilities?.randomString?.() ||
        Math.random().toString(36).slice(2);
    }
    const docData = readDocCitedData() || { citations: {} };
    const nextDoc = recordDocCitation(docData, io.citation.citationID, annKeys);
    writeDocCitedData(nextDoc);
  }
}

/** Wraps io.accept once per dialog so that the accepted citation is remembered. */
export function hookAccept(win: Window): void {
  const io = (win as any).io;
  if (io && typeof io.accept === "function" && !io.__flexannotateHooked) {
    const original = io.accept;
    io.accept = function (...args: unknown[]) {
      try {
        recordCited(io);
      } catch (e) {
        ztoolkit.log("flexannotate record cited failed:", e);
      }
      return original.apply(this, args);
    };
    io.__flexannotateHooked = true;
  }
}
