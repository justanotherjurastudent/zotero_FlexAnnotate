/**
 * Zitier-Tracking im Zitierdialog: welche Annotationen sind schon im Dokument
 * zitiert (grüner Haken)? Speicher in Word-Dokument-Variablen
 * (`session.data.prefs.flexannotate_cited`) und Fallback in einer Zotero-Pref
 * (`citedAnnotations`). Übernahme beim Akzeptieren (io.accept), Live-Abgleich
 * gegen die real im Dokument existierenden Zitierfelder und die Fußnoten-
 * Zuordnung je Annotation (Fußnoten-Badges).
 */

import {
  activeIds,
  buildCitationLocationsMap,
  buildWorkCitationLocationsMap,
  findCitationLocations,
  parseDocData,
  parseStore,
  record,
  recordDocCitation,
  reconcileDocData,
  serializeDocData,
} from "../logic/cited";
import type {
  CitationLocation,
  CitedDocData,
  CitedStore,
} from "../logic/cited";
import { getLastCommand } from "./persistentState";
import { isJumpingActive, isTestProfile, logJump } from "./citationShared";
import { currentSession, currentSessionId } from "./citationSession";

export type { CitationLocation };

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
    const authoritativeEmpty =
      Boolean(session?._sessionUpToDate) &&
      Array.isArray(session?._fields) &&
      session._fields.length === 0;
    const {
      data: reconciled,
      activeKeys,
      pruned,
    } = reconcileDocData(docData, docCitationIDs, authoritativeEmpty);
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

/**
 * Remember which annotations the accepted citation contains. Bewusst ohne
 * `io.isAddingAnnotations`-Wache: Annotationen können auch im Zitiermodus
 * (addEditCitation, Blätterfenster nach „Zitat bearbeiten“) eingefügt werden
 * und müssen dann ebenfalls getrackt werden; Nicht-Annotationen werden unten
 * ausgefiltert, es entsteht also kein Eintrag für gewöhnliche Zitate.
 */
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

/**
 * Returns active citation locations (e.g. footnote numbers) for a specific annotation key.
 */
export function getCitationLocations(
  annKey: string,
  docData?: CitedDocData | null,
  citations?: any[] | Record<string, any> | null,
): CitationLocation[] {
  if (!annKey) return [];
  const resolvedDocData = docData !== undefined ? docData : readDocCitedData();
  if (!resolvedDocData) return [];
  const session = currentSession();
  const defaultNoteType = session?.data?.prefs?.noteType;
  const resolvedCitations =
    citations !== undefined ? citations : session?.citationsByIndex;
  return findCitationLocations(
    resolvedDocData,
    resolvedCitations,
    annKey,
    defaultNoteType,
  );
}

/**
 * Maps all annotation keys to their active citation locations in the document.
 */
export function getAllCitationLocations(
  docData?: CitedDocData | null,
  citations?: any[] | Record<string, any> | null,
): Map<string, CitationLocation[]> {
  const resolvedDocData = docData !== undefined ? docData : readDocCitedData();
  const session = currentSession();
  const defaultNoteType = session?.data?.prefs?.noteType;
  const resolvedCitations =
    citations !== undefined ? citations : session?.citationsByIndex;
  return buildCitationLocationsMap(
    resolvedDocData,
    resolvedCitations,
    defaultNoteType,
  );
}

/**
 * Maps all cited work IDs to their active citation locations in the document.
 */
export function getAllWorkCitationLocations(
  citationsByItemID?: Record<string, unknown> | null,
): Map<number, CitationLocation[]> {
  const session = currentSession();
  const defaultNoteType = session?.data?.prefs?.noteType;
  const resolved =
    citationsByItemID !== undefined
      ? citationsByItemID
      : session?.citationsByItemID;
  return buildWorkCitationLocationsMap(resolved, defaultNoteType);
}

let isSyncingSession = false;

/**
 * Liest die Zitierfelder im geöffneten Textdokument neu ein und aktualisiert
 * `session.citationsByIndex`, `session.citationsByItemID` und `session.documentCitationIDs`.
 * Gibt `true` zurück, wenn sich der Dokumentstand (Zitate oder Fußnotennummern) geändert hat.
 */
export async function syncSessionFromDocument(): Promise<boolean> {
  if (isSyncingSession || isJumpingActive()) return false;
  const integration = (Zotero as any).Integration;
  if (!integration || integration.currentDoc) return false;
  const session = currentSession();
  if (!session || typeof session.updateFromDocument !== "function") {
    return false;
  }

  const snapshot = (s: any): string => {
    try {
      const cids = Object.keys(s?.documentCitationIDs || {}).sort();
      const locs: string[] = [];
      for (const [idx, cit] of Object.entries(s?.citationsByIndex || {})) {
        const c = cit as any;
        const nIndex = c?.properties?.noteIndex ?? 0;
        const nType = c?.properties?.noteType ?? s?.data?.prefs?.noteType ?? 0;
        locs.push(`${idx}:${c?.citationID ?? ""}:${nIndex}:${nType}`);
      }
      const prefNoteType = s?.data?.prefs?.noteType ?? 0;
      return `${prefNoteType}|${cids.join(",")}|${locs.join(";")}`;
    } catch {
      return "";
    }
  };

  const before = snapshot(session);
  isSyncingSession = true;
  let doc: any = null;
  const prevDoc = session._doc;
  const prevProgress = session.progressBar;
  try {
    const cmd = getLastCommand();
    const agent =
      cmd?.agent ||
      session.agent ||
      ((Zotero as any).isWin
        ? "WinWord"
        : (Zotero as any).isMac
          ? "MacWord"
          : "LibreOffice");
    const docId = cmd?.docId;

    const app = integration.getApplication?.(agent, "sync", docId);
    if (!app) return false;

    if (!isTestProfile()) {
      await (Zotero as any).Promise?.delay?.(10);
    }

    const docPromise =
      app.getDocument && docId
        ? app.getDocument(docId)
        : app.getActiveDocument?.();
    if (!docPromise) return false;
    doc = await docPromise;
    if (!doc) return false;

    session._doc = doc;
    session._fields = null;
    session._transactionUpToDate = false;
    session.progressBar = {
      show() {},
      hide() {},
      start() {},
      finishSegment() {},
    };

    await session.updateFromDocument(false);

    // Wurden Fußnoten gelöscht, bereinigte flexannotate_cited-Daten auch im Dokument sichern
    const docData = readDocCitedData();
    if (docData !== null) {
      const { data: reconciled, pruned } = reconcileDocData(
        docData,
        session.documentCitationIDs,
        true,
      );
      if (pruned) {
        writeDocCitedData(reconciled);
        if (
          typeof doc.setDocumentData === "function" &&
          typeof session.data?.serialize === "function"
        ) {
          try {
            await doc.setDocumentData(session.data.serialize());
          } catch {
            /* ignore setDocumentData error during background sync */
          }
        }
      }
    }

    const after = snapshot(session);
    return before !== after;
  } catch (e) {
    logJump("syncSessionFromDocument failed:", e);
    return false;
  } finally {
    session._doc = prevDoc;
    session.progressBar = prevProgress;
    if (doc) {
      try {
        if (typeof doc.cleanup === "function") await doc.cleanup();
        if (typeof doc.complete === "function") await doc.complete();
      } catch {
        /* ignore cleanup error */
      }
    }
    isSyncingSession = false;
  }
}
