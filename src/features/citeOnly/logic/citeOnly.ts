/**
 * citeOnly — reine Entscheidung für den Nur-Nachweis-Modus (Word/LibreOffice).
 *
 * Welche Zitate zu reinen Nachweisen werden, entscheidet der Aufrufer
 * (features/citeOnly/integrationPatch.ts) mit Zotero-Daten; hier wird nur die
 * Zitatliste aufgebaut. Ohne Zotero-Imports, daher in Node testbar.
 */

export interface CitationItemLike {
  id: number;
  locator?: string;
  label?: string;
  uris?: unknown;
  itemData?: unknown;
  [key: string]: unknown;
}

/** Was der Aufrufer von einer Annotation weiß. */
export interface AnnotationRef {
  /** id des zitierbaren Elternitems; null, wenn es keines gibt. */
  topLevelId: number | null;
  /** annotationPageLabel der Annotation; leer, wenn keiner gesetzt ist. */
  pageLabel: string;
  /** Locator-Typ (z. B. "page", "section"); nur relevant, wenn pageLabel gesetzt ist. */
  locatorType: string;
}

/**
 * Baut die Zitatliste für den Nur-Nachweis-Modus. `refs[i]` gehört zu `items[i]`;
 * `null` bedeutet „keine Annotation“.
 *
 * @return Neue Liste, oder null, wenn nicht alle Einträge Annotationen mit
 *   zitierbarem Elternitem sind (dann nativ weiter). Die Eingabe bleibt unverändert.
 */
export function citationOnlyItems(
  items: CitationItemLike[],
  refs: (AnnotationRef | null)[],
): CitationItemLike[] | null {
  if (!items.length || refs.length !== items.length) {
    return null;
  }

  const result: CitationItemLike[] = [];
  for (let i = 0; i < items.length; i++) {
    const ref = refs[i];
    if (!ref || ref.topLevelId === null) {
      return null;
    }

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
  }
  return result;
}
