import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyClick,
  dragIds,
  emptySelection,
  prune,
  selectAll,
} from "../src/core/selection.ts";

const order = [10, 11, 12, 13, 14];

describe("selection", () => {
  it("plain click selects only the row", () => {
    const s = applyClick(emptySelection(), order, 12, {});
    assert.deepEqual([...s.selected], [12]);
    assert.equal(s.anchor, 12);
  });

  it("ctrl click toggles", () => {
    let s = applyClick(emptySelection(), order, 10, {});
    s = applyClick(s, order, 13, { ctrl: true });
    assert.deepEqual([...s.selected].sort(), [10, 13]);
    s = applyClick(s, order, 10, { ctrl: true });
    assert.deepEqual([...s.selected], [13]);
  });

  it("shift click selects the range in both directions", () => {
    let s = applyClick(emptySelection(), order, 11, {});
    s = applyClick(s, order, 13, { shift: true });
    assert.deepEqual([...s.selected], [11, 12, 13]);
    s = applyClick(s, order, 10, { shift: true });
    assert.deepEqual([...s.selected], [10, 11]);
  });

  it("shift without anchor behaves like a plain click", () => {
    const s = applyClick(emptySelection(), order, 12, { shift: true });
    assert.deepEqual([...s.selected], [12]);
  });

  it("select all and prune after filtering", () => {
    const all = selectAll(order);
    assert.equal(all.selected.size, 5);
    const p = prune(all, [11, 12]);
    assert.deepEqual([...p.selected], [11, 12]);
    assert.equal(p.anchor, null);
  });

  it("a drag carries the whole selection only if the row is part of it", () => {
    const s = applyClick(
      applyClick(emptySelection(), order, 10, {}),
      order,
      12,
      {
        ctrl: true,
      },
    );
    assert.deepEqual(dragIds(s, 12).sort(), [10, 12]);
    assert.deepEqual(dragIds(s, 14), [14]);
  });
});
