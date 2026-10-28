import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLocatorEntries,
  buildSaveData,
  defaultCheckboxState,
  editView,
  initialFocus,
  isTypeHidden,
  nextFocusIndex,
  viewLayout,
  wantsDefault,
} from "../src/core/printDialog.ts";

const input = {
  locator: "chapter",
  page: "  12 ",
  type: "highlight" as const,
  color: "#ff0000",
  text: "  Zitat  ",
  comment: " Kommentar ",
};

describe("buildSaveData", () => {
  it("trims page, text and comment and keeps all fields in the full view", () => {
    assert.deepEqual(
      buildSaveData(input, { view: "full", multi: false, requirePage: true }),
      {
        locator: "chapter",
        pageLabel: "12",
        type: "highlight",
        color: "#ff0000",
        text: "Zitat",
        comment: "Kommentar",
      },
    );
  });

  it("rejects an empty page when a print source requires one", () => {
    const blank = { ...input, page: "   " };
    assert.equal(
      buildSaveData(blank, { view: "full", multi: false, requirePage: true }),
      null,
    );
    assert.deepEqual(
      buildSaveData(blank, { view: "full", multi: false, requirePage: false }),
      {
        locator: "chapter",
        pageLabel: "",
        type: "highlight",
        color: "#ff0000",
        text: "Zitat",
        comment: "Kommentar",
      },
    );
  });

  it("omits the page for several annotations and everything but locator and comment in the comment view", () => {
    const multi = buildSaveData(input, {
      view: "locator",
      multi: true,
      requirePage: true,
    });
    assert.deepEqual(multi, { locator: "chapter" });

    const comment = buildSaveData(input, {
      view: "comment",
      multi: false,
      requirePage: true,
    });
    assert.deepEqual(comment, { comment: "Kommentar" });
  });
});

describe("editView", () => {
  it("forces the locator view for several annotations, else the requested view", () => {
    assert.equal(editView(2, "full"), "locator");
    assert.equal(editView(1, "comment"), "comment");
    assert.equal(editView(1), "full");
  });
});

describe("defaultCheckboxState and wantsDefault", () => {
  it("checks and locks the box when the chosen locator is already the document default", () => {
    assert.deepEqual(defaultCheckboxState("chapter", "chapter"), {
      checked: true,
      disabled: true,
    });
  });

  it("never treats 'page' as a document default", () => {
    assert.deepEqual(defaultCheckboxState("page", "page"), {
      checked: false,
      disabled: false,
    });
  });

  it("sets the default only for an enabled, checked box outside the comment view", () => {
    assert.equal(wantsDefault("full", true, false), true);
    assert.equal(wantsDefault("comment", true, false), false);
    assert.equal(wantsDefault("full", true, true), false);
  });
});

describe("viewLayout and isTypeHidden", () => {
  it("determines layout dimensions and field visibility for each view", () => {
    assert.deepEqual(viewLayout("comment"), {
      width: 380,
      minWidth: 340,
      maxWidth: 420,
      locator: false,
      typeColor: false,
      text: false,
      comment: true,
    });
    assert.deepEqual(viewLayout("locator"), {
      width: 320,
      minWidth: 280,
      maxWidth: 360,
      locator: true,
      typeColor: false,
      text: false,
      comment: false,
    });
    assert.deepEqual(viewLayout("full"), {
      width: 440,
      minWidth: 380,
      maxWidth: 480,
      locator: true,
      typeColor: true,
      text: true,
      comment: true,
    });
  });

  it("offers only creatable types plus the current one", () => {
    assert.equal(isTypeHidden("text", "highlight"), true);
    assert.equal(isTypeHidden("text", "text"), false);
    assert.equal(isTypeHidden("note", "highlight"), false);
  });
});

describe("buildLocatorEntries", () => {
  it("sorts by label and falls back to the value when no label exists", () => {
    const labels: Record<string, string | undefined> = {
      page: "Seite",
      chapter: "Kapitel",
      line: undefined,
    };
    assert.deepEqual(
      buildLocatorEntries(["page", "line", "chapter"], (l) => labels[l]),
      [
        { value: "chapter", label: "Kapitel" },
        { value: "line", label: "line" },
        { value: "page", label: "Seite" },
      ],
    );
  });
});

describe("nextFocusIndex", () => {
  it("wraps forward and backward and starts at the first element without focus", () => {
    assert.equal(nextFocusIndex(3, 2, false), 0);
    assert.equal(nextFocusIndex(3, 0, true), 2);
    assert.equal(nextFocusIndex(3, -1, false), 0);
  });
});

describe("initialFocus", () => {
  it("focuses comment in comment view and locator in locator view", () => {
    assert.equal(initialFocus("comment", true), "comment");
    assert.equal(initialFocus("locator", true), "locator");
  });

  it("in full view focuses page for print sources and comment otherwise", () => {
    assert.equal(initialFocus("full", true), "page");
    assert.equal(initialFocus("full", false), "comment");
  });
});
