/**
 * docExport — Gliederung als Word (DOCX) und LibreOffice (ODT) exportieren.
 * Reine Logik ohne DOM/Zotero: baut die XML-Teile der Dokumente. Die
 * Überschriften bekommen die Standard-Formatvorlagen ("Überschrift 1" bis 9)
 * und eine mehrstufige Nummerierung, die in Word automatisch mitläuft.
 */
import { flatten, type OutlineNode } from "./outline.ts";

/** Word und LibreOffice unterstützen 9 Überschriftsebenen. */
const MAX_LEVEL = 9;

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Ebene der Gliederungstiefe: Wurzel = 1, nie tiefer als 9. */
const levelOf = (depth: number) => Math.min(depth + 1, MAX_LEVEL);

// ── DOCX ─────────────────────────────────────────────────────────────────────

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const PKG_REL = "http://schemas.openxmlformats.org/package/2006/content-types";
const PKG_RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export interface DocxParts {
  documentXml: string;
  stylesXml: string;
  numberingXml: string;
  contentTypesXml: string;
  rootRelsXml: string;
  docRelsXml: string;
}

/** Überschriften des Baums als Absätze mit Formatvorlage (Dokumentreihenfolge). */
export function docxBody(roots: OutlineNode[]): string {
  return flatten(roots)
    .map(({ node, depth }) => {
      const text = node.title.trim();
      if (!text) return "";
      const level = levelOf(depth);
      return (
        `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>` +
        `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`
      );
    })
    .join("");
}

/** Mehrstufige Nummerierung "1", "1.1", …, jede Ebene an die Vorlage gebunden. */
export function docxNumbering(): string {
  const lvl = (ilvl: number) => {
    const fmt = Array.from({ length: ilvl + 1 }, (_, i) => `%${i + 1}`).join(
      ".",
    );
    return (
      `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/>` +
      `<w:numFmt w:val="decimal"/><w:pStyle w:val="Heading${ilvl + 1}"/>` +
      `<w:lvlText w:val="${fmt}"/><w:lvlJc w:val="left"/>` +
      `<w:pPr><w:ind w:left="0" w:firstLine="0"/></w:pPr></w:lvl>`
    );
  };
  const levels = Array.from({ length: MAX_LEVEL }, (_, i) => lvl(i)).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}>` +
    `<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/>` +
    `${levels}</w:abstractNum>` +
    `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`
  );
}

/** Standard-Formatvorlagen: Normal plus Überschrift 1-9 mit outlineLvl und Nummerierung. */
export function docxStyles(): string {
  const heading = (level: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${level}">` +
    `<w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/>` +
    `<w:next w:val="Normal"/><w:uiPriority w:val="9"/>` +
    (level > 3 ? `<w:unhideWhenUsed/>` : "") +
    `<w:qFormat/><w:pPr>` +
    `<w:numPr><w:ilvl w:val="${level - 1}"/><w:numId w:val="1"/></w:numPr>` +
    `<w:outlineLvl w:val="${level - 1}"/></w:pPr></w:style>`;
  const headings = Array.from({ length: MAX_LEVEL }, (_, i) =>
    heading(i + 1),
  ).join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal">` +
    `<w:name w:val="Normal"/><w:uiPriority w:val="0"/><w:qFormat/></w:style>${headings}</w:styles>`
  );
}

export function buildDocxParts(roots: OutlineNode[]): DocxParts {
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document ${W}><w:body>${docxBody(roots)}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417"/></w:sectPr>` +
    `</w:body></w:document>`;
  return {
    documentXml,
    stylesXml: docxStyles(),
    numberingXml: docxNumbering(),
    contentTypesXml:
      `<?xml version="1.0"?><Types xmlns="${PKG_REL}">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
      `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
      `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
      `</Types>`,
    rootRelsXml:
      `<?xml version="1.0"?><Relationships xmlns="${PKG_RELS}">` +
      `<Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="word/document.xml"/>` +
      `</Relationships>`,
    docRelsXml:
      `<?xml version="1.0"?><Relationships xmlns="${PKG_RELS}">` +
      `<Relationship Id="rId1" Type="${DOC_REL}/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId2" Type="${DOC_REL}/numbering" Target="numbering.xml"/>` +
      `</Relationships>`,
  };
}

// ── ODT ──────────────────────────────────────────────────────────────────────

const OFFICE = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const TEXT = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const STYLE = "urn:oasis:names:tc:opendocument:xmlns:style:1.0";
const FO = "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0";
const MANIFEST = "urn:oasis:names:tc:opendocument:xmlns:manifest:1.0";

export const ODT_MIMETYPE = "application/vnd.oasis.opendocument.text";

export interface OdtParts {
  contentXml: string;
  stylesXml: string;
  manifestXml: string;
  mimetype: string;
}

/** Überschriften als text:h mit outline-level (Dokumentreihenfolge). */
export function odtBody(roots: OutlineNode[]): string {
  return flatten(roots)
    .map(({ node, depth }) => {
      const text = node.title.trim();
      if (!text) return "";
      const level = levelOf(depth);
      return (
        `<text:h text:style-name="Heading_20_${level}" ` +
        `text:outline-level="${level}">${esc(text)}</text:h>`
      );
    })
    .join("");
}

/** Gliederungsnummerierung "1", "1.1", … für alle 9 Ebenen. */
export function odtOutlineStyle(): string {
  const lvl = (level: number) =>
    `<text:list-level-style-number text:level="${level}" style:num-format="1"/>`;
  const levels = Array.from({ length: MAX_LEVEL }, (_, i) => lvl(i + 1)).join(
    "",
  );
  return `<text:outline-style style:name="Outline">${levels}</text:outline-style>`;
}

/** Standard-Überschriftenvorlagen (Heading 1-9) mit display-name. */
export function odtHeadingStyles(): string {
  const heading = (level: number) =>
    `<style:style style:name="Heading_20_${level}" ` +
    `style:display-name="Heading ${level}" style:family="paragraph" ` +
    `style:parent-style-name="Heading"/>`;
  const headings = Array.from({ length: MAX_LEVEL }, (_, i) =>
    heading(i + 1),
  ).join("");
  return (
    `<style:style style:name="Standard" style:family="paragraph"/>` +
    `<style:style style:name="Heading" style:family="paragraph"/>${headings}`
  );
}

export function buildOdtParts(roots: OutlineNode[]): OdtParts {
  const contentXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<office:document-content xmlns:office="${OFFICE}" xmlns:text="${TEXT}" ` +
    `xmlns:style="${STYLE}" xmlns:fo="${FO}" office:version="1.2">` +
    `<office:automatic-styles/><office:body><office:text>` +
    `${odtBody(roots)}</office:text></office:body></office:document-content>`;
  return {
    contentXml,
    stylesXml:
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<office:document-styles xmlns:office="${OFFICE}" xmlns:text="${TEXT}" ` +
      `xmlns:style="${STYLE}" xmlns:fo="${FO}" office:version="1.2">` +
      `<office:styles>${odtOutlineStyle()}${odtHeadingStyles()}</office:styles>` +
      `</office:document-styles>`,
    manifestXml:
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<manifest:manifest xmlns:manifest="${MANIFEST}" manifest:version="1.2">` +
      `<manifest:file-entry manifest:full-path="/" manifest:media-type="${ODT_MIMETYPE}"/>` +
      `<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>` +
      `<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>` +
      `</manifest:manifest>`,
    mimetype: ODT_MIMETYPE,
  };
}
