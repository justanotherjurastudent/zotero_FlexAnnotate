import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeNode } from "../src/core/outline.ts";
import {
  buildDialogSections,
  effectiveTags,
  nodeCounts,
} from "../src/core/dialogView.ts";

const a = makeNode("Einleitung");
const b = makeNode("Hauptteil");
const b1 = makeNode("Begriff");
b.children.push(b1);
const roots = [a, b];

const anns = [
  { id: 1, workID: 100, tags: ["§Einleitung"] },
  { id: 2, workID: 100, tags: [] },
  { id: 3, workID: 200, tags: ["§Begriff", "x"] },
  { id: 4, workID: 300, tags: [] },
];
const workTags = new Map<number, string[]>([[100, ["§Hauptteil"]]]);

describe("dialog view", () => {
  it("uses only the annotations' own headings by default", () => {
    const s = buildDialogSections(roots, anns, workTags, false);
    assert.deepEqual(
      s.map((x) => [x.number, x.items.map((i) => i.id)]),
      [
        ["1", [1]],
        ["2.1", [3]],
      ],
    );
  });

  it("brings the annotations of a filed work along when works are shown", () => {
    const s = buildDialogSections(roots, anns, workTags, true);
    assert.deepEqual(
      s.map((x) => [x.number, x.items.map((i) => i.id)]),
      [
        ["1", [1]],
        ["2", [1, 2]],
        ["2.1", [3]],
      ],
    );
  });

  it("never lists unassigned annotations", () => {
    const s = buildDialogSections(roots, anns, workTags, true);
    assert.equal(
      s.flatMap((x) => x.items).some((i) => i.id === 4),
      false,
    );
  });

  it("merges own and work tags without duplicates", () => {
    assert.deepEqual(
      effectiveTags(
        { id: 1, workID: 100, tags: ["§Hauptteil"] },
        workTags,
        true,
      ),
      ["§Hauptteil"],
    );
  });
});

describe("heading counts", () => {
  it("counts distinct annotations including subheadings", () => {
    const sections = buildDialogSections(roots, anns, workTags, true);
    const c = nodeCounts(roots, sections);
    assert.equal(c.get(a.id), 1);
    assert.equal(c.get(b1.id), 1);
    // Hauptteil: annotations 1 and 2 (via work) plus 3 from the subheading
    assert.equal(c.get(b.id), 3);
  });
});
