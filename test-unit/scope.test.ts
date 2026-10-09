import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectionOptions,
  descendantIds,
  scopeCollectionIDs,
} from "../src/core/collections.ts";
import { activeIds, parseStore, record, unrecord } from "../src/core/cited.ts";
import { makeNode, neighborId } from "../src/core/outline.ts";

const cols = [
  { id: 1, parentID: false as const, name: "Recht" },
  { id: 2, parentID: 1, name: "Zivilrecht" },
  { id: 3, parentID: 2, name: "BGB AT" },
  { id: 4, parentID: 1, name: "Arbeitsrecht" },
  { id: 5, parentID: false as const, name: "Anderes" },
];

describe("collections", () => {
  it("lists a depth-first name-sorted tree", () => {
    assert.deepEqual(
      collectionOptions(cols).map((o) => [o.name, o.depth]),
      [
        ["Anderes", 0],
        ["Recht", 0],
        ["Arbeitsrecht", 1],
        ["Zivilrecht", 1],
        ["BGB AT", 2],
      ],
    );
  });
  it("includes subcollections only when asked", () => {
    assert.deepEqual(descendantIds(cols, 1).sort(), [1, 2, 3, 4]);
    assert.deepEqual(scopeCollectionIDs(cols, 2, false), [2]);
    assert.deepEqual(scopeCollectionIDs(cols, 2, true).sort(), [2, 3]);
  });
});

describe("cited marks", () => {
  it("records per document and validates against cited works", () => {
    let s = parseStore("kaputt");
    assert.deepEqual(s, {});
    s = record(s, "doc1", [
      { id: 10, workID: 1 },
      { id: 11, workID: 2 },
    ]);
    s = record(s, "doc2", [{ id: 12, workID: 1 }]);
    assert.deepEqual([...activeIds(s, "doc1", null)].sort(), [10, 11]);
    assert.deepEqual([...activeIds(s, "doc1", new Set([2]))], [11]);
    assert.deepEqual([...activeIds(s, "doc3", null)], []);
  });
  it("keeps only the newest documents", () => {
    let s = {};
    for (let i = 0; i < 60; i++) s = record(s, "d" + i, [{ id: i, workID: 1 }]);
    assert.equal(Object.keys(s).length, 50);
    assert.ok("d59" in s && !("d0" in s));
  });
});

describe("tree neighbours", () => {
  const a = makeNode("A");
  const b = makeNode("B");
  const b1 = makeNode("B1");
  b.children.push(b1);
  const roots = [a, b];
  it("walks the outline order", () => {
    assert.equal(neighborId(roots, a.id, 1), b.id);
    assert.equal(neighborId(roots, b.id, 1), b1.id);
    assert.equal(neighborId(roots, b1.id, 1), null);
    assert.equal(neighborId(roots, a.id, -1), null);
    assert.equal(neighborId(roots, null, 1), a.id);
  });
});

describe("cited marks: manual removal", () => {
  it("removes single annotations and can mark them again", () => {
    let s = record({}, "d", [
      { id: 1, workID: 5 },
      { id: 2, workID: 5 },
    ]);
    s = unrecord(s, "d", [1]);
    assert.deepEqual([...activeIds(s, "d", null)], [2]);
    s = record(s, "d", [{ id: 1, workID: 5 }]);
    assert.deepEqual([...activeIds(s, "d", null)].sort(), [1, 2]);
    assert.deepEqual(unrecord(s, "other", [1]).other, {});
  });
});
