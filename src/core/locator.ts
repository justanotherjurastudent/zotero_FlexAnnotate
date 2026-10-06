/**
 * locator — the "type of citation place" of an annotation (page, section, …).
 * Zotero annotations only carry a page label, so the type is kept as a private
 * tag `annotree:locator=<type>`; "page" is the default and stored as no tag.
 * Pure logic, no Zotero imports.
 */

export const LOCATOR_PREFIX = "annotree:locator=";
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

export function isLocatorTag(tag: string): boolean {
  return tag.startsWith(LOCATOR_PREFIX);
}

/** The locator type stored in a tag list ("page" if none). */
export function locatorOf(tags: string[]): string {
  const t = tags.find(isLocatorTag);
  return t
    ? t.slice(LOCATOR_PREFIX.length) || DEFAULT_LOCATOR
    : DEFAULT_LOCATOR;
}

/** Tag list with the locator type replaced (default type = no tag). */
export function withLocator(tags: string[], type: string): string[] {
  const rest = tags.filter((t) => !isLocatorTag(t));
  return type && type !== DEFAULT_LOCATOR
    ? [...rest, LOCATOR_PREFIX + type]
    : rest;
}

/** "S. 22" style text from a short label and a page label. */
export function formatLocator(shortLabel: string, place: string): string {
  if (!place) return "";
  return [shortLabel, place].filter(Boolean).join(" ");
}
