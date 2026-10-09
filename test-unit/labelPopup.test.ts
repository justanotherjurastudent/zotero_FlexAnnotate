import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLocatorOptions,
  defaultCheckboxState,
  isKnownLocator,
  planApply,
  preferredRadio,
  type Ref,
  selectTargets,
  shouldSetPageLabel,
} from "../src/core/labelPopup.ts";

const ref = (
  key: string,
  pageIndex: number | null | undefined,
): Ref<string> => ({ key, pageIndex, item: key });

describe("buildLocatorOptions", () => {
  it("sorts by label and falls back to the value without a name", () => {
    const names: Record<string, string> = {
      section: "Abschnitt",
      page: "Seite",
      paragraph: "Absatz",
    };
    assert.deepEqual(
      buildLocatorOptions(
        ["page", "section", "paragraph", "opus"],
        (v) => names[v],
      ),
      [
        { value: "paragraph", label: "Absatz" },
        { value: "section", label: "Abschnitt" },
        { value: "opus", label: "opus" },
        { value: "page", label: "Seite" },
      ],
    );
  });
});

describe("defaultCheckboxState", () => {
  it("locks and checks the box when the selection is already the document default", () => {
    assert.deepEqual(defaultCheckboxState("section", "section"), {
      checked: true,
      disabled: true,
      alreadyDefault: true,
    });
  });

  it("keeps 'page' as default unlocked, the page locator is the baseline", () => {
    assert.deepEqual(defaultCheckboxState("page", "page"), {
      checked: false,
      disabled: false,
      alreadyDefault: false,
    });
  });
});

describe("planApply", () => {
  it("does nothing when neither locator nor default changed", () => {
    assert.deepEqual(planApply("section", "section", false, "page"), {
      apply: false,
      setDefault: false,
    });
  });

  it("sets the default only when the box is ticked and the value differs from it", () => {
    assert.deepEqual(planApply("section", "section", true, "page"), {
      apply: true,
      setDefault: true,
    });
    assert.deepEqual(planApply("section", "page", true, "section"), {
      apply: true,
      setDefault: false,
    });
  });

  it("rejects an unknown locator value", () => {
    assert.equal(planApply("bogus", null, true, "page").apply, false);
    assert.equal(isKnownLocator("bogus"), false);
    assert.equal(isKnownLocator("section"), true);
  });
});

describe("radio selection", () => {
  it("prefers 'single' over 'selected' and returns null without either", () => {
    assert.equal(preferredRadio(["from", "single", "selected"]), "single");
    assert.equal(preferredRadio(["page", "selected"]), "selected");
    assert.equal(preferredRadio(["page", "from"]), null);
  });

  it("'from' and 'all' with locator 'page' cover the document, otherwise only the current annotation", () => {
    const current = ref("c", 2);
    const all = [ref("a", 1), ref("b", 2), ref("c", 2), ref("d", 5)];
    assert.deepEqual(selectTargets("from", "page", current, all, [], 2), [
      "b",
      "c",
      "d",
    ]);
    assert.deepEqual(selectTargets("from", "section", current, all, [], 2), [
      "c",
    ]);
    assert.deepEqual(selectTargets("all", "page", current, all, [], 2), [
      "a",
      "b",
      "c",
      "d",
    ]);
    assert.deepEqual(selectTargets("all", "margin", current, all, [], 2), [
      "c",
    ]);
  });

  it("'selected' falls back to the current annotation when nothing else is selected", () => {
    const current = ref("c", 2);
    const all = [ref("a", 1), ref("b", 2), ref("c", 2)];
    assert.deepEqual(
      selectTargets("selected", "page", current, all, ["a", "b"], 2),
      ["a", "b"],
    );
    assert.deepEqual(selectTargets("selected", "page", current, all, [], 2), [
      "c",
    ]);
  });

  it("'page' ignores unreadable positions and matches only the chosen page", () => {
    const all = [ref("a", 2), ref("b", null), ref("c", 3)];
    assert.deepEqual(selectTargets("page", "page", null, all, [], 2), ["a"]);
  });
});

describe("shouldSetPageLabel", () => {
  it("applies a new page label only to a single target or the 'single' mode", () => {
    assert.equal(shouldSetPageLabel("12", 1, "from"), true);
    assert.equal(shouldSetPageLabel("12", 3, "single"), true);
    assert.equal(shouldSetPageLabel("12", 3, "all"), false);
    assert.equal(shouldSetPageLabel("", 1, "single"), false);
    assert.equal(shouldSetPageLabel(undefined, 1, "single"), false);
  });
});
