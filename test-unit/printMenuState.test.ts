import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { printMenuState } from "../src/core/printMenuState.ts";

describe("printMenuState", () => {
  it("hides everything without a selection", () => {
    assert.deepEqual(
      printMenuState({
        selectedCount: 0,
        kinds: [],
        isEditable: false,
        isPrintAnnotation: false,
      }),
      {
        add: false,
        edit: false,
        editDisabled: false,
        delete: false,
        separator: false,
      },
    );
  });

  it("offers only Add for one regular item", () => {
    const s = printMenuState({
      selectedCount: 1,
      kinds: ["regular"],
      isEditable: true,
      isPrintAnnotation: false,
    });
    assert.equal(s.add, true);
    assert.equal(s.edit, false);
    assert.equal(s.delete, false);
    assert.equal(s.separator, true);
  });

  it("offers nothing for several regular items", () => {
    const s = printMenuState({
      selectedCount: 2,
      kinds: ["regular", "regular"],
      isEditable: true,
      isPrintAnnotation: false,
    });
    assert.equal(s.add, false);
    assert.equal(s.separator, false);
  });

  it("offers Edit but not Delete for a native annotation", () => {
    const s = printMenuState({
      selectedCount: 1,
      kinds: ["annotation"],
      isEditable: true,
      isPrintAnnotation: false,
    });
    assert.equal(s.edit, true);
    assert.equal(s.editDisabled, false);
    assert.equal(s.delete, false);
  });

  it("disables Edit for a non-editable annotation", () => {
    const s = printMenuState({
      selectedCount: 1,
      kinds: ["annotation"],
      isEditable: false,
      isPrintAnnotation: false,
    });
    assert.equal(s.edit, true);
    assert.equal(s.editDisabled, true);
  });

  it("offers Edit and Delete for a print annotation", () => {
    const s = printMenuState({
      selectedCount: 1,
      kinds: ["annotation"],
      isEditable: true,
      isPrintAnnotation: true,
    });
    assert.equal(s.edit, true);
    assert.equal(s.delete, true);
    assert.equal(s.add, false);
  });

  it("offers nothing for several annotations or a mixed selection", () => {
    const several = printMenuState({
      selectedCount: 2,
      kinds: ["annotation", "annotation"],
      isEditable: true,
      isPrintAnnotation: true,
    });
    assert.equal(several.edit, false);
    assert.equal(several.delete, false);

    const mixed = printMenuState({
      selectedCount: 2,
      kinds: ["regular", "annotation"],
      isEditable: true,
      isPrintAnnotation: true,
    });
    assert.equal(mixed.add, false);
    assert.equal(mixed.edit, false);
  });

  it("offers nothing for a single non-annotation, non-regular item", () => {
    const s = printMenuState({
      selectedCount: 1,
      kinds: ["other"],
      isEditable: true,
      isPrintAnnotation: false,
    });
    assert.equal(s.separator, false);
  });
});
