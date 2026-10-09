import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { citationOnlyItems } from "../src/core/citeOnly.ts";
import type { AnnotationRef, CitationItemLike } from "../src/core/citeOnly.ts";
import { locatorOf } from "../src/core/locator.ts";

const ref = (over: Partial<AnnotationRef> = {}): AnnotationRef => ({
  topLevelId: 100,
  pageLabel: "22",
  locatorType: "page",
  ...over,
});

describe("citationOnlyItems", () => {
  it("returns null for an empty citation", () => {
    assert.equal(citationOnlyItems([], []), null);
  });

  it("returns null when refs and items differ in length", () => {
    assert.equal(citationOnlyItems([{ id: 1 }], []), null);
  });

  it("returns null for a mixed selection (non-annotation entry)", () => {
    const items = [{ id: 1 }, { id: 2 }];
    assert.equal(citationOnlyItems(items, [ref(), null]), null);
  });

  it("returns null when an annotation has no citable top-level item", () => {
    const items = [{ id: 1 }, { id: 2 }];
    assert.equal(
      citationOnlyItems(items, [ref(), ref({ topLevelId: null })]),
      null,
    );
  });

  it("points to the parent item and sets page locator and label", () => {
    const [entry] = citationOnlyItems(
      [{ id: 7, uris: ["x"], itemData: { title: "old" } }],
      [ref({ topLevelId: 100, pageLabel: "22", locatorType: "page" })],
    )!;
    assert.equal(entry.id, 100);
    assert.equal(entry.locator, "22");
    assert.equal(entry.label, "page");
    assert.equal(entry.uris, undefined);
    assert.equal(entry.itemData, undefined);
  });

  it("uses the document default locator type, and the annotation tag wins", () => {
    const docDefault = locatorOf([], ["#flexannotate-default-locator-section"]);
    assert.equal(docDefault, "section");
    const [byDefault] = citationOnlyItems(
      [{ id: 1 }],
      [ref({ locatorType: docDefault })],
    )!;
    assert.equal(byDefault.label, "section");

    const own = locatorOf(
      ["#flexannotate-locator-figure"],
      ["#flexannotate-default-locator-section"],
    );
    assert.equal(own, "figure");
  });

  it("annotation without a page label sets no locator and keeps the original fields", () => {
    const [entry] = citationOnlyItems(
      [{ id: 1, locator: "keep", label: "keep" }],
      [ref({ pageLabel: "", locatorType: "" })],
    )!;
    assert.equal(entry.id, 100);
    assert.equal(entry.locator, "keep");
    assert.equal(entry.label, "keep");
  });

  it("keeps order and per-item parents for mixed page labels", () => {
    const result = citationOnlyItems(
      [{ id: 1 }, { id: 2 }, { id: 3 }],
      [
        ref({ topLevelId: 10, pageLabel: "1" }),
        ref({ topLevelId: 20, pageLabel: "" }),
        ref({ topLevelId: 30, pageLabel: "3", locatorType: "section" }),
      ],
    )!;
    assert.deepEqual(
      result.map((e) => [e.id, e.locator]),
      [
        [10, "1"],
        [20, undefined],
        [30, "3"],
      ],
    );
  });

  it("does not mutate the input", () => {
    const items: CitationItemLike[] = [{ id: 7, uris: ["x"] }];
    citationOnlyItems(items, [ref()]);
    assert.equal(items[0].id, 7);
    assert.deepEqual(items[0].uris, ["x"]);
    assert.equal(items[0].locator, undefined);
  });
});
