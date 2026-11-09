import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldSkipSort } from "../src/features/organizer/logic/bubbleOrder.ts";

describe("bubbleOrder", () => {
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
