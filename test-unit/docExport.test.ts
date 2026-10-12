import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDocxParts,
  buildOdtParts,
  docxBody,
  docxNumbering,
  odtBody,
  ODT_MIMETYPE,
  odtOutlineStyle,
} from "../src/features/organizer/logic/docExport.ts";
import {
  makeNode,
  type OutlineNode,
} from "../src/features/organizer/logic/outline.ts";

function node(title: string, children: OutlineNode[] = []): OutlineNode {
  return { ...makeNode(title), children };
}

describe("docxBody", () => {
  it("schreibt Wurzel als Heading 1, Kinder als Heading 2, in Dokumentreihenfolge", () => {
    const body = docxBody([
      node("Einleitung", [node("Hintergrund")]),
      node("Hauptteil"),
    ]);
    assert.match(
      body,
      /<w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:t xml:space="preserve">Einleitung</,
    );
    assert.match(body, /<w:pStyle w:val="Heading2"\/>.*Hintergrund/);
    assert.match(body, /<w:pStyle w:val="Heading1"\/>.*Hauptteil/);
    const order = [...body.matchAll(/<w:t xml:space="preserve">([^<]+)</g)].map(
      (m) => m[1],
    );
    assert.deepEqual(order, ["Einleitung", "Hintergrund", "Hauptteil"]);
  });

  it("begrenzt tiefe Gliederungen auf Ebene 9", () => {
    let n = node("Ebene1");
    const top = n;
    for (let i = 2; i <= 12; i++) {
      const child = node(`Ebene${i}`);
      n.children.push(child);
      n = child;
    }
    const body = docxBody([top]);
    assert.doesNotMatch(body, /Heading1[0-9]/);
    // Ebene 9 bis 12 landen auf 9
    assert.equal([...body.matchAll(/Heading9/g)].length, 4);
  });

  it("escapet XML-Sonderzeichen im Titel", () => {
    const body = docxBody([node('A & B <C> "D"')]);
    assert.ok(body.includes("A &amp; B &lt;C&gt; &quot;D&quot;"));
  });

  it("laesst leere Titel weg", () => {
    const body = docxBody([node("", [node("Kind")]), node(" ")]);
    assert.equal([...body.matchAll(/<w:p>/g)].length, 1);
  });

  it("ergibt bei leerer Gliederung nur das Dokumentgeruest", () => {
    assert.equal(docxBody([]), "");
  });
});

describe("docxNumbering", () => {
  const xml = docxNumbering();
  it("bindet jede Ebene an die passende Vorlage", () => {
    assert.equal(
      [...xml.matchAll(/<w:pStyle w:val="Heading(\d)"\/>/g)].length,
      9,
    );
    assert.match(xml, /<w:lvl w:ilvl="0">.*<w:pStyle w:val="Heading1"\/>/);
    assert.match(xml, /<w:lvl w:ilvl="8">.*<w:pStyle w:val="Heading9"\/>/);
  });
  it("nummeriert mehrstufig: %1, %1.%2, %1.%2.%3", () => {
    assert.match(xml, /<w:lvl w:ilvl="0">.*<w:lvlText w:val="%1"\/>/);
    assert.match(xml, /<w:lvl w:ilvl="1">.*<w:lvlText w:val="%1.%2"\/>/);
    assert.match(xml, /<w:lvl w:ilvl="2">.*<w:lvlText w:val="%1.%2.%3"\/>/);
  });
  it("enthaelt genau eine abstractNum und ein num", () => {
    assert.equal([...xml.matchAll(/<w:abstractNum /g)].length, 1);
    assert.equal([...xml.matchAll(/<w:num w:numId/g)].length, 1);
  });
});

describe("buildDocxParts", () => {
  const p = buildDocxParts([node("Einleitung")]);
  it("styling: Normal plus Heading 1-9 mit outlineLvl, numPr und passendem ilvl", () => {
    assert.match(
      p.stylesXml,
      /<w:style w:type="paragraph" w:default="1" w:styleId="Normal">.*<w:uiPriority w:val="0"\/>/,
    );
    for (let i = 1; i <= 9; i++) {
      assert.match(p.stylesXml, new RegExp(`w:styleId="Heading${i}">`));
    }
    // Heading 1-3 sind sofort im Katalog sichtbar (kein unhideWhenUsed)
    assert.match(
      p.stylesXml,
      /w:styleId="Heading1">.*?<w:uiPriority w:val="9"\/><w:qFormat\/>/,
    );
    assert.match(
      p.stylesXml,
      /w:styleId="Heading3">.*?<w:uiPriority w:val="9"\/><w:qFormat\/>/,
    );
    // Heading 4-9 haben unhideWhenUsed vor qFormat
    assert.match(
      p.stylesXml,
      /w:styleId="Heading4">.*?<w:uiPriority w:val="9"\/><w:unhideWhenUsed\/><w:qFormat\/>/,
    );
    assert.match(
      p.stylesXml,
      /w:styleId="Heading9">.*?<w:uiPriority w:val="9"\/><w:unhideWhenUsed\/><w:qFormat\/>/,
    );
    assert.match(
      p.stylesXml,
      /w:styleId="Heading1">.*<w:numPr><w:ilvl w:val="0"\/><w:numId w:val="1"\/><\/w:numPr><w:outlineLvl w:val="0"\/>/,
    );
    // jede Ebene auf ihrem ilvl, sonst nummerieren alle Vorlagen auf Ebene 0
    assert.match(
      p.stylesXml,
      /w:styleId="Heading2">.*<w:numPr><w:ilvl w:val="1"\/><w:numId w:val="1"\/>/,
    );
    assert.match(
      p.stylesXml,
      /w:styleId="Heading9">.*<w:numPr><w:ilvl w:val="8"\/><w:numId w:val="1"\/>/,
    );
  });
  it("document.xml enthaelt Koerper und Seitengroesse", () => {
    assert.match(p.documentXml, /<w:body>.*<w:sectPr><w:pgSz /);
  });
  it("Content_Types und Relationships", () => {
    assert.match(p.contentTypesXml, /PartName="\/word\/document\.xml"/);
    assert.match(p.contentTypesXml, /numbering\+xml/);
    assert.match(p.rootRelsXml, /officeDocument" Target="word\/document\.xml"/);
    assert.match(p.docRelsXml, /styles" Target="styles\.xml"/);
    assert.match(p.docRelsXml, /numbering" Target="numbering\.xml"/);
  });
});

describe("odtBody", () => {
  it("schreibt text:h mit outline-level und Heading_20_N", () => {
    const body = odtBody([node("Einleitung", [node("Hintergrund")])]);
    assert.match(
      body,
      /<text:h text:style-name="Heading_20_1" text:outline-level="1">Einleitung<\/text:h>/,
    );
    assert.match(
      body,
      /<text:h text:style-name="Heading_20_2" text:outline-level="2">Hintergrund<\/text:h>/,
    );
  });
  it("begrenzt auf Ebene 9 und escapet Sonderzeichen", () => {
    let n = node("E1");
    const top = n;
    for (let i = 2; i <= 11; i++) {
      const child = node(`E${i}`);
      n.children.push(child);
      n = child;
    }
    const body = odtBody([top]);
    assert.doesNotMatch(body, /outline-level="1[0-9]"/);
    assert.equal([...body.matchAll(/outline-level="9"/g)].length, 3);
    assert.match(odtBody([node("A & B")]), /A &amp; B/);
  });
});

describe("buildOdtParts", () => {
  const p = buildOdtParts([node("Einleitung")]);
  it("outline-style mit 9 Nummerierungsebenen", () => {
    const s = odtOutlineStyle();
    assert.equal([...s.matchAll(/<text:list-level-style-number /g)].length, 9);
    assert.match(p.stylesXml, /<text:outline-style style:name="Outline">/);
  });
  it("Heading-Vorlagen mit display-name", () => {
    assert.match(
      p.stylesXml,
      /style:name="Heading_20_1" style:display-name="Heading 1"/,
    );
    assert.match(p.stylesXml, /style:name="Heading_20_9"/);
  });
  it("manifest und mimetype", () => {
    assert.equal(p.mimetype, ODT_MIMETYPE);
    assert.match(p.manifestXml, /manifest:full-path="content\.xml"/);
    assert.match(p.manifestXml, /manifest:full-path="styles\.xml"/);
    assert.match(p.contentXml, /office:body><office:text>/);
  });
});
