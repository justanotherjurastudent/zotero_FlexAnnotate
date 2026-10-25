/**
 * Zugriff auf die aktive Word/LibreOffice-Integration-Session. Geteilt von
 * `citedTracking.ts` (Zitier-Tracking) und `citationJump.ts` (Direktsprung),
 * damit die beiden Module zyklenfrei bleiben.
 */

/** Active integration session if any. */
export function currentSession(): any {
  return (Zotero as any).Integration?.currentSession;
}

/** Id of the document the dialog was opened from (stored in the document). */
export function currentSessionId(): string {
  const session = currentSession();
  return String(session?.sessionID ?? "unknown");
}
