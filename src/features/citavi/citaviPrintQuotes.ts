/**
 * Citavi: Zitate ohne Dateianhang als Print-Annotationen anlegen. Herkunft:
 * pre-merge:src/citaviImport.js (importPrintQuotes, Lesen des XML, Notiz-Entfernung).
 * Reine Parser- und Textlogik liegt in core/citavi.ts.
 */
import {
  buildAnnotationData,
  createLocatorResolver,
  isQuoteNote,
  resolveKeywords,
  type CitaviKnowledgeItem,
} from "../../core/citavi";
import { getPref } from "../../utils/prefs";
import * as printAnnotations from "../print/printAnnotations";
import { isPlaceholder } from "../print/placeholder";
import type { CitaviTranslation, CitaviXml } from "./citaviLinks";

/**
 * Prefs-Lesen für die Locator-Zuordnung. Liest bei jedem Aufruf neu, damit eine
 * Änderung der Einstellung ohne Neustart wirkt.
 */
const locatorFor = createLocatorResolver(
  // Name kommt aus core/citavi (Locator-Prefs); Typisierung der Prefs-Map erzwingt den Cast.
  (name) =>
    getPref(name as Parameters<typeof getPref>[0]) as string | undefined,
  (numberType) => {
    // Ein unbekannter Seitentyp ist „Andere" — aber er gehört ins Log, sonst bliebe ein
    // falsch geratener Name für immer unbemerkt. Einmal je Sitzung, wie legacy.
    ztoolkit.log(
      `Citavi import: unknown page type <nt>${numberType}</nt>, treated as 'other'`,
    );
  },
);

/** Liest die Felder eines KnowledgeItem aus dem XML (Zotero-Sandbox-Utilities). */
function readKnowledgeItem(
  ZU: CitaviXml,
  node: Element,
  doc: Document,
): CitaviKnowledgeItem {
  return {
    coreStatement: ZU.xpathText(node, "./CoreStatement"),
    text: ZU.xpathText(node, "./Text"),
    quotationType: ZU.xpathText(node, "./QuotationType"),
    // Rohtext mit <os>/<nt> als wörtlicher Text (Citavi-Export, siehe docs/architecture.md)
    pageRange: ZU.xpathText(node, "./PageRange"),
    pageRangeNumber: ZU.xpathText(node, "./PageRangeNumber"),
    keywords: keywordsOf(ZU, node, doc),
  };
}

/**
 * Schlagwörter wie import/citavi.js:58-65.
 * shortcut: `starts-with(text(), id)` ist ein Präfix-Vergleich — ID 12 trifft auch die
 * Gruppe „123:…", wenn sie zuerst im Dokument steht; Legacy-Verhalten bleibt bewusst,
 * exakter Vergleich wäre `substring-before(text(), ":") = id`.
 */
function keywordsOf(ZU: CitaviXml, node: Element, doc: Document): string[] {
  try {
    const id = ZU.xpathText(node, "@id");
    const oneToN = ZU.xpathText(
      doc,
      `//KnowledgeItemKeywords/OnetoN[starts-with(text(), "${id}")]`,
    );
    return resolveKeywords(oneToN, (keywordId) =>
      ZU.xpathText(doc, `.//Keyword[@id='${keywordId}']/Name`),
    );
  } catch (e) {
    Zotero.logError(e as Error);
    return [];
  }
}

/**
 * Entfernt die Notiz, die Zoteros Übersetzer zu demselben Zitat angelegt hat. Löscht
 * Daten: nur Notizen an derselben Quelle, deren Text mit Kernaussage + Zitat beginnt und
 * danach nur eine Fundstelle trägt (isQuoteNote in core/citavi.ts). Notizform:
 * Citavi 5 XML.js:186-206 (10.0.5; 10.0.1: 183-206), Fundstelle extractPages :510-513.
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

/** true, wenn ein Anhang existiert, den Zotero annotieren kann. */
function hasAnnotatableAttachment(item: Zotero.Item): boolean {
  for (const attachment of Zotero.Items.get(item.getAttachments())) {
    if (attachment.attachmentReaderType && !isPlaceholder(attachment)) {
      return true;
    }
  }
  return false;
}

/**
 * Legt für jedes Citavi-Zitat, das Zotero nicht übernommen hat, eine Print-Annotation
 * an. Es gibt keine Dublettenprüfung (wie in legacy): jeder Lauf legt neu an.
 *
 * @return Anzahl angelegter Annotationen
 */
export async function importPrintQuotes(
  translation: CitaviTranslation,
): Promise<number> {
  const idMap = translation?._itemSaver?._IDMap;
  if (!idMap) {
    ztoolkit.log("Citavi import: no ID map available");
    return 0;
  }

  // Der Stream ist nach Zoteros Durchlauf verbraucht (import/citavi.js:14).
  translation._io.init("xml/dom");
  const doc = translation._sandboxZotero.getXML();
  const ZU = translation._sandboxZotero.Utilities;

  // KnowledgeItems mit EntityLink sind an einer PDF-Stelle verankert
  const anchored = new Set(
    ZU.xpath(doc, "//EntityLinks/EntityLink/SourceID").map(
      (node) => node.textContent,
    ),
  );

  let created = 0;
  let seen = 0;
  let notesRemoved = 0;
  const keepNotes = getPref("citaviKeepNotes");
  // Warum ein Zitat übersprungen wurde — sonst ist „created 0" nicht deutbar
  const skipped = {
    noReference: 0,
    noItem: 0,
    notRegular: 0,
    handledByZotero: 0,
    empty: 0,
  };
  const attachmentCache = new Map<number, boolean>();

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

    // Zotero hat das Zitat nur übernommen, wenn es verankert ist UND die Quelle einen
    // annotierbaren Anhang hat (import/citavi.js:76-80).
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

    await printAnnotations.create(item, data);
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
  return created;
}
