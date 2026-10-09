import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatLocator,
  locatorOf,
  locatorTagChanges,
} from "../src/core/locator.ts";

const para = "#flexannotate-locator-paragraph";
const docSection = "#flexannotate-default-locator-section";

describe("locator", () => {
  it("defaults to page", () => {
    assert.equal(locatorOf([]), "page");
    assert.equal(locatorOf(["unrelated"], []), "page");
  });

  it("reads the annotation tag", () => {
    assert.equal(locatorOf([para]), "paragraph");
  });

  it("falls back to the document default", () => {
    assert.equal(locatorOf([], [docSection]), "section");
  });

  it("prefers the annotation tag over the document default", () => {
    assert.equal(locatorOf([para], [docSection]), "paragraph");
  });

  it("ignores a stale Annotree tag", () => {
    assert.equal(locatorOf(["annotree:locator=chapter"]), "page");
  });

  it("sets no tag for page without a non-page document default", () => {
    assert.deepEqual(locatorTagChanges([], [], "page"), {
      remove: [],
      add: [],
    });
  });

  it("sets an automatic tag for a non-page type and removes old locator tags", () => {
    assert.deepEqual(locatorTagChanges([para], [], "chapter"), {
      remove: [para],
      add: [{ tag: "#flexannotate-locator-chapter", type: 1 }],
    });
  });

  it("sets a page tag when the document default is not page", () => {
    assert.deepEqual(locatorTagChanges([], [docSection], "page"), {
      remove: [],
      add: [{ tag: "#flexannotate-locator-page", type: 1 }],
    });
  });

  it("formats the place", () => {
    assert.equal(formatLocator("S.", "22"), "S. 22");
    assert.equal(formatLocator("S.", ""), "");
  });
});
