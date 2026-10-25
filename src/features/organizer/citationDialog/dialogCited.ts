/**
 * Entry point of the cited-tracking and footnote-jump functions.
 *
 * The logic is split into atomic modules so individual concerns can be
 * adjusted or replaced easily (e.g. when Zotero's integration APIs change):
 *
 * - `citedTracking.ts`  – cited tracking (green check), footnote mapping, live reconcile
 * - `citationJump.ts`   – direct jump to footnote/citation (Word/LibreOffice/Mac)
 * - `citationShared.ts` – shared session access and jump state
 * - `logic/cited.ts`    – pure logic (store, doc data, mapping)
 *
 * This file re-exports the public API unchanged, so existing imports
 * (addon.api, dialogOutline, dialogOutlineRender, integrationPatch) stay
 * stable.
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
export { currentSession, currentSessionId } from "./citationShared";
export { bringWordProcessorToFront, jumpToCitation } from "./citationJump";
