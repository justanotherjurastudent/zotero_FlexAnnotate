/**
 * Citavi-Import: reine Parser- und Textlogik, ohne Zotero-Globals und ohne DOM.
 *
 * Herkunft: legacy/citaviImport.js
 *   - QUOTATION_TYPES, LOCATOR_PREF_BY_NUMBER_TYPE, MAX_NOTE_TAIL: Konstanten
 *   - getLocatorFor()          -> createLocatorResolver() (Prefs und Log injiziert)
 *   - isPageTail(), stripMarkup(), normalizeText()
 *   - removeQuoteNote()        -> isQuoteNote() (nur der Textvergleich; DB-Löschung bleibt bei Zotero)
 *   - buildAnnotationData()    -> buildAnnotationData() (erhält ein plains CitaviKnowledgeItem)
 *   - parsePageRange()         -> parsePageRange() (Rohtext statt DOM-Knoten)
 *   - getKeywords()            -> resolveKeywords() (OnetoN-Text und Namenssuche injiziert)
 *
 * Bleibt in legacy (Teil 2, Zotero-abhängig): Translator-Patch, Fensterhooks,
 * importPrintQuotes, linkContributions, hasAnnotatableAttachment, removeQuoteNote-DB-Teil,
 * sowie die XPath-Abfragen, die die Felder eines KnowledgeItem aus dem XML lesen.
 */

/** Liest eine Einstellung; leer oder undefined heißt „Standard". */
export type PrefGetter = (name: string) => string | null | undefined;

/** Ein KnowledgeItem, bereits aus dem XML gelesen (Textinhalte der Knoten). */
export interface CitaviKnowledgeItem {
  coreStatement?: string | null;
  text?: string | null;
  quotationType?: string | null;
  /** Rohtext von <PageRange>, mit eingebettetem <os>/<nt>-Markup */
  pageRange?: string | null;
  /** Inhalt von <PageRangeNumber>; "-1" bedeutet „keine Seite erfasst" */
  pageRangeNumber?: string | null;
  /** Bereits aufgelöste Schlagwörter (siehe resolveKeywords) */
  keywords?: string[];
}

/** Felder einer Print-Annotation; passt zu PrintAnnotationData (features/print). */
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
 * Zitattyp aus dem Citavi-Export auf Farbe und Feldbelegung abbilden. Farben aus
 * import/citavi.js:112-140. Unbekannte Werte fallen auf Typ 1 zurück.
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

/** Citavis <nt>-Wert auf die zuständige Einstellung. Fehlt <nt>, meint Citavi eine Seite. */
export const LOCATOR_PREF_BY_NUMBER_TYPE: Record<string, string> = {
  Column: "citaviLocatorColumn",
  Paragraph: "citaviLocatorParagraph",
  Margin: "citaviLocatorMargin",
  Other: "citaviLocatorOther",
};

/** Höchstlänge des Rests hinter dem Zitat, damit er noch die Fundstelle sein kann */
export const MAX_NOTE_TAIL = 60;

/** Auf einfache Leerzeichen normalisiert, ohne Ränder. */
export function normalizeText(text: string | null | undefined): string {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fließtext ohne Markup, Entities aufgelöst. &amp; zuletzt, damit &amp;lt; korrekt bleibt. */
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
 * Darf hinter dem Zitat nur noch die Fundstelle stehen? Der Übersetzer streift aus der
 * Fundstelle alles außer Ziffern und Bindestrichen, ein Rest mit Buchstaben stammt also
 * nicht von ihm.
 */
export function isPageTail(tail: string): boolean {
  return tail.length <= MAX_NOTE_TAIL && /^[\s\d–-]*$/.test(tail);
}

/**
 * Gehört die Notiz (HTML) zu diesem Zitat? Der Übersetzer schreibt
 * `<h1>Kernaussage</h1>\n<p>Text</p>\n<i>Fundstelle</i>`; verglichen wird der normalisierte
 * Fließtext. Die Notiz muss mit Kernaussage + Text beginnen, und danach darf nur eine
 * Fundstelle folgen (isPageTail). Der Aufrufer prüft zusätzlich, dass die Notiz an derselben
 * Quelle hängt.
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
 * Baut die Funktion, die einen Citavi-Seitentyp (`<nt>`, null = Seite) auf einen
 * CSL-Locator abbildet. Die Zuordnung hängt am Zitierstil und kommt aus den Prefs.
 * Unbekannte Typen fallen auf „Andere" und werden einmal je Resolver gemeldet.
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
 * Liest Seitenangabe und Locator aus dem Rohtext von <PageRange>. `<os>` ist die
 * Anzeigeform, `<nt>` die Nummerierungsart. Ohne `<os>` gilt PageRangeNumber, sofern
 * sie nicht "-1" ist.
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
    // Citavi schreibt -1, wenn keine Seite erfasst ist
    pageLabel =
      pageRangeNumber && pageRangeNumber !== "-1" ? pageRangeNumber : "";
  }

  const locator = locatorFor(numberType ? numberType[1].trim() : null);
  return { pageLabel, locator };
}

/**
 * Schlüsselwort-IDs aus einem `//KnowledgeItemKeywords/OnetoN`-Text (`ID:…;KwID:…;…`)
 * und deren Namen. Das erste Glied ist das KnowledgeItem selbst und wird übersprungen.
 */
export function resolveKeywords(
  oneToN: string | null | undefined,
  nameOf: (keywordId: string) => string | null | undefined,
): string[] {
  if (!oneToN) {
    return [];
  }
  return oneToN
    .split(";")
    .map((part) => part.split(":")[0])
    .slice(1)
    .map((keywordId) => nameOf(keywordId))
    .filter((name): name is string => !!name);
}

/**
 * Übersetzt ein KnowledgeItem in die Felder einer Print-Annotation. Ist Text leer, nimmt
 * es die Kernaussage (anders als import/citavi.js, siehe docs/architecture.md).
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
    // Indirektes Zitat: Kernaussage ist der Text, das Original der Kommentar
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
