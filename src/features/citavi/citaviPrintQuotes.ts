/**
 * Citavi: create quotations without file attachments as print annotations. Origin:
 * pre-merge:src/citaviImport.js (importPrintQuotes, XML parsing, note cleanup).
 * Pure parser and text logic lives in logic/citavi.ts.
 */
import {
  buildAnnotationData,
  createLocatorResolver,
  isDuplicateAnnotation,
  isQuoteNote,
  resolveKeywords,
  splitOnetoN,
  xpathLiteral,
  type AnnotationKey,
  type CitaviKnowledgeItem,
} from "./logic/citavi";
import { getPref } from "../../utils/prefs";
import * as printAnnotations from "../print/printAnnotations";
import { find as findPlaceholder, isPlaceholder } from "../print/placeholder";
import type { CitaviTranslation, CitaviXml } from "./citaviLinks";

/**
 * Pref reading for the locator mapping. Re-reads on every call so a setting
 * change takes effect without a restart.
 */
const locatorFor = createLocatorResolver(
  // Name comes from core/citavi (locator prefs); typing of the prefs map forces the cast.
  (name) =>
    getPref(name as Parameters<typeof getPref>[0]) as string | undefined,
  (numberType) => {
    // An unknown page type is "other" — but it belongs in the log, otherwise a
    // wrong name would stay unnoticed forever. Once per session, like legacy.
    ztoolkit.log(
      `Citavi import: unknown page type <nt>${numberType}</nt>, treated as 'other'`,
    );
  },
);

/** Reads the fields of a KnowledgeItem from the XML (Zotero sandbox utilities). */
function readKnowledgeItem(
  ZU: CitaviXml,
  node: Element,
  doc: Document,
): CitaviKnowledgeItem {
  return {
    coreStatement: ZU.xpathText(node, "./CoreStatement"),
    text: ZU.xpathText(node, "./Text"),
    quotationType: ZU.xpathText(node, "./QuotationType"),
    // Raw text with <os>/<nt> as literal text (Citavi export, see docs/architecture.md)
    pageRange: ZU.xpathText(node, "./PageRange"),
    pageRangeNumber: ZU.xpathText(node, "./PageRangeNumber"),
    keywords: keywordsOf(ZU, node, doc),
  };
}

/**
 * Keywords of the KnowledgeItem. The OnetoN node is matched exactly via the ID of the
 * first member (not via `starts-with`, otherwise ID K1 would hit the node of K10).
 * The matching is done in JS so the ID never ends up in an XPath expression.
 */
function keywordsOf(ZU: CitaviXml, node: Element, doc: Document): string[] {
  try {
    const id = ZU.xpathText(node, "@id");
    const oneToN = ZU.xpath(doc, "//KnowledgeItemKeywords/OnetoN")
      .map((n) => n.textContent)
      .find((text) => splitOnetoN(text).ownerId === id);
    return resolveKeywords(oneToN, (keywordId) =>
      ZU.xpathText(doc, `.//Keyword[@id=${xpathLiteral(keywordId)}]/Name`),
    );
  } catch (e) {
    Zotero.logError(e as Error);
    return [];
  }
}

/**
 * Removes the note that Zotero's translator created for the same quote. Deletes
 * data: only notes on the same source whose text begins with core statement + quote and
 * then carries just one location (isQuoteNote in core/citavi.ts). Note form:
 * Citavi 5 XML.js:186-206 (10.0.5; 10.0.1: 183-206), location extractPages :510-513.
 */
async function removeQuoteNote(
  item: Zotero.Item,
  quote: CitaviKnowledgeItem,
): Promise<boolean> {
  for (const note of Zotero.Items.get(item.getNotes())) {
    if (isQuoteNote(note.getNote(), quote)) {
      await note.eraseTx();
      return true;
    }
  }
  return false;
}

/** true if an attachment exists that Zotero can annotate. */
function hasAnnotatableAttachment(item: Zotero.Item): boolean {
  for (const attachment of Zotero.Items.get(item.getAttachments())) {
    if (attachment.attachmentReaderType && !isPlaceholder(attachment)) {
      return true;
    }
  }
  return false;
}

/**
 * Creates a print annotation for every Citavi quote that Zotero did not adopt.
 * A repeated import skips quotes that already stand as annotations on the placeholder
 * (isDuplicateAnnotation); legacy had no check. The translator's note is only removed
 * for annotations that were actually created.
 *
 * @return Number of created annotations and skipped duplicates
 */
export async function importPrintQuotes(
  translation: CitaviTranslation,
): Promise<{ created: number; duplicates: number }> {
  const idMap = translation?._itemSaver?._IDMap;
  if (!idMap) {
    ztoolkit.log("Citavi import: no ID map available");
    return { created: 0, duplicates: 0 };
  }

  // The stream is consumed after Zotero's pass (import/citavi.js:14).
  translation._io.init("xml/dom");
  const doc = translation._sandboxZotero.getXML();
  const ZU = translation._sandboxZotero.Utilities;

  // KnowledgeItems with an EntityLink are anchored at a PDF location
  const anchored = new Set(
    ZU.xpath(doc, "//EntityLinks/EntityLink/SourceID").map(
      (node) => node.textContent,
    ),
  );

  let created = 0;
  let seen = 0;
  let notesRemoved = 0;
  const keepNotes = getPref("citaviKeepNotes");
  // Why a quote was skipped — otherwise "created 0" is not interpretable
  const skipped = {
    noReference: 0,
    noItem: 0,
    notRegular: 0,
    handledByZotero: 0,
    empty: 0,
    duplicates: 0,
  };
  const attachmentCache = new Map<number, boolean>();
  // Existing annotations per title, loaded once; newly created ones are added
  const existingByItem = new Map<number, AnnotationKey[]>();

  for (const node of ZU.xpath(doc, "//KnowledgeItems/KnowledgeItem")) {
    seen++;
    const knowledgeItemID = ZU.xpathText(node, "@id");
    const referenceID = ZU.xpathText(node, "./ReferenceID");
    if (!referenceID) {
      skipped.noReference++;
      continue;
    }

    const itemID = idMap[referenceID];
    if (!itemID) {
      skipped.noItem++;
      continue;
    }

    const item = await Zotero.Items.getAsync(itemID);
    if (!item || !item.isRegularItem()) {
      skipped.notRegular++;
      continue;
    }

    // Zotero only adopted the quote if it is anchored AND the source has an
    // annotatable attachment (import/citavi.js:76-80).
    if (knowledgeItemID && anchored.has(knowledgeItemID)) {
      if (!attachmentCache.has(item.id)) {
        attachmentCache.set(item.id, hasAnnotatableAttachment(item));
      }
      if (attachmentCache.get(item.id)) {
        skipped.handledByZotero++;
        continue;
      }
    }

    const quote = readKnowledgeItem(ZU, node, doc);
    const data = buildAnnotationData(quote, locatorFor);
    if (!data.text && !data.comment) {
      skipped.empty++;
      continue;
    }

    let existing = existingByItem.get(item.id);
    if (!existing) {
      const placeholder = findPlaceholder(item);
      existing = (placeholder?.getAnnotations() ?? []).map((a) => ({
        pageLabel: a.annotationPageLabel,
        text: a.annotationText,
        comment: a.annotationComment,
      }));
      existingByItem.set(item.id, existing);
    }
    const key = {
      pageLabel: data.pageLabel,
      text: data.text,
      comment: data.comment,
    };
    if (isDuplicateAnnotation(existing, key)) {
      skipped.duplicates++;
      continue;
    }

    await printAnnotations.create(item, data);
    existing.push(key);
    created++;

    if (!keepNotes && (await removeQuoteNote(item, quote))) {
      notesRemoved++;
    }
  }

  ztoolkit.log(
    `Citavi import: created ${created} print annotation(s) ` +
      `from ${seen} KnowledgeItem(s); removed ${notesRemoved} note(s); skipped ` +
      Object.entries(skipped)
        .map(([k, v]) => `${k}=${v}`)
        .join(" "),
  );
  return { created, duplicates: skipped.duplicates };
}
