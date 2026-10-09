import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  groupByOutline,
  pickNewest,
  headingTag,
  indent,
  itemsUnder,
  makeNode,
  moveDown,
  moveUp,
  numbering,
  outdent,
  parseOutline,
  removeNode,
  serializeOutline,
  tagIndex,
  titleError,
  unassignedItems,
  type OutlineNode,
} from "../src/core/outline.ts";

function tree(): OutlineNode[] {
  const a = makeNode("Einleitung");
  const b = makeNode("Hauptteil");
  const b1 = makeNode("Begriff");
  const b2 = makeNode("Streitstand");
  b.children.push(b1, b2);
  return [a, b];
}

describe("numbering", () => {
  it("computes decimal numbers in outline order", () => {
    const r = tree();
    const n = numbering(r);
    assert.equal(n.get(r[0].id), "1");
    assert.equal(n.get(r[1].id), "2");
    assert.equal(n.get(r[1].children[0].id), "2.1");
    assert.equal(n.get(r[1].children[1].id), "2.2");
  });

  it("follows moves and indents without storing numbers", () => {
    const r = tree();
    moveUp(r, r[1].id);
    assert.equal(numbering(r).get(r[0].id), "1");
    assert.equal(r[0].title, "Hauptteil");
    indent(r, r[1].id); // Einleitung under Hauptteil
    assert.equal(numbering(r).get(r[0].children[2].id), "1.3");
  });
});

describe("tree operations", () => {
  it("moves down, outdents and removes", () => {
    const r = tree();
    const b1 = r[1].children[0];
    assert.equal(moveDown(r, b1.id), true);
    assert.equal(r[1].children[1].id, b1.id);
    assert.equal(outdent(r, b1.id), true);
    assert.equal(r[2].id, b1.id);
    assert.equal(removeNode(r, b1.id)?.id, b1.id);
    assert.equal(r.length, 2);
  });

  it("refuses impossible moves", () => {
    const r = tree();
    assert.equal(moveUp(r, r[0].id), false);
    assert.equal(indent(r, r[0].id), false);
    assert.equal(outdent(r, r[0].id), false);
  });
});

describe("titles", () => {
  it("rejects empty and duplicate titles (a heading is a tag)", () => {
    const r = tree();
    assert.notEqual(titleError(r, "  "), "");
    assert.notEqual(titleError(r, "einleitung"), "");
    assert.equal(titleError(r, "Neu"), "");
    assert.equal(titleError(r, "Einleitung", r[0].id), "");
  });

  it("builds the Lattice-compatible tag", () => {
    assert.equal(headingTag(" Begriff "), "§Begriff");
  });
});

describe("serialization", () => {
  it("round-trips and keeps the Lattice sentinel", () => {
    const r = tree();
    const html = serializeOutline(r);
    assert.match(html, /LATTICE-OUTLINE-V1/);
    assert.deepEqual(parseOutline(html), r);
  });

  it("returns an empty tree for foreign or broken notes", () => {
    assert.deepEqual(parseOutline("<p>hello</p>"), []);
    assert.deepEqual(
      parseOutline("<pre><code>LATTICE-OUTLINE-V1\n{broken</code></pre>"),
      [],
    );
  });
});

interface Item {
  id: number;
  tags: string[];
}

describe("grouping like the plugin", () => {
  const r = tree();
  const items: Item[] = [
    { id: 1, tags: ["§Einleitung"] },
    { id: 2, tags: ["§Streitstand", "§Einleitung"] },
    { id: 3, tags: ["foo"] },
    { id: 4, tags: ["§Unbekannt"] },
  ];

  it("orders sections by outline, duplicates multi-filed items", () => {
    const s = groupByOutline(r, items);
    assert.deepEqual(
      s.map((x) => [x.number, x.items.map((i) => i.id)]),
      [
        ["1", [1, 2]],
        ["2.2", [2]],
        ["", [3, 4]],
      ],
    );
    assert.equal(s[2].node, null);
  });

  it("can keep empty headings", () => {
    assert.equal(groupByOutline(r, items, true).length, 5);
  });

  it("selects items under a node with or without subheadings", () => {
    const hauptteil = r[1];
    assert.deepEqual(
      itemsUnder(hauptteil, items).map((i) => i.id),
      [2],
    );
    assert.deepEqual(itemsUnder(hauptteil, items, false), []);
  });

  it("treats tags of deleted headings as unassigned", () => {
    assert.deepEqual(
      unassignedItems(r, items).map((i) => i.id),
      [3, 4],
    );
    assert.equal(tagIndex(r).size, 4);
  });
});

describe("Zotero note normalisation", () => {
  it("reads the outline after Zotero rewrote <pre><code> to <pre>", () => {
    const r = tree();
    const original = serializeOutline(r);
    const normalized =
      original
        .replace("<pre><code>", "<pre>")
        .replace("</code></pre>", "</pre>")
        .replace(/^/, '<div data-schema-version="9">') + "</div>";
    assert.deepEqual(parseOutline(normalized), r);
  });
});

describe("pickNewest (outline note choice)", () => {
  it("returns null for an empty list", () => {
    assert.equal(pickNewest([]), null);
  });
  it("prefers the later dateModified", () => {
    const old = { id: 9, dateModified: "2026-01-01 10:00:00" };
    const newer = { id: 2, dateModified: "2026-01-01 10:00:05" };
    assert.equal(pickNewest([newer, old]), newer);
    assert.equal(pickNewest([old, newer]), newer);
  });
  it("breaks a same-second tie by the higher id, regardless of order", () => {
    const a = { id: 10, dateModified: "2026-01-01 10:00:00" };
    const b = { id: 42, dateModified: "2026-01-01 10:00:00" };
    assert.equal(pickNewest([a, b]), b);
    assert.equal(pickNewest([b, a]), b);
  });
  it("treats a missing dateModified as oldest", () => {
    const none = { id: 99 } as { id: number; dateModified?: string };
    const dated = { id: 1, dateModified: "2026-01-01 10:00:00" };
    assert.equal(pickNewest([none, dated]), dated);
  });
});
