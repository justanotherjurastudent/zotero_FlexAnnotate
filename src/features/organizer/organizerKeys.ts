/**
 * Keyboard handling of the organizer window: arrow keys and Delete in the tree
 * and the list, F2 to rename, Ctrl+A to select all, Ctrl+arrows to reorder.
 */

import {
  indent,
  locate,
  moveDown,
  moveUp,
  neighborId,
  outdent,
  OutlineNode,
} from "../../core/outline";
import { applyClick, selectAll } from "../../core/selection";
import { unassign } from "./organizerFiling";
import { Ctx, orderIds, persist } from "./organizerState";
import { deleteNode } from "./organizerTree";

// keyboard ---------------------------------------------------------------------

export function onKey(ctx: Ctx, e: KeyboardEvent) {
  const { s } = ctx;
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (s.renaming) return;
  const ctrl = e.ctrlKey || e.metaKey;
  const rerender = () => ctx.render();
  const saveAndRender = async () => {
    await persist(s);
    rerender();
  };
  const selNode =
    s.node !== "all" && s.node !== "none" ? locate(s.roots, s.node) : null;

  // Ctrl+A: all entries of the list
  if (ctrl && e.key.toLowerCase() === "a") {
    e.preventDefault();
    s.sel = selectAll(orderIds(s));
    rerender();
    return;
  }

  if (s.focusCol === "tree") {
    if (e.key === "Delete" && selNode) {
      e.preventDefault();
      void deleteNode(ctx);
    } else if (e.key === "F2" && selNode) {
      e.preventDefault();
      s.renaming = s.node;
      rerender();
    } else if (ctrl && selNode && e.key.startsWith("Arrow")) {
      const ops: Record<string, (r: OutlineNode[], id: string) => boolean> = {
        ArrowUp: moveUp,
        ArrowDown: moveDown,
        ArrowRight: indent,
        ArrowLeft: outdent,
      };
      e.preventDefault();
      if (ops[e.key]?.(s.roots, s.node)) void saveAndRender();
    } else if (!ctrl && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const next = neighborId(
        s.roots,
        selNode ? s.node : null,
        e.key === "ArrowDown" ? 1 : -1,
      );
      if (next) {
        s.node = next;
        rerender();
      }
    }
    return;
  }

  // list column
  if (e.key === "Delete" && selNode && s.sel.selected.size) {
    e.preventDefault();
    void unassign(ctx, [...s.sel.selected], selNode.node);
  } else if (!ctrl && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    e.preventDefault();
    const order = orderIds(s);
    const cur = s.sel.anchor !== null ? order.indexOf(s.sel.anchor) : -1;
    const step = e.key === "ArrowDown" ? 1 : -1;
    const next = order[Math.max(0, Math.min(order.length - 1, cur + step))];
    if (next !== undefined) {
      s.sel = applyClick(s.sel, order, next, { shift: e.shiftKey });
      rerender();
    }
  }
}
