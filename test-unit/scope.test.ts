import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectionOptions,
  descendantIds,
  scopeCollectionIDs,
} from "../src/core/collections.ts";
import {
  formatLocator,
  locatorOf,
  locatorTagChanges,
  usesFlexAnnotate,
} from "../src/core/locator.ts";
import { activeIds, parseStore, record } from "../src/core/cited.ts";
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

describe("locator (compatible with FlexAnnotate)", () => {
  const flexAnn = "#flexannotate-locator-paragraph";
  const flexDefault = "#flexannotate-default-locator-section";

  it("reads FlexAnnotate tags first, then the document default, then its own", () => {
    assert.equal(locatorOf(["x"]), "page");
    assert.equal(locatorOf(["annotree:locator=chapter"]), "chapter");
    assert.equal(locatorOf(["x"], [flexDefault]), "section");
    assert.equal(locatorOf([flexAnn], [flexDefault]), "paragraph");
    assert.equal(
      locatorOf(["annotree:locator=chapter"], [flexDefault]),
      "section",
      "FlexAnnotate's default wins over Annotree's own tag",
    );
  });

  it("sets no tag of its own where FlexAnnotate is in use", () => {
    assert.equal(usesFlexAnnotate([flexAnn], []), true);
    assert.equal(usesFlexAnnotate(["x"], [flexDefault]), true);
    assert.equal(usesFlexAnnotate(["x"], []), false);
    const c = locatorTagChanges([flexAnn], [], "section");
    assert.deepEqual(c.remove, [flexAnn]);
    assert.deepEqual(c.add, [
      { tag: "#flexannotate-locator-section", type: 1 },
    ]);
    // a document default of section: choosing page needs an explicit tag
    const d = locatorTagChanges(["x"], [flexDefault], "page");
    assert.deepEqual(d.add, [{ tag: "#flexannotate-locator-page", type: 1 }]);
    // like FlexAnnotate: page without a non-page default needs no tag
    const e = locatorTagChanges([flexAnn], [], "page");
    assert.deepEqual(e.add, []);
  });

  it("migrates its own tag away when FlexAnnotate takes over", () => {
    const c = locatorTagChanges(
      ["annotree:locator=chapter"],
      [flexDefault],
      "section",
    );
    assert.deepEqual(c.remove, ["annotree:locator=chapter"]);
    assert.ok(c.add.every((t) => t.tag.startsWith("#flexannotate-")));
  });

  it("uses its private tag without FlexAnnotate, none for page", () => {
    assert.deepEqual(locatorTagChanges(["x"], [], "section").add, [
      { tag: "annotree:locator=section", type: 0 },
    ]);
    assert.deepEqual(
      locatorTagChanges(["annotree:locator=section"], [], "page"),
      { remove: ["annotree:locator=section"], add: [] },
    );
  });

  it("formats the place", () => {
    assert.equal(formatLocator("S.", "22"), "S. 22");
    assert.equal(formatLocator("S.", ""), "");
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
