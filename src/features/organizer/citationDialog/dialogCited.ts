/**
 * Einstiegspunkt der Zitier-Tracking- und Fußnoten-Sprung-Funktionen.
 *
 * Die Logik ist in atomare Module aufgeteilt, damit einzelne Belange leicht
 * angepasst oder ausgetauscht werden können (z. B. wenn sich Zoteros
 * Integration-APIs ändern):
 *
 * - `citedTracking.ts`   – Zitier-Tracking (grüner Haken), Fußnoten-Zuordnung, Live-Abgleich
 * - `citationJump.ts`    – Direktsprung zur Fußnote/Zitatstelle (Word/LibreOffice/Mac)
 * - `citationSession.ts` – geteilter Zugriff auf die Integration-Session
 * - `logic/cited.ts`     – reine Logik (Store, Doc-Daten, Zuordnung)
 *
 * Diese Datei re-exportiert die öffentliche API unverändert, damit bestehende
 * Importe (addon.api, dialogOutline, dialogOutlineRender, integrationPatch)
 * stabil bleiben.
 */

export {
  readCitedStore,
  writeCitedStore,
  readDocCitedData,
  writeDocCitedData,
  citedWorksOf,
  getActiveCitedIDs,
  hookAccept,
  getCitationLocations,
  getAllCitationLocations,
  getAllWorkCitationLocations,
  syncSessionFromDocument,
  DOC_CITED_PREF,
} from "./citedTracking";
export type { CitationLocation } from "./citedTracking";
export { currentSession, currentSessionId } from "./citationSession";
export { bringWordProcessorToFront, jumpToCitation } from "./citationJump";
