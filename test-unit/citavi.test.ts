import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAnnotationData,
  createLocatorResolver,
  isDuplicateAnnotation,
  isPageTail,
  isQuoteNote,
  normalizeText,
  parsePageRange,
  resolveKeywords,
  splitOnetoN,
  stripMarkup,
  xpathLiteral,
} from "../src/core/citavi.ts";

// Standardwerte der Prefs (prefs.js)
const DEFAULT_PREFS: Record<string, string> = {
  citaviLocatorPage: "page",
  citaviLocatorColumn: "column",
  citaviLocatorParagraph: "paragraph",
  citaviLocatorMargin: "paragraph",
  citaviLocatorOther: "page",
};
const prefsWith =
  (overrides: Record<string, string> = {}) =>
  (name: string) =>
    ({ ...DEFAULT_PREFS, ...overrides })[name];
const locatorFor = createLocatorResolver(prefsWith());

describe("parsePageRange", () => {
  it("reads a single page and defaults to the page locator", () => {
    const raw = "<sp> <n>12</n> <os>12</os> </sp>";
    assert.deepEqual(parsePageRange(raw, "12", locatorFor), {
      pageLabel: "12",
      locator: "page",
    });
  });

  it("keeps a page range as displayed", () => {
    const raw = "<sp> <n>12</n> <os>12-14</os> </sp>";
    assert.equal(parsePageRange(raw, "12", locatorFor).pageLabel, "12-14");
  });

  it("keeps 'S. 12 f.' and roman numerals as displayed", () => {
    assert.equal(
      parsePageRange("<sp><os>S. 12 f.</os></sp>", null, locatorFor).pageLabel,
      "S. 12 f.",
    );
    assert.equal(
      parsePageRange("<sp><os>XIV</os></sp>", null, locatorFor).pageLabel,
      "XIV",
    );
  });

  it("falls back to PageRangeNumber when <os> is missing", () => {
    assert.equal(parsePageRange("", "45", locatorFor).pageLabel, "45");
  });

  it("returns an empty label when the page is missing (-1 or nothing)", () => {
    assert.equal(parsePageRange("", "-1", locatorFor).pageLabel, "");
    assert.equal(parsePageRange(null, null, locatorFor).pageLabel, "");
  });

  it("maps Margin, Paragraph and Column to their locators", () => {
    const margin = "<sp><n>128</n><nt>Margin</nt><os>128</os></sp>";
    const paragraph = "<sp><nt>Paragraph</nt><os>7</os></sp>";
    const column = "<sp><nt>Column</nt><os>3</os></sp>";
    assert.equal(parsePageRange(margin, null, locatorFor).locator, "paragraph");
    assert.equal(
      parsePageRange(paragraph, null, locatorFor).locator,
      "paragraph",
    );
    assert.equal(parsePageRange(column, null, locatorFor).locator, "column");
  });

  it("uses the preference override for a number type", () => {
    const resolve = createLocatorResolver(
      prefsWith({ citaviLocatorMargin: "opus" }),
    );
    const margin = "<sp><nt>Margin</nt><os>128</os></sp>";
    assert.equal(parsePageRange(margin, null, resolve).locator, "opus");
  });

  it("treats an empty preference as the 'page' fallback", () => {
    const resolve = createLocatorResolver(
      prefsWith({ citaviLocatorColumn: "" }),
    );
    const column = "<sp><nt>Column</nt><os>3</os></sp>";
    assert.equal(parsePageRange(column, null, resolve).locator, "page");
  });

  it("maps an unknown number type to 'Other' and reports it only once", () => {
    const reported: string[] = [];
    const resolve = createLocatorResolver(
      prefsWith({ citaviLocatorOther: "section" }),
      (nt) => reported.push(nt),
    );
    const unknown = "<sp><nt>Zeile</nt><os>9</os></sp>";
    assert.equal(parsePageRange(unknown, null, resolve).locator, "section");
    assert.equal(parsePageRange(unknown, null, resolve).locator, "section");
    assert.deepEqual(reported, ["Zeile"]);
  });
});

describe("normalizeText and stripMarkup", () => {
  it("collapses whitespace and trims", () => {
    assert.equal(normalizeText("  a \n\t b  "), "a b");
    assert.equal(normalizeText(null), "");
  });

  it("removes tags and decodes entities once", () => {
    const html =
      "<h1>Kern</h1>\n<p>Der &quot;Satz&quot; &amp; &lt;x&gt;&nbsp;y</p>";
    assert.equal(normalizeText(stripMarkup(html)), 'Kern Der "Satz" & <x> y');
    assert.equal(stripMarkup("&amp;lt;"), "&lt;");
  });
});

describe("isPageTail and isQuoteNote", () => {
  it("accepts only digits, dashes and whitespace up to 60 characters", () => {
    assert.equal(isPageTail(""), true);
    assert.equal(isPageTail(" 12–14 "), true);
    assert.equal(isPageTail(" S. 12"), false);
    assert.equal(isPageTail("1".repeat(61)), false);
  });

  it("matches a note that is the quote followed only by a locator", () => {
    const note = "<h1>Kern</h1>\n<p>Zitat</p>\n<i>12</i>";
    assert.equal(
      isQuoteNote(note, { coreStatement: "Kern", text: "Zitat" }),
      true,
    );
  });

  it("rejects a longer note that merely starts with the same quote", () => {
    const note = "<h1>Kern</h1>\n<p>Zitat</p>\n<p>Eigene Anmerkung</p>";
    assert.equal(
      isQuoteNote(note, { coreStatement: "Kern", text: "Zitat" }),
      false,
    );
    assert.equal(isQuoteNote(note, { coreStatement: "", text: "" }), false);
  });
});

describe("buildAnnotationData", () => {
  it("uses the quote as text and the core statement as comment", () => {
    const data = buildAnnotationData(
      { coreStatement: " Kern ", text: " Zitat ", quotationType: "1" },
      locatorFor,
    );
    assert.equal(data.type, "highlight");
    assert.equal(data.color, "#2ea8e5");
    assert.equal(data.text, "Zitat");
    assert.equal(data.comment, "Kern");
  });

  it("falls back to the core statement when the quote is empty", () => {
    const data = buildAnnotationData(
      { coreStatement: "Kern", text: "" },
      locatorFor,
    );
    assert.equal(data.text, "Kern");
    assert.equal(data.comment, "");
  });

  it("swaps the fields for an indirect quote (type 2)", () => {
    const data = buildAnnotationData(
      { coreStatement: "Kern", text: "Original", quotationType: "2" },
      locatorFor,
    );
    assert.equal(data.text, "Kern");
    assert.equal(data.comment, "Original");
    assert.equal(data.color, "#a6507b");
  });

  it("drops the comment for highlights (type 5) and uses type 1 for unknown values", () => {
    const yellow = buildAnnotationData(
      { coreStatement: "Kern", text: "Zitat", quotationType: "5" },
      locatorFor,
    );
    assert.equal(yellow.comment, "");
    assert.equal(yellow.color, "#ffd400");

    const unknown = buildAnnotationData(
      { coreStatement: "Kern", text: "Zitat", quotationType: "9" },
      locatorFor,
    );
    assert.equal(unknown.color, "#2ea8e5");
    assert.equal(unknown.comment, "Kern");
  });

  it("returns empty fields and no tags for an empty item", () => {
    const data = buildAnnotationData({}, locatorFor);
    assert.deepEqual(data, {
      type: "highlight",
      color: "#2ea8e5",
      text: "",
      comment: "",
      pageLabel: "",
      locator: "page",
      tags: [],
    });
  });
});

describe("resolveKeywords", () => {
  const names: Record<string, string> = { KW1: "Recht", KW2: "Verfassung" };
  const nameOf = (id: string) => names[id];

  it("returns the names of the keyword IDs, skipping the item ID", () => {
    assert.deepEqual(resolveKeywords("KI1:0;KW1:0;KW2:0", nameOf), [
      "Recht",
      "Verfassung",
    ]);
  });

  it("drops unknown keyword IDs and handles empty input", () => {
    assert.deepEqual(resolveKeywords("KI1;KW9", nameOf), []);
    assert.deepEqual(resolveKeywords(null, nameOf), []);
  });
});

describe("splitOnetoN and resolveKeywords prefix collisions", () => {
  it("returns the owner ID and the keyword IDs after it", () => {
    assert.deepEqual(splitOnetoN("K1:x;KW1:x;KW2:x"), {
      ownerId: "K1",
      keywordIds: ["KW1", "KW2"],
    });
  });

  it("keeps K1 and K10 apart: the owner ID is compared as a whole", () => {
    const k10 = "K10:x;KW3:x";
    assert.equal(splitOnetoN(k10).ownerId, "K10");
    assert.notEqual(splitOnetoN(k10).ownerId, "K1");
    assert.deepEqual(splitOnetoN(k10).keywordIds, ["KW3"]);
  });

  it("handles empty input without keyword IDs", () => {
    assert.deepEqual(splitOnetoN(""), { ownerId: "", keywordIds: [] });
    assert.deepEqual(splitOnetoN(null), { ownerId: "", keywordIds: [] });
    assert.deepEqual(
      resolveKeywords("", () => "x"),
      [],
    );
  });

  it("resolves only the keywords of the given group", () => {
    const names: Record<string, string> = { KW1: "Eins", KW3: "Drei" };
    assert.deepEqual(
      resolveKeywords("K1:x;KW1:x", (id) => names[id]),
      ["Eins"],
    );
  });
});

describe("xpathLiteral", () => {
  it("quotes plain values with apostrophes", () => {
    assert.equal(xpathLiteral("KW1"), "'KW1'");
  });

  it("switches quote style when the value contains an apostrophe", () => {
    assert.equal(xpathLiteral("a'b"), `"a'b"`);
  });

  it("builds a concat() when the value contains both quote characters", () => {
    assert.equal(xpathLiteral(`a'b"c`), `concat('a', "'", 'b"c')`);
  });
});

describe("isDuplicateAnnotation", () => {
  const base = { pageLabel: "12", text: "Zitat", comment: "Kern" };

  it("treats the same page and text as a duplicate", () => {
    assert.equal(isDuplicateAnnotation([base], { ...base }), true);
  });

  it("does not match the same page with another text", () => {
    assert.equal(
      isDuplicateAnnotation([base], { ...base, text: "Anderes" }),
      false,
    );
  });

  it("does not match the same text on another page", () => {
    assert.equal(
      isDuplicateAnnotation([base], { ...base, pageLabel: "13" }),
      false,
    );
  });

  it("treats a null page label (Zotero's empty value) like an empty one", () => {
    assert.equal(
      isDuplicateAnnotation([{ ...base, pageLabel: null }], {
        ...base,
        pageLabel: "",
      }),
      true,
    );
  });

  it("normalizes whitespace and markup in the text", () => {
    const existing = { ...base, text: "Das  <i>Zitat</i>\n" };
    assert.equal(
      isDuplicateAnnotation([existing], { ...base, text: "Das Zitat" }),
      true,
    );
  });

  it("compares page and comment when the text is empty", () => {
    const note = { pageLabel: "7", text: "", comment: "Kern" };
    assert.equal(isDuplicateAnnotation([note], { ...note }), true);
    assert.equal(
      isDuplicateAnnotation([note], { ...note, comment: "Anders" }),
      false,
    );
    assert.equal(
      isDuplicateAnnotation([base], {
        pageLabel: "12",
        text: "",
        comment: "Kern",
      }),
      false,
    );
  });

  it("ignores a changed comment when the text is present", () => {
    assert.equal(
      isDuplicateAnnotation([base], {
        ...base,
        comment: "vom Nutzer geändert",
      }),
      true,
    );
  });

  it("finds nothing in an empty list", () => {
    assert.equal(isDuplicateAnnotation([], base), false);
  });
});
