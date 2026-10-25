/**
 * Gemeinsame Helfer des Zitierdialogs, die von `citedTracking.ts` (Live-Sync)
 * und `citationJump.ts` (Direktsprung) genutzt werden. Eigene Datei, damit die
 * beiden Module unabhängig voneinander bleiben: ein Deaktivieren oder Ersetzen
 * des Direktsprungs darf das Zitier-Tracking nicht brechen.
 */

export function logJump(msg: string, detail?: unknown): void {
  try {
    const suffix =
      detail === undefined
        ? ""
        : ` ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
    (Zotero as any).debug?.(`[FlexAnnotate] ${msg}${suffix}`);
  } catch {
    /* ignore */
  }
  try {
    if (typeof ztoolkit !== "undefined" && ztoolkit?.log) {
      if (detail !== undefined) {
        ztoolkit.log(`flexannotate ${msg}`, detail);
      } else {
        ztoolkit.log(`flexannotate ${msg}`);
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Nur der ausdrückliche Testschalter (`addon.data.env === "test"`, setzen die
 * Zotero-Tests), nie Profilpfad oder Duck-Typing: sonst würde ein echtes
 * Nutzerprofil still das Springen verlieren.
 */
export function isTestProfile(): boolean {
  return (addon?.data as any)?.env === "test";
}

let isJumping = false;

/**
 * Verhindert parallele Sprünge (und einen Live-Sync während eines Sprungs):
 * `jumpToCitation` markiert den Anfang/Ende über `setJumping`, der Live-Sync
 * prüft `isJumpingActive`.
 */
export function isJumpingActive(): boolean {
  return isJumping;
}

export function setJumping(active: boolean): void {
  isJumping = active;
}
