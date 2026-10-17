import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  explicitLocatorFromTags,
  formatAnnotationTitle,
  locatorLabelText,
} from "../src/features/reader/logic/readerLocator.ts";

const labels = { page: "Seite", margin: "Randnummer", opus: "Opus" };
const noCite = () => undefined;

describe("explicitLocatorFromTags", () => {
  it("reads a known locator from a text tag and from a tag object", () => {
    assert.equal(
      explicitLocatorFromTags(
        ["#flexannotate-locator-paragraph"],
        ["paragraph"],
      ),
      "paragraph",
    );
    assert.equal(
      explicitLocatorFromTags(
        [{ name: "#flexannotate-locator-section" }],
        ["section"],
      ),
      "section",
    );
    assert.equal(
      explicitLocatorFromTags(
        [{ tag: "#flexannotate-locator-line" }],
        ["line"],
      ),
      "line",
    );
  });

  it("ignores unknown labels, but always accepts margin", () => {
    assert.equal(
      explicitLocatorFromTags(["#flexannotate-locator-bogus"], ["page"]),
      null,
    );
    assert.equal(
      explicitLocatorFromTags(["#flexannotate-locator-margin"], []),
      "margin",
    );
  });

  it("returns null without a locator tag", () => {
    assert.equal(explicitLocatorFromTags([], ["page"]), null);
    assert.equal(explicitLocatorFromTags(["unrelated", 42], ["page"]), null);
  });
});

describe("locatorLabelText", () => {
  it("uses Zotero's label, and page for empty or default locators", () => {
    const cite = (l: string) =>
      l === "page"
        ? "p."
        : l === "paragraph"
          ? "para."
          : l === "opus"
            ? "CustomRandnummer"
            : undefined;
    assert.equal(locatorLabelText(undefined, cite, labels), "p.");
    assert.equal(locatorLabelText("page", cite, labels), "p.");
    assert.equal(locatorLabelText("paragraph", cite, labels), "para.");
    assert.equal(locatorLabelText("opus", cite, labels), "CustomRandnummer");
  });

  it("falls back to the translated page label when Zotero has none", () => {
    assert.equal(locatorLabelText("page", noCite, labels), "Seite");
    assert.equal(locatorLabelText(undefined, noCite, labels), "Seite");
  });

  it("uses the translated margin and opus labels as fallbacks", () => {
    assert.equal(locatorLabelText("margin", noCite, labels), "Randnummer");
    assert.equal(locatorLabelText("opus", noCite, labels), "Opus");
  });

  it("capitalizes an unknown locator without a label", () => {
    assert.equal(locatorLabelText("figure", noCite, labels), "Figure");
  });
});

describe("formatAnnotationTitle", () => {
  it("formats title with label and page label", () => {
    assert.equal(formatAnnotationTitle("Randnummer", "318"), "Randnummer 318");
    assert.equal(formatAnnotationTitle("Seite", undefined), "Seite -");
    assert.equal(formatAnnotationTitle("Seite", ""), "Seite -");
  });
});
