/**
 * tagSuggest — pure ordering of the `§` tag suggestions in the tag field. No
 * Zotero imports, node-testable.
 *
 * Zotero sorts the tag suggestions alphabetically. For `§` input this
 * logic orders them in tree order: first the headings of the outline
 * of the top-level collection, then (depending on the setting) all remaining `§` tags of the
 * library. If the top-level collection has no own outline, the
 * library list remains, ordered by the library outline.
 */

import type { FlatHeading } from "./flatHeadings.ts";
import { HEADING_PREFIX } from "./outline.ts";

/**
 * off = Zotero's default list; tree = only the outline of the top-level collection;
 * typed = library part only after typing further after the `§`;
 * all = library part always.
 */
export type TagSuggestMode = "off" | "tree" | "typed" | "all";

export const TAG_SUGGEST_MODES: TagSuggestMode[] = [
  "all",
  "typed",
  "tree",
  "off",
];

export const DEFAULT_TAG_SUGGEST_MODE: TagSuggestMode = "all";

/** Unknown values (manual edit in about:config) count as default. */
export function normalizeTagSuggestMode(v: unknown): TagSuggestMode {
  return TAG_SUGGEST_MODES.includes(v as TagSuggestMode)
    ? (v as TagSuggestMode)
    : DEFAULT_TAG_SUGGEST_MODE;
}

/**
 * Header rows are not meant to be selectable. Their value consists only of
 * whitespace (two different ones, because rows with the same value could collapse):
 * if one is adopted anyway, the tag field saves nothing.
 */
export const HEADER_VALUE_TREE = " ";
export const HEADER_VALUE_LIBRARY = "  ";

export interface SuggestRow {
  /** Text that the tag field adopts on selection. */
  value: string;
  /** Displayed text. */
  label: string;
}

export interface SuggestInput {
  /** Matching `§` tags of the library (DB query, arbitrary order). */
  candidates: string[];
  /** Headings of the outline(s) of the top-level collection in tree order; empty = none. */
  treeHeads: Pick<FlatHeading, "tag" | "num">[];
  /** Headings of the library outline in tree order (order and numbers). */
  libraryHeads: Pick<FlatHeading, "tag" | "num">[];
  /** Input in the tag field, starting with `§`. */
  typed: string;
  mode: TagSuggestMode;
  headingTree: string;
  headingLibrary: string;
}

/**
 * Character budget of a row (name + number). The popup truncates long rows
 * itself at the end and would cut off the number; therefore labelWithNumber
 * shortens the name beforehand. shortcut: fixed character count instead of measured width — in
 * a narrower popup the number can still fall, in a wider one
 * it is shortened earlier than necessary; rows without a number are further shortened by the popup.
 */
export const LABEL_MAX_CHARS = 34;

/** "Name (1.2)"; if that is too long, the name is shortened with "…", the number stays. */
export function labelWithNumber(tag: string, num: string): string {
  const suffix = ` (${num})`;
  if (tag.length + suffix.length <= LABEL_MAX_CHARS) return tag + suffix;
  const room = Math.max(1, LABEL_MAX_CHARS - suffix.length - 1);
  return `${tag.slice(0, room).trimEnd()}…${suffix}`;
}

/** Sorts by `order`, then alphabetically. */
function orderBy(tags: string[], order: string[]): string[] {
  const pos = new Map(order.map((t, i) => [t, i] as const));
  return [...tags].sort((a, b) => {
    const pa = pos.get(a) ?? Infinity;
    const pb = pos.get(b) ?? Infinity;
    return pa === pb ? a.localeCompare(b) : pa < pb ? -1 : 1;
  });
}

export function suggestRows(input: SuggestInput): SuggestRow[] {
  const have = new Set(input.candidates);
  const treeSet = new Set(input.treeHeads.map((h) => h.tag));
  // For the same tag, the number from the top-level collection tree applies
  const numbers = new Map<string, string>();
  for (const h of [...input.treeHeads, ...input.libraryHeads])
    if (h.num && !numbers.has(h.tag)) numbers.set(h.tag, h.num);
  // The number only stands in the label; the value (= the tag name) stays untouched.
  const plain = (t: string): SuggestRow => {
    const num = numbers.get(t);
    return { value: t, label: num ? labelWithNumber(t, num) : t };
  };
  const inTree = [...treeSet].filter((t) => have.has(t));
  const rest = orderBy(
    input.candidates.filter((t) => !treeSet.has(t)),
    input.libraryHeads.map((h) => h.tag),
  );

  // No own outline (or no match within it): library-wide list.
  if (!inTree.length && !(treeSet.size && input.mode === "tree")) {
    return rest.map(plain);
  }

  const rows: SuggestRow[] = [];
  if (inTree.length) {
    rows.push({ value: HEADER_VALUE_TREE, label: input.headingTree });
    rows.push(...inTree.map(plain));
  }
  const showLibrary =
    input.mode === "all" ||
    (input.mode === "typed" && input.typed.length > HEADING_PREFIX.length);
  if (showLibrary && rest.length) {
    rows.push({ value: HEADER_VALUE_LIBRARY, label: input.headingLibrary });
    rows.push(...rest.map(plain));
  }
  return rows;
}
