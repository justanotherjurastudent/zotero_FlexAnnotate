export { isWindowAlive };

/**
 * Check if the window is alive.
 * Useful to prevent opening duplicate windows.
 * @param win
 */
function isWindowAlive(win?: Window) {
  return win && !Components.utils.isDeadWrapper(win) && !win.closed;
}

/**
 * The collection selected in the main pane, or null. 10.x offers
 * `getSelectedCollections()`; older versions only the single variant, which
 * newer versions throw for ("was removed").
 */
export function selectedCollection(pane: any): Zotero.Collection | null {
  const cols = pane?.getSelectedCollections?.();
  if (Array.isArray(cols)) return cols[0] ?? null;
  const col = pane?.getSelectedCollection?.();
  return col && typeof col === "object" ? col : null;
}
