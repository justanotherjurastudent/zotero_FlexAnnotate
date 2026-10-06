/**
 * locator — the "type of citation place" of an annotation (page, section, …).
 *
 * Zotero annotations only carry a page label, so the type lives in a tag.
 * Annotree is compatible with the FlexAnnotate plugin:
 *   - `#flexannotate-locator-<type>` (automatic tag) on the annotation
 *   - `#flexannotate-default-locator-<type>` on the attachment: the default for
 *     all annotations of that document that carry no tag of their own
 * FlexAnnotate sets the annotation tag only when the type or the document
 * default differs from "page". Wherever those tags are in use for an
 * annotation, Annotree reads and changes THEM and adds no tag of its own.
 * Without them, Annotree falls back to its private tag
 * `annotree:locator=<type>`.
 * Pure logic, no Zotero imports.
 */

export const OWN_PREFIX = "annotree:locator=";
export const FLEX_PREFIX = "#flexannotate-locator-";
export const FLEX_DEFAULT_PREFIX = "#flexannotate-default-locator-";
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

export function isOwnLocatorTag(tag: string): boolean {
  return tag.startsWith(OWN_PREFIX);
}

export function isFlexLocatorTag(tag: string): boolean {
  return tag.startsWith(FLEX_PREFIX);
}

/**
 * The locator type of an annotation: FlexAnnotate's annotation tag, then the
 * document default of FlexAnnotate, then Annotree's own tag, then "page".
 */
export function locatorOf(
  annotationTags: string[],
  attachmentTags: string[] = [],
): string {
  return (
    valueOf(annotationTags, FLEX_PREFIX) ??
    valueOf(attachmentTags, FLEX_DEFAULT_PREFIX) ??
    valueOf(annotationTags, OWN_PREFIX) ??
    DEFAULT_LOCATOR
  );
}

/** True when FlexAnnotate's locator tags are in use for this annotation. */
export function usesFlexAnnotate(
  annotationTags: string[],
  attachmentTags: string[] = [],
): boolean {
  return (
    annotationTags.some(isFlexLocatorTag) ||
    attachmentTags.some((t) => t.startsWith(FLEX_DEFAULT_PREFIX))
  );
}

export interface TagChanges {
  remove: string[];
  /** type 1 = automatic tag (as FlexAnnotate sets it), 0 = manual. */
  add: { tag: string; type: 0 | 1 }[];
}

/**
 * Tag changes that make `type` the locator of an annotation. In FlexAnnotate
 * mode this mirrors FlexAnnotate (no tag when both the type and the document
 * default are "page") and migrates away Annotree's own tag; otherwise Annotree's
 * private tag is used.
 */
export function locatorTagChanges(
  annotationTags: string[],
  attachmentTags: string[],
  type: string,
): TagChanges {
  const remove = annotationTags.filter(
    (t) => isOwnLocatorTag(t) || isFlexLocatorTag(t),
  );
  if (usesFlexAnnotate(annotationTags, attachmentTags)) {
    const documentDefault =
      valueOf(attachmentTags, FLEX_DEFAULT_PREFIX) ?? DEFAULT_LOCATOR;
    const needsTag =
      type !== DEFAULT_LOCATOR || documentDefault !== DEFAULT_LOCATOR;
    return {
      remove,
      add: needsTag ? [{ tag: FLEX_PREFIX + type, type: 1 }] : [],
    };
  }
  return {
    remove,
    add:
      type && type !== DEFAULT_LOCATOR
        ? [{ tag: OWN_PREFIX + type, type: 0 }]
        : [],
  };
}

/** "S. 22" style text from a short label and a page label. */
export function formatLocator(shortLabel: string, place: string): string {
  if (!place) return "";
  return [shortLabel, place].filter(Boolean).join(" ");
}
