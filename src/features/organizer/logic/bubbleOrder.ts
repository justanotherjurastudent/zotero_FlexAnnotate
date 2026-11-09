/**
 * Pure logic for preserving a manual citation order (Zotero moves the bubbles itself).
 * No Zotero globals, node-testable.
 */

/**
 * Determines whether automatic sorting should be skipped because the user
 * manually modified the citation order.
 * If keepSorted is explicitly checked by the user, sorting must not be skipped.
 */
export function shouldSkipSort(
  isUnsorted: boolean | undefined,
  keepSortedChecked?: boolean,
): boolean {
  if (keepSortedChecked === true) return false;
  return isUnsorted === true;
}
