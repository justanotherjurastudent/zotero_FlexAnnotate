import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlaceholderPDF,
  buildSortIndex,
  DEFAULT_COLOR,
  normalizeColor,
} from "../src/core/printAnnotation.ts";

describe("buildSortIndex", () => {
  it("sorts by the first number in the label", () => {
    assert.equal(buildSortIndex("Rn. 12"), "00012|000000|00000");
    assert.equal(buildSortIndex("007"), "00007|000000|00000");
  });

  it("orders plain pages numerically, not as text", () => {
    assert.ok(buildSortIndex("7") < buildSortIndex("12"));
  });

  it("puts labels without digits behind every page", () => {
    assert.equal(buildSortIndex("XIV"), "99999|000000|00000");
    assert.ok(buildSortIndex("XIV") > buildSortIndex("99998"));
  });

  it("treats empty and missing labels like labels without digits", () => {
    assert.equal(buildSortIndex(""), "99999|000000|00000");
    assert.equal(buildSortIndex(undefined), "99999|000000|00000");
    assert.equal(buildSortIndex(null), "99999|000000|00000");
  });

  it("caps very large page numbers at 99999", () => {
    assert.equal(buildSortIndex("123456789"), "99999|000000|00000");
    assert.equal(buildSortIndex(42), "00042|000000|00000");
  });
});

describe("normalizeColor", () => {
  it("lowercases valid uppercase hex colors", () => {
    assert.equal(normalizeColor("#FF0000"), "#ff0000");
  });

  it("trims surrounding whitespace before validating", () => {
    assert.equal(normalizeColor("  #00ff7f "), "#00ff7f");
  });

  it("falls back to the default for missing or invalid colors", () => {
    for (const bad of [undefined, null, "", "red", "#fff", "#gg0000"]) {
      assert.equal(normalizeColor(bad), DEFAULT_COLOR, String(bad));
    }
  });
});

describe("buildPlaceholderPDF", () => {
  it("writes a PDF whose xref offsets point at the objects", () => {
    const text = new TextDecoder().decode(buildPlaceholderPDF());
    assert.ok(text.startsWith("%PDF-1.4\n"));

    const xref = Number(text.match(/startxref\n(\d+)/)?.[1]);
    assert.equal(text.slice(xref, xref + 4), "xref");

    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n /gm)].map(
      (m) => Number(m[1]),
    );
    assert.equal(offsets.length, 3);
    offsets.forEach((offset, i) => {
      assert.ok(text.startsWith(`${i + 1} 0 obj`, offset));
    });
  });
});
