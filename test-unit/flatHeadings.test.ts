import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  flatHeadings,
  pathsFromRoots,
  type FlatHeading,
} from "../src/features/organizer/logic/flatHeadings.ts";
import {
  makeNode,
  type OutlineNode,
} from "../src/features/organizer/logic/outline.ts";

function tree(): OutlineNode[] {
  const a = makeNode("Einleitung");
  const b = makeNode("Hauptteil");
  const b1 = makeNode("Begriff");
  const b2 = makeNode("Streitstand");
  const b21 = makeNode("Ansichten");
  b2.children.push(b21);
  b.children.push(b1, b2);
  return [a, b];
}

function byId(flat: FlatHeading[], id: string): FlatHeading {
  const f = flat.find((x) => x.id === id);
  assert.ok(f, `no heading with id ${id}`);
  return f!;
}

describe("flatHeadings", () => {
  it("flattens depth-first with id, title, num, depth, tag", () => {
    const r = tree();
    const flat = flatHeadings(r);
    assert.equal(flat.length, 5);
    // Order is outline order (depth-first)
    assert.deepEqual(
      flat.map((f) => f.title),
      ["Einleitung", "Hauptteil", "Begriff", "Streitstand", "Ansichten"],
    );
    assert.equal(byId(flat, r[0].id).num, "1");
    assert.equal(byId(flat, r[1].id).num, "2");
    assert.equal(byId(flat, r[1].children[0].id).num, "2.1");
    assert.equal(byId(flat, r[1].children[1].id).num, "2.2");
    assert.equal(byId(flat, r[1].children[1].children[0].id).num, "2.2.1");
  });

  it("derives depth and backing tag", () => {
    const r = tree();
    const flat = flatHeadings(r);
    const b21 = byId(flat, r[1].children[1].children[0].id);
    assert.equal(b21.depth, 2);
    assert.equal(b21.tag, "§Ansichten");
    assert.equal(byId(flat, r[0].id).tag, "§Einleitung");
  });

  it("builds breadcrumb path", () => {
    const r = tree();
    const flat = flatHeadings(r);
    assert.equal(byId(flat, r[0].id).path, "Einleitung");
    assert.equal(byId(flat, r[1].children[0].id).path, "Hauptteil > Begriff");
    assert.equal(
      byId(flat, r[1].children[1].children[0].id).path,
      "Hauptteil > Streitstand > Ansichten",
    );
  });

  it("returns empty for an empty outline", () => {
    assert.deepEqual(flatHeadings([]), []);
  });
});

describe("pathsFromRoots", () => {
  it("maps every id to its breadcrumb path", () => {
    const r = tree();
    const paths = pathsFromRoots(r);
    assert.equal(paths.get(r[0].id), "Einleitung");
    assert.equal(paths.get(r[1].children[1].id), "Hauptteil > Streitstand");
    assert.equal(
      paths.get(r[1].children[1].children[0].id),
      "Hauptteil > Streitstand > Ansichten",
    );
  });
});
