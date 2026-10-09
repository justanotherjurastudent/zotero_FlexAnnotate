/**
 * locator — the "type of citation place" of an annotation (page, section, …).
 *
 * Zotero annotations only carry a page label, so the type lives in a tag:
 *   - `#flexannotate-locator-<type>` (automatic tag) on the annotation
 *   - `#flexannotate-default-locator-<type>` on the attachment: the default for
 *     all annotations of that document that carry no tag of their own
 * The tag is only set when the type or the document default differs from "page".
 * Pure logic, no Zotero imports.
 */

export const LOCATOR_PREFIX = "#flexannotate-locator-";
export const DEFAULT_LOCATOR_PREFIX = "#flexannotate-default-locator-";
export const DEFAULT_LOCATOR = "page";

/** Fallback list when Zotero's own label list is unavailable. */
export const FALLBACK_LOCATORS = [
  "page",
  "chapter",
  "section",
  "paragraph",
  "verse",
  "line",
  "figure",
  "note",
  "column",
  "folio",
];

const valueOf = (tags: string[], prefix: string): string | null => {
  const t = tags.find((x) => x.startsWith(prefix));
  return t ? t.slice(prefix.length) || null : null;
};

/**
 * The locator type of an annotation: its own tag, then the document default,
 * then "page".
 */
export function locatorOf(
  annotationTags: string[],
  attachmentTags: string[] = [],
): string {
  return (
    valueOf(annotationTags, LOCATOR_PREFIX) ??
    valueOf(attachmentTags, DEFAULT_LOCATOR_PREFIX) ??
    DEFAULT_LOCATOR
  );
}

export interface TagChanges {
  remove: string[];
  /** type 1 = automatic tag, 0 = manual. */
  add: { tag: string; type: 0 | 1 }[];
}

/**
 * Tag changes that make `type` the locator of an annotation. No tag is needed
 * when both the type and the document default are "page".
 */
export function locatorTagChanges(
  annotationTags: string[],
  attachmentTags: string[],
  type: string,
): TagChanges {
  const remove = annotationTags.filter((t) => t.startsWith(LOCATOR_PREFIX));
  const documentDefault =
    valueOf(attachmentTags, DEFAULT_LOCATOR_PREFIX) ?? DEFAULT_LOCATOR;
  const needsTag =
    !!type && (type !== DEFAULT_LOCATOR || documentDefault !== DEFAULT_LOCATOR);
  return {
    remove,
    add: needsTag ? [{ tag: LOCATOR_PREFIX + type, type: 1 }] : [],
  };
}

/** "S. 22" style text from a short label and a page label. */
export function formatLocator(shortLabel: string, place: string): string {
  if (!place) return "";
  return [shortLabel, place].filter(Boolean).join(" ");
}
