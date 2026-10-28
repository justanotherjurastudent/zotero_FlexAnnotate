import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mergeCitationItems,
  nextLastCommand,
  type CommandRef,
} from "../src/features/organizer/logic/lastCommand.ts";

const cite: CommandRef = {
  agent: "WinWord",
  command: "addEditCitation",
  docId: "a",
  templateVersion: 1,
};

describe("last command for the browse window", () => {
  it("remembers dialog commands", () => {
    assert.deepEqual(
      nextLastCommand(null, true, "WinWord", "addAnnotation", "a", 1),
      { ...cite, command: "addAnnotation" },
    );
  });

  it("keeps the dialog command across refresh and bibliography", () => {
    for (const c of ["refresh", "addEditBibliography"]) {
      assert.deepEqual(nextLastCommand(cite, true, "WinWord", c, "b", 2), {
        ...cite,
        docId: "b",
        templateVersion: 2,
      });
    }
  });

  it("has nothing to repeat without a prior dialog command or on another agent", () => {
    assert.equal(
      nextLastCommand(null, true, "WinWord", "refresh", "a", 1),
      null,
    );
    assert.equal(
      nextLastCommand(cite, true, "LibreOffice", "refresh", "a", 1),
      null,
    );
  });

  it("adds the browse selection to an existing citation instead of replacing it", () => {
    assert.deepEqual(
      mergeCitationItems([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]),
      [{ id: 1 }, { id: 2 }, { id: 3 }],
    );
    assert.deepEqual(mergeCitationItems(undefined, [{ id: 3 }]), [{ id: 3 }]);
    assert.deepEqual(mergeCitationItems([], []), []);
    // Items without id (e.g. raw text items) are preserved without filtering
    assert.deepEqual(
      mergeCitationItems([{ id: 1 }], [{ id: undefined, text: "foo" }]),
      [{ id: 1 }, { id: undefined, text: "foo" }],
    );
  });

  it("forgets everything for agents without a browse window", () => {
    assert.equal(
      nextLastCommand(cite, false, "http", "addEditCitation", "a", 1),
      null,
    );
  });
});
