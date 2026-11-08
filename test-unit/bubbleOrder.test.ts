import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  reorderArray,
  shouldSkipSort,
} from "../src/features/organizer/logic/bubbleOrder.ts";

describe("bubbleOrder", () => {
  it("moves an element to an earlier position", () => {
    const list = ["a", "b", "c", "d"];
    assert.deepEqual(reorderArray(list, 2, 0), ["c", "a", "b", "d"]);
  });

  it("moves an element to a later position", () => {
    const list = ["a", "b", "c", "d"];
    assert.deepEqual(reorderArray(list, 1, 3), ["a", "c", "d", "b"]);
  });

  it("returns unchanged copy when indices are identical", () => {
    const list = ["a", "b", "c"];
    assert.deepEqual(reorderArray(list, 1, 1), ["a", "b", "c"]);
  });

  it("returns unchanged copy when indices are out of bounds", () => {
    const list = ["a", "b", "c"];
    assert.deepEqual(reorderArray(list, -1, 2), ["a", "b", "c"]);
    assert.deepEqual(reorderArray(list, 0, 5), ["a", "b", "c"]);
  });

  it("shouldSkipSort is true only when isUnsorted is explicitly true", () => {
    assert.equal(shouldSkipSort(true), true);
    assert.equal(shouldSkipSort(false), false);
    assert.equal(shouldSkipSort(undefined), false);
  });

  it("shouldSkipSort allows sorting when keepSortedChecked is true", () => {
    assert.equal(shouldSkipSort(true, true), false);
    assert.equal(shouldSkipSort(true, false), true);
    assert.equal(shouldSkipSort(false, true), false);
  });
});
