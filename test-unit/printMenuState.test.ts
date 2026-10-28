import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { printMenuState } from "../src/features/print/logic/printMenuState.ts";

describe("printMenuState", () => {
  it("hides everything without a selection", () => {
    assert.deepEqual(
      printMenuState({
        selectedCount: 0,
        kinds: [],
        isEditable: false,
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
    assert.deepEqual(
      printMenuState({
        selectedCount: 1,
        kinds: ["regular"],
        isEditable: true,
      }),
      {
        add: true,
        edit: false,
        editDisabled: false,
        delete: false,
        separator: true,
      },
    );
  });

  it("offers Add for the attachment of a title, as for the title itself", () => {
    assert.deepEqual(
      printMenuState({
        selectedCount: 1,
        kinds: ["attachment"],
        isEditable: true,
      }),
      {
        add: true,
        edit: false,
        editDisabled: false,
        delete: false,
        separator: true,
      },
    );
  });

  it("offers nothing for several regular items", () => {
    assert.deepEqual(
      printMenuState({
        selectedCount: 2,
        kinds: ["regular", "regular"],
        isEditable: true,
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

  it("offers Edit and Delete for a native annotation", () => {
    assert.deepEqual(
      printMenuState({
        selectedCount: 1,
        kinds: ["annotation"],
        isEditable: true,
      }),
      {
        add: false,
        edit: true,
        editDisabled: false,
        delete: true,
        separator: true,
      },
    );
  });

  it("disables Edit for a non-editable annotation", () => {
    assert.deepEqual(
      printMenuState({
        selectedCount: 1,
        kinds: ["annotation"],
        isEditable: false,
      }),
      {
        add: false,
        edit: true,
        editDisabled: true,
        delete: false,
        separator: true,
      },
    );
  });

  it("offers Edit and Delete for a print annotation", () => {
    assert.deepEqual(
      printMenuState({
        selectedCount: 1,
        kinds: ["annotation"],
        isEditable: true,
      }),
      {
        add: false,
        edit: true,
        editDisabled: false,
        delete: true,
        separator: true,
      },
    );
  });

  it("offers nothing for several annotations or a mixed selection", () => {
    assert.deepEqual(
      printMenuState({
        selectedCount: 2,
        kinds: ["annotation", "annotation"],
        isEditable: true,
      }),
      {
        add: false,
        edit: false,
        editDisabled: false,
        delete: false,
        separator: false,
      },
    );

    assert.deepEqual(
      printMenuState({
        selectedCount: 2,
        kinds: ["regular", "annotation"],
        isEditable: true,
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

  it("offers nothing for a single non-annotation, non-regular item", () => {
    assert.deepEqual(
      printMenuState({
        selectedCount: 1,
        kinds: ["other"],
        isEditable: true,
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
});
