/**
 * Access to the active Word/LibreOffice integration session. Shared between
 * `citedTracking.ts` (citation tracking) and `citationJump.ts` (direct jump)
 * so both modules remain cycle-free.
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
