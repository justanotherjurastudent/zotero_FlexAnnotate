/**
 * Citavi import: pure parser and text logic, without Zotero globals and without DOM.
 *
 * Origin: pre-merge:src/citaviImport.js
 *   - QUOTATION_TYPES, LOCATOR_PREF_BY_NUMBER_TYPE, MAX_NOTE_TAIL: constants
 *   - getLocatorFor()          -> createLocatorResolver() (prefs and log injected)
 *   - isPageTail(), stripMarkup(), normalizeText()
 *   - removeQuoteNote()        -> isQuoteNote() (only the text comparison; DB deletion stays with Zotero)
 *   - buildAnnotationData()    -> buildAnnotationData() (receives a plain CitaviKnowledgeItem)
 *   - parsePageRange()         -> parsePageRange() (raw text instead of DOM node)
 *   - getKeywords()            -> resolveKeywords() (OnetoN text and name lookup injected)
 *
 * Stays in legacy (part 2, Zotero-dependent): translator patch, window hooks,
 * importPrintQuotes, linkContributions, hasAnnotatableAttachment, removeQuoteNote DB part,
 * and the XPath queries that read the fields of a KnowledgeItem from the XML.
 */

/** Reads a setting; empty or undefined means "default". */
export type PrefGetter = (name: string) => string | null | undefined;

/** A KnowledgeItem, already read from the XML (text contents of the nodes). */
export interface CitaviKnowledgeItem {
  coreStatement?: string | null;
  text?: string | null;
  quotationType?: string | null;
  /** Raw text of <PageRange>, with embedded <os>/<nt> markup */
  pageRange?: string | null;
  /** Content of <PageRangeNumber>; "-1" means "no page captured" */
  pageRangeNumber?: string | null;
  /** Already resolved keywords (see resolveKeywords) */
  keywords?: string[];
}

/** Fields of a print annotation; matches PrintAnnotationData (features/print). */
export interface CitaviAnnotationData {
  type: "highlight";
  color: string;
  text: string;
  comment: string;
  pageLabel: string;
  locator: string;
  tags: string[];
}

/**
 * Maps the quote type from the Citavi export to color and field assignment. Colors from
 * import/citavi.js:112-140. Unknown values fall back to type 1.
 */
export const QUOTATION_TYPES: Record<
  string,
  { color: string; swap?: boolean; dropComment?: boolean }
> = {
  "1": { color: "#2ea8e5" },
  "2": { color: "#a6507b", swap: true },
  "3": { color: "#5fb236" },
  "4": { color: "#ff8c19" },
  "5": { color: "#ffd400", dropComment: true },
  "6": { color: "#ff6666", dropComment: true },
};

/** Maps Citavi's <nt> value to the responsible setting. If <nt> is missing, Citavi means a page. */
export const LOCATOR_PREF_BY_NUMBER_TYPE: Record<string, string> = {
  Column: "citaviLocatorColumn",
  Paragraph: "citaviLocatorParagraph",
  Margin: "citaviLocatorMargin",
  Other: "citaviLocatorOther",
};

/** Max length of the tail after the quote so it can still be the location */
export const MAX_NOTE_TAIL = 60;

/** Normalized to plain spaces, without margins. */
export function normalizeText(text: string | null | undefined): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Flow text without markup, entities resolved. &amp; last so that &amp;lt; stays correct. */
export function stripMarkup(html: string | null | undefined): string {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * May only the location follow the quote? The translator strips everything except
 * digits and hyphens from the location, so a remainder with letters cannot come from it.
 */
export function isPageTail(tail: string): boolean {
  return tail.length <= MAX_NOTE_TAIL && /^[\s\d–-]*$/.test(tail);
}

/**
 * Does the note (HTML) belong to this quote? The translator writes
 * `<h1>Kernaussage</h1>\n<p>Text</p>\n<i>Fundstelle</i>`; the normalized
 * flow text is compared. The note must start with core statement + text, and afterwards only a
 * location may follow (isPageTail). The caller additionally checks that the note hangs on the same
 * source.
 */
export function isQuoteNote(
  noteHtml: string | null | undefined,
  item: Pick<CitaviKnowledgeItem, "coreStatement" | "text">,
): boolean {
  const wanted = normalizeText(
    `${item.coreStatement ?? ""} ${item.text ?? ""}`,
  );
  if (!wanted) {
    return false;
  }
  const plain = normalizeText(stripMarkup(noteHtml));
  return plain.startsWith(wanted) && isPageTail(plain.slice(wanted.length));
}

/**
 * Builds the function that maps a Citavi page type (`<nt>`, null = page) onto a
 * CSL locator. The mapping depends on the citation style and comes from the prefs.
 * Unknown types fall back to "other" and are reported once per resolver.
 */
export function createLocatorResolver(
  getPref: PrefGetter,
  onUnknownType?: (numberType: string) => void,
): (numberType: string | null | undefined) => string {
  const reported = new Set<string>();
  return (numberType) => {
    let pref: string;
    if (!numberType) {
      pref = "citaviLocatorPage";
    } else if (Object.hasOwn(LOCATOR_PREF_BY_NUMBER_TYPE, numberType)) {
      pref = LOCATOR_PREF_BY_NUMBER_TYPE[numberType];
    } else {
      pref = "citaviLocatorOther";
      if (!reported.has(numberType)) {
        reported.add(numberType);
        onUnknownType?.(numberType);
      }
    }
    return getPref(pref) || "page";
  };
}

/**
 * Reads page label and locator from the raw text of <PageRange>. `<os>` is the
 * display form, `<nt>` the numbering type. Without `<os>`, PageRangeNumber applies, unless
 * it is "-1".
 */
export function parsePageRange(
  raw: string | null | undefined,
  pageRangeNumber: string | null | undefined,
  locatorFor: (numberType: string | null) => string,
): { pageLabel: string; locator: string } {
  const text = raw || "";
  const displayed = text.match(/<os>([\s\S]*?)<\/os>/);
  const numberType = text.match(/<nt>([\s\S]*?)<\/nt>/);

  let pageLabel = displayed ? displayed[1].trim() : "";
  if (!pageLabel) {
    // Citavi writes -1 when no page is captured
    pageLabel =
      pageRangeNumber && pageRangeNumber !== "-1" ? pageRangeNumber : "";
  }

  const locator = locatorFor(numberType ? numberType[1].trim() : null);
  return { pageLabel, locator };
}

/**
 * Splits a `//KnowledgeItemKeywords/OnetoN` text (`ID:…;KwID:…;…`, members by `;`,
 * per member the part before `:`) into the ID of the first member (the KnowledgeItem) and the
 * keyword IDs after it. The part after `:` is not documented in the export and
 * is ignored (like import/citavi.js:58-65).
 */
export function splitOnetoN(oneToN: string | null | undefined): {
  ownerId: string;
  keywordIds: string[];
} {
  const ids = (oneToN ?? "")
    .split(";")
    .map((part) => part.split(":")[0].trim())
    .filter(Boolean);
  return { ownerId: ids[0] ?? "", keywordIds: ids.slice(1) };
}

/**
 * Keyword IDs from an OnetoN text and their names. The first member is the
 * KnowledgeItem itself and is skipped.
 */
export function resolveKeywords(
  oneToN: string | null | undefined,
  nameOf: (keywordId: string) => string | null | undefined,
): string[] {
  return splitOnetoN(oneToN)
    .keywordIds.map((keywordId) => nameOf(keywordId))
    .filter((name): name is string => !!name);
}

/**
 * XPath-1.0 string literal for an arbitrary value so it does not break the expression.
 * A value with both quote characters is composed via concat().
 */
export function xpathLiteral(value: string): string {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  return `concat('${value.split("'").join(`', "'", '`)}')`;
}

/** Identity of a print annotation for the duplicate check. */
export interface AnnotationKey {
  pageLabel: string | null;
  text: string | null;
  comment: string | null;
}

/**
 * Is the candidate already present as an annotation? Equal are page label and
 * normalized quote text (markup removed). If the quote text is empty, the comment counts instead.
 * With existing text, the comment stays out because the user may change it
 * after the import.
 */
export function isDuplicateAnnotation(
  existing: AnnotationKey[],
  candidate: AnnotationKey,
): boolean {
  const plain = (value: string | null | undefined) =>
    normalizeText(stripMarkup(value));
  const label = plain(candidate.pageLabel);
  const text = plain(candidate.text);
  const comment = plain(candidate.comment);
  return existing.some(
    (e) =>
      plain(e.pageLabel) === label &&
      plain(e.text) === text &&
      (text !== "" || plain(e.comment) === comment),
  );
}

/**
 * Translates a KnowledgeItem into the fields of a print annotation. If the text is empty, it
 * takes the core statement (unlike import/citavi.js, see docs/architecture.md).
 */
export function buildAnnotationData(
  item: CitaviKnowledgeItem,
  locatorFor: (numberType: string | null) => string,
): CitaviAnnotationData {
  const core = (item.coreStatement ?? "").trim();
  const quote = (item.text ?? "").trim();
  const type = item.quotationType ?? "";
  const settings = Object.hasOwn(QUOTATION_TYPES, type)
    ? QUOTATION_TYPES[type]
    : QUOTATION_TYPES["1"];

  let text: string;
  let comment: string;
  if (settings.swap) {
    // Indirect quotation: core statement becomes the quote text, original text becomes the comment
    text = core;
    comment = quote;
  } else {
    text = quote || core;
    comment = quote ? core : "";
  }
  if (settings.dropComment) {
    comment = "";
  }

  const { pageLabel, locator } = parsePageRange(
    item.pageRange,
    item.pageRangeNumber,
    locatorFor,
  );

  return {
    type: "highlight",
    color: settings.color,
    text,
    comment,
    pageLabel,
    locator,
    tags: item.keywords ?? [],
  };
}
