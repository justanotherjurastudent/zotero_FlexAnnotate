/**
 * dialogView — what the Word-launched citation dialog shows when the list is
 * arranged "like in the plugin": annotations grouped by outline heading.
 * Pure logic (no Zotero, no DOM) so it is unit-testable in Node.
 */

import { groupByOutline, headingTagsOf, tagIndex } from "./outline.ts";
import type { OutlineNode, Section } from "./outline.ts";

export interface AnnLike {
  id: number;
  tags: string[];
  /** The work (top-level item) the annotation belongs to. */
  workID: number;
}

/**
 * Heading tags that count for an annotation: its own, and — when the plugin
 * setting "show the works behind the annotations" is on — those of its work
 * (a work filed on the Titel tab brings all its annotations along).
 */
export function effectiveTags(
  ann: AnnLike,
  workTags: Map<number, string[]>,
  includeWorks: boolean,
): string[] {
  const own = headingTagsOf(ann.tags);
  if (!includeWorks) return own;
  const merged = new Set([
    ...own,
    ...headingTagsOf(workTags.get(ann.workID) ?? []),
  ]);
  return [...merged];
}

/**
 * Sections in outline order, each with the annotations that belong there.
 * Annotations without any known heading are left out: they are not part of
 * the outline. Empty headings are skipped.
 */
export function buildDialogSections(
  roots: OutlineNode[],
  anns: AnnLike[],
  workTags: Map<number, string[]>,
  includeWorks: boolean,
): Section<AnnLike>[] {
  const known = tagIndex(roots);
  const view = anns
    .map((a) => ({ ...a, tags: effectiveTags(a, workTags, includeWorks) }))
    .filter((a) => a.tags.some((t) => known.has(t)));
  return groupByOutline(roots, view).filter((s) => s.node !== null);
}
