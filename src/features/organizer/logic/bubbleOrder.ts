/**
 * Pure logic for bubble reordering and preserving manual citation order.
 * No Zotero globals, node-testable.
 */

/**
 * Moves an element from `fromIndex` to `toIndex` in an array, returning a new array.
 * If indices are invalid or identical, returns the original array copy.
 */
export function reorderArray<T>(
  items: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return [...items];
  }
  const result = [...items];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

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
