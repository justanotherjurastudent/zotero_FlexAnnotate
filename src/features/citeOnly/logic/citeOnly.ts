/**
 * citeOnly — pure decision for the citation-only mode (Word/LibreOffice).
 *
 * Which citations become bare citations is decided by the caller
 * (features/citeOnly/integrationPatch.ts) with Zotero data; here only the
 * citation list is built. No Zotero imports, therefore node-testable.
 */

export interface CitationItemLike {
  id: number;
  locator?: string;
  label?: string;
  uris?: unknown;
  itemData?: unknown;
  [key: string]: unknown;
}

/** What the caller knows about an annotation. */
export interface AnnotationRef {
  /** id of the citable parent item; null if there is none. */
  topLevelId: number | null;
  /** annotationPageLabel of the annotation; empty if none is set. */
  pageLabel: string;
  /** Locator type (e.g. "page", "section"); only relevant if pageLabel is set. */
  locatorType: string;
}

/**
 * Builds the citation list for the citation-only mode. `refs[i]` belongs to `items[i]`;
 * `null` means "no annotation" (regular item).
 *
 * @return New list, or null if no annotations are present or an annotation has no
 *   citable parent item (then continue natively). The input remains unchanged.
 */
export function citationOnlyItems(
  items: CitationItemLike[],
  refs: (AnnotationRef | null)[],
): CitationItemLike[] | null {
  if (!items.length || refs.length !== items.length) {
    return null;
  }

  const result: CitationItemLike[] = [];
  let hasAnnotation = false;
  for (let i = 0; i < items.length; i++) {
    const ref = refs[i];
    if (ref) {
      if (ref.topLevelId === null) {
        return null;
      }
      hasAnnotation = true;
      const entry: CitationItemLike = {
        ...items[i],
        id: ref.topLevelId,
        uris: undefined,
        itemData: undefined,
      };
      if (ref.pageLabel) {
        entry.locator = ref.pageLabel;
        entry.label = ref.locatorType;
      }
      result.push(entry);
    } else {
      result.push({ ...items[i] });
    }
  }
  return hasAnnotation ? result : null;
}
