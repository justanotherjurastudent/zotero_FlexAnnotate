/**
 * flatHeadings — pure outline flattening into externally-consumable headings.
 * No Zotero imports; unit-testable in Node.
 *
 * This is the canonical place that turns the outline tree into the flat list
 * (with decimal number, path and depth) that external consumers — other Zotero
 * plugins or an AI sidecar — read. It reuses outline.ts `numbering`/`flatten`,
 * so the numbers always match what the organizer displays.
 */

import { flatten, headingTag, numbering, type OutlineNode } from "./outline.ts";

/** A single heading in outline order, ready for external consumption. */
export interface FlatHeading {
  /** Storage id of the node in the outline tree. */
  id: string;
  /** Heading title (without the `§` tag prefix). */
  title: string;
  /** Decimal outline number, e.g. "1.2.3" (derived, never stored). */
  num: string;
  /** Breadcrumb path, e.g. "Hauptteil > Analyse", in outline order. */
  path: string;
  /** Depth in the tree, 0 for a top-level heading. */
  depth: number;
  /** The Zotero tag an item is filed under, `§` + title. */
  tag: string;
}

/**
 * Flatten an outline tree depth-first into externally-consumable headings.
 * Each heading carries its derived decimal number, breadcrumb path, depth and
 * the backing Zotero tag.
 */
export function flatHeadings(roots: OutlineNode[]): FlatHeading[] {
  const out: FlatHeading[] = [];
  const nums = numbering(roots);
  const paths = pathsFromRoots(roots);
  for (const { node, depth } of flatten(roots)) {
    out.push({
      id: node.id,
      title: node.title,
      num: nums.get(node.id) ?? "",
      path: paths.get(node.id) ?? node.title,
      depth,
      tag: headingTag(node.title),
    });
  }
  return out;
}

/**
 * Resolve the breadcrumb path of every node against the given roots. Because
 * OutlineNode has no parent pointer, we build a path map in one pass.
 */
export function pathsFromRoots(roots: OutlineNode[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (nodes: OutlineNode[], prefix: string) => {
    for (const n of nodes) {
      const path = prefix ? `${prefix} > ${n.title}` : n.title;
      out.set(n.id, path);
      walk(n.children, path);
    }
  };
  walk(roots, "");
  return out;
}
