/**
 * Shared helpers of the citation dialog, used by `citedTracking.ts`
 * (live sync) and `citationJump.ts` (direct jump). Separate module so the two
 * can stay independent: disabling or replacing the direct jump must not break
 * the cited tracking.
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
 * Only the explicit test switch (`addon.data.env === "test"`, set by the
 * Zotero tests), never a profile path or duck typing: otherwise a real user
 * profile would silently lose the jump.
 */
export function isTestProfile(): boolean {
  return (addon?.data as any)?.env === "test";
}

let isJumping = false;

/**
 * Prevents parallel jumps (and a live sync while a jump is running):
 * `jumpToCitation` marks start/end via `setJumping`, the live sync checks
 * `isJumpingActive`.
 */
export function isJumpingActive(): boolean {
  return isJumping;
}

export function setJumping(active: boolean): void {
  isJumping = active;
}
