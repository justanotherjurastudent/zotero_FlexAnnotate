/**
 * selection — click/ctrl/shift multi-selection over an ordered list of ids.
 * Pure logic (no DOM, no Zotero) so it can be unit-tested in Node.
 */

export interface SelectionState {
  selected: Set<number>;
  /** Last plain/ctrl-clicked id; the start of a shift range. */
  anchor: number | null;
}

export function emptySelection(): SelectionState {
  return { selected: new Set(), anchor: null };
}

/**
 * Apply a click on `id` given the visible `order`.
 *  - plain: select only `id`
 *  - ctrl/meta: toggle `id`
 *  - shift: select the range anchor..id (replacing the selection)
 */
export function applyClick(
  state: SelectionState,
  order: number[],
  id: number,
  mods: { ctrl?: boolean; shift?: boolean },
): SelectionState {
  if (mods.shift && state.anchor !== null && order.includes(state.anchor)) {
    const a = order.indexOf(state.anchor);
    const b = order.indexOf(id);
    if (b < 0) return state;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return { selected: new Set(order.slice(lo, hi + 1)), anchor: state.anchor };
  }
  if (mods.ctrl) {
    const next = new Set(state.selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selected: next, anchor: id };
  }
  return { selected: new Set([id]), anchor: id };
}

/** Select everything in `order`. */
export function selectAll(order: number[]): SelectionState {
  return { selected: new Set(order), anchor: order[0] ?? null };
}

/** Drop ids that are no longer visible (after a filter or reload). */
export function prune(state: SelectionState, order: number[]): SelectionState {
  const visible = new Set(order);
  const selected = new Set([...state.selected].filter((i) => visible.has(i)));
  const anchor =
    state.anchor !== null && visible.has(state.anchor) ? state.anchor : null;
  return { selected, anchor };
}

/** Ids a drag should carry: the whole selection if the dragged row is in it. */
export function dragIds(state: SelectionState, draggedId: number): number[] {
  return state.selected.has(draggedId) ? [...state.selected] : [draggedId];
}
