import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLocatorEntries,
  buildSaveData,
  defaultCheckboxState,
  editView,
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
      buildSaveData(blank, { view: "full", multi: false, requirePage: false })
        ?.pageLabel,
      "",
    );
  });

  it("omits the page for several annotations and everything but locator and comment in the comment view", () => {
    const multi = buildSaveData(input, {
      view: "locator",
      multi: true,
      requirePage: true,
    });
    assert.equal(multi && "pageLabel" in multi, false);

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
  it("shows only the comment in the comment view", () => {
    const layout = viewLayout("comment");
    assert.equal(layout.width, 380);
    assert.equal(layout.locator, false);
    assert.equal(layout.text, false);
    assert.equal(layout.typeColor, false);
    assert.equal(layout.comment, true);
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
