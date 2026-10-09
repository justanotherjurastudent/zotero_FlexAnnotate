import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHeadings,
  parseDocxHeadings,
  parseOdtHeadings,
  planOutlineImport,
  type DocHeading,
} from "../src/core/docOutline.ts";
import { makeNode, type OutlineNode } from "../src/core/outline.ts";

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function doc(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`;
}

function p(style: string | null, text: string): string {
  const ppr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${ppr}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
}

function styleDef(id: string, name: string, pPr = "", basedOn = ""): string {
  const base = basedOn ? `<w:basedOn w:val="${basedOn}"/>` : "";
  return `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${base}<w:pPr>${pPr}</w:pPr></w:style>`;
}

function styles(...defs: string[]): string {
  return `<?xml version="1.0"?><w:styles ${W}>${defs.join("")}</w:styles>`;
}

const DE_STYLES = styles(
  styleDef("berschrift1", "heading 1", '<w:outlineLvl w:val="0"/>'),
  styleDef("berschrift2", "heading 2", '<w:outlineLvl w:val="1"/>'),
);

function odt(body: string): string {
  return `<?xml version="1.0"?><office:document-content xmlns:office="o" xmlns:text="t" xmlns:xlink="x"><office:body><office:text>${body}</office:text></office:body></office:document-content>`;
}

function node(title: string, children: OutlineNode[] = []): OutlineNode {
  return { ...makeNode(title), children };
}

describe("parseDocxHeadings", () => {
  it("erkennt deutsche Vorlagen (styleId berschrift1, name heading 1)", () => {
    const xml = doc(
      p("berschrift1", "Einleitung") +
        p("berschrift2", "Begriff") +
        p(null, "Text"),
    );
    assert.deepEqual(parseDocxHeadings(xml, DE_STYLES), [
      { level: 1, text: "Einleitung" },
      { level: 2, text: "Begriff" },
    ]);
  });

  it("erkennt englische Vorlagen (Heading1/Heading2)", () => {
    const st = styles(
      styleDef("Heading1", "heading 1"),
      styleDef("Heading2", "heading 2"),
    );
    const xml = doc(p("Heading1", "A") + p("Heading2", "B"));
    assert.deepEqual(parseDocxHeadings(xml, st), [
      { level: 1, text: "A" },
      { level: 2, text: "B" },
    ]);
  });

  it("uebernimmt Ebene aus outlineLvl im Stil, auch ueber basedOn", () => {
    const st = styles(
      styleDef("Eigen", "Eigen", '<w:outlineLvl w:val="0"/>'),
      styleDef("Sub", "Sub Stil", "", "Eigen"),
      styleDef("MeinKap", "Mein Kapitel", "", "Heading2"),
      styleDef("Heading2", "heading 2"),
    );
    const xml = doc(
      p("Eigen", "Kap") + p("Sub", "Unter") + p("MeinKap", "Abschnitt"),
    );
    assert.deepEqual(parseDocxHeadings(xml, st), [
      { level: 1, text: "Kap" },
      { level: 1, text: "Unter" },
      { level: 2, text: "Abschnitt" },
    ]);
  });

  it("erkennt outlineLvl direkt im Absatz", () => {
    const xml = doc(
      `<w:p><w:pPr><w:outlineLvl w:val="2"/></w:pPr><w:r><w:t>Tief</w:t></w:r></w:p>`,
    );
    assert.deepEqual(parseDocxHeadings(xml), [{ level: 3, text: "Tief" }]);
  });

  it("outlineLvl 9 (Fliesstext) ist keine Ueberschrift, auch bei Heading-Stil", () => {
    const xml = doc(
      `<w:p><w:pPr><w:pStyle w:val="berschrift1"/><w:outlineLvl w:val="9"/></w:pPr><w:r><w:t>Text</w:t></w:r></w:p>`,
    );
    assert.deepEqual(parseDocxHeadings(xml, DE_STYLES), []);
  });

  it("Title, Titel und Subtitle sind keine Ueberschriften", () => {
    const st = styles(
      styleDef("Title", "Title"),
      styleDef("Titel", "Titel"),
      styleDef("Subtitle", "Subtitle"),
    );
    const xml = doc(p("Title", "T") + p("Titel", "T2") + p("Subtitle", "S"));
    assert.deepEqual(parseDocxHeadings(xml, st), []);
  });

  it("zyklische basedOn-Ketten brechen ab", () => {
    const st = styles(
      styleDef("A", "Alpha", "", "B"),
      styleDef("B", "Beta", "", "A"),
    );
    assert.deepEqual(parseDocxHeadings(doc(p("A", "X")), st), []);
  });

  it("ignoriert geloeschten Text bei Aenderungsverfolgung, behaelt eingefuegten", () => {
    const xml = doc(
      `<w:p><w:pPr><w:pStyle w:val="berschrift1"/></w:pPr>` +
        `<w:del w:id="1"><w:r><w:delText>alt </w:delText></w:r></w:del>` +
        `<w:ins w:id="2"><w:r><w:t>neu</w:t></w:r></w:ins>` +
        `<w:del w:id="3"><w:r><w:t>weg</w:t></w:r></w:del></w:p>`,
    );
    assert.deepEqual(parseDocxHeadings(xml, DE_STYLES), [
      { level: 1, text: "neu" },
    ]);
  });

  it("uebernimmt Text aus Hyperlinks", () => {
    const xml = doc(
      `<w:p><w:pPr><w:pStyle w:val="berschrift1"/></w:pPr><w:hyperlink r:id="r1"><w:r><w:t>Link</w:t></w:r></w:hyperlink><w:r><w:t> Text</w:t></w:r></w:p>`,
    );
    assert.deepEqual(parseDocxHeadings(xml, DE_STYLES), [
      { level: 1, text: "Link Text" },
    ]);
  });

  it("wandelt Tab und Umbruch in Leerzeichen, Tabstopps im pPr zaehlen nicht", () => {
    const xml = doc(
      `<w:p><w:pPr><w:pStyle w:val="berschrift1"/><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr>` +
        `<w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r></w:p>`,
    );
    assert.deepEqual(parseDocxHeadings(xml, DE_STYLES), [
      { level: 1, text: "A B C" },
    ]);
  });

  it("dekodiert Entities inkl. numerischer Referenzen", () => {
    const xml = doc(
      `<w:p><w:pPr><w:pStyle w:val="berschrift1"/></w:pPr><w:r><w:t>Q&amp;A &lt;x&gt; &quot;y&quot; &apos;z&apos; &#228; &#xDF; &amp;lt;</w:t></w:r></w:p>`,
    );
    assert.deepEqual(parseDocxHeadings(xml, DE_STYLES), [
      { level: 1, text: `Q&A <x> "y" 'z' ä ß &lt;` },
    ]);
  });

  it("ueberspringt leere und nur aus Leerraum bestehende Ueberschriften", () => {
    const xml = doc(
      p("berschrift1", "") + p("berschrift1", "   ") + p("berschrift1", "Da"),
    );
    assert.deepEqual(parseDocxHeadings(xml, DE_STYLES), [
      { level: 1, text: "Da" },
    ]);
  });

  it("ohne stylesXml greift der styleId-Fallback", () => {
    const xml = doc(
      p("Heading2", "Zwei") +
        p("berschrift1", "Eins") +
        p("Titre3", "Drei") +
        p("Standard", "Nein"),
    );
    assert.deepEqual(parseDocxHeadings(xml), [
      { level: 2, text: "Zwei" },
      { level: 1, text: "Eins" },
      { level: 3, text: "Drei" },
    ]);
  });

  it("Feldbefehle (instrText) gehoeren nicht zum Titel", () => {
    const xml = doc(
      `<w:p><w:pPr><w:pStyle w:val="berschrift1"/></w:pPr><w:r><w:instrText>HYPERLINK "x"</w:instrText></w:r><w:r><w:t>T</w:t></w:r></w:p>`,
    );
    assert.deepEqual(parseDocxHeadings(xml, DE_STYLES), [
      { level: 1, text: "T" },
    ]);
  });
});

describe("parseOdtHeadings", () => {
  it("liest outline-level, verschachtelte spans, Leerzeichen und ignoriert Fussnoten", () => {
    const xml = odt(
      `<text:h text:outline-level="2">Teil <text:span><text:a xlink:href="x">Eins</text:a></text:span>` +
        `<text:s text:c="2"/>Zwei<text:note text:id="f1"><text:note-citation>1</text:note-citation>` +
        `<text:note-body><text:p>Fussnote</text:p></text:note-body></text:note></text:h>`,
    );
    assert.deepEqual(parseOdtHeadings(xml), [
      { level: 2, text: "Teil Eins Zwei" },
    ]);
  });

  it("Default-Ebene ist 1, Tab und Zeilenumbruch werden Leerzeichen", () => {
    const xml = odt(
      `<text:h>Ohne<text:tab/>Ebene</text:h><text:h text:outline-level="3">A<text:line-break/>B</text:h>`,
    );
    assert.deepEqual(parseOdtHeadings(xml), [
      { level: 1, text: "Ohne Ebene" },
      { level: 3, text: "A B" },
    ]);
  });

  it("geloeschte Bereiche (text:deletion) werden ausgelassen", () => {
    const xml = odt(
      `<text:changed-region><text:deletion><text:p><text:h text:outline-level="1">Geloescht</text:h></text:p></text:deletion></text:changed-region>` +
        `<text:h text:outline-level="1">Bleibt</text:h>`,
    );
    assert.deepEqual(parseOdtHeadings(xml), [{ level: 1, text: "Bleibt" }]);
  });
});

describe("normalizeHeadings", () => {
  it("macht Ebenensprung 1 -> 3 zu 1 -> 2", () => {
    const r = normalizeHeadings([
      { level: 1, text: "A" },
      { level: 3, text: "B" },
    ]);
    assert.deepEqual(
      r.items.map((h) => h.level),
      [1, 2],
    );
    assert.equal(r.levelsFixed, 1);
  });

  it("setzt eine erste Ueberschrift auf Ebene 2 auf Ebene 1", () => {
    const r = normalizeHeadings([
      { level: 2, text: "A" },
      { level: 2, text: "B" },
    ]);
    assert.deepEqual(
      r.items.map((h) => h.level),
      [1, 2],
    );
    assert.equal(r.levelsFixed, 1);
  });

  it("erkennt manuelle Nummerierung und entfernt sie bei stripNumbering", () => {
    const input: DocHeading[] = [
      { level: 1, text: "1. Einleitung" },
      { level: 2, text: "1.1 Begriff" },
      { level: 2, text: "1.2 Ziel" },
      { level: 1, text: "2. Hauptteil" },
    ];
    const r = normalizeHeadings(input, { stripNumbering: true });
    assert.equal(r.numberingDetected, true);
    assert.equal(r.numberingStripped, true);
    assert.deepEqual(
      r.items.map((h) => h.text),
      ["Einleitung", "Begriff", "Ziel", "Hauptteil"],
    );
  });

  it("ohne stripNumbering bleibt der Text, Erkennung wird trotzdem gemeldet", () => {
    const r = normalizeHeadings([
      { level: 1, text: "A. Erstens" },
      { level: 1, text: "B. Zweitens" },
      { level: 1, text: "c) Drittens" },
    ]);
    assert.equal(r.numberingDetected, true);
    assert.equal(r.numberingStripped, false);
    assert.equal(r.items[0].text, "A. Erstens");
  });

  it("'Kapitel 1', 'Teil 2' und '§ 3' gelten nicht als Nummerierung", () => {
    const r = normalizeHeadings(
      [
        { level: 1, text: "Kapitel 1 Grundlagen" },
        { level: 1, text: "Teil 2" },
        { level: 1, text: "§ 3 Recht" },
      ],
      { stripNumbering: true },
    );
    assert.equal(r.numberingDetected, false);
    assert.equal(r.numberingStripped, false);
    assert.equal(r.items[0].text, "Kapitel 1 Grundlagen");
  });

  it("Erkennung braucht mindestens 3 Ueberschriften", () => {
    const r = normalizeHeadings([
      { level: 1, text: "1. A" },
      { level: 1, text: "2. B" },
    ]);
    assert.equal(r.numberingDetected, false);
  });

  it("stripNumbering erzeugt nie einen leeren Titel", () => {
    const r = normalizeHeadings(
      [
        { level: 1, text: "1. A" },
        { level: 1, text: "2. B" },
        { level: 1, text: "3. C" },
        { level: 1, text: "4. D" },
        { level: 1, text: "5." },
      ],
      { stripNumbering: true },
    );
    assert.equal(r.numberingDetected, true);
    assert.ok(r.items.every((h) => h.text.trim().length > 0));
    assert.equal(r.items[4].text, "5.");
  });
});

describe("planOutlineImport", () => {
  it("legt bei leerer Gliederung alles neu an", () => {
    const plan = planOutlineImport(
      [],
      [
        { level: 1, text: "A" },
        { level: 2, text: "A1" },
        { level: 2, text: "A2" },
        { level: 1, text: "B" },
      ],
    );
    assert.equal(plan.created, 4);
    assert.equal(plan.reused, 0);
    assert.equal(plan.renamed, 0);
    assert.deepEqual(
      plan.ops.map((o) => [o.kind, o.title, o.parentTitle]),
      [
        ["create", "A", null],
        ["create", "A1", "A"],
        ["create", "A2", "A"],
        ["create", "B", null],
      ],
    );
  });

  it("verwendet vorhandene Knoten unter gleichem Elternknoten wieder", () => {
    const existing = [node("Einleitung", [node("Altes")])];
    const plan = planOutlineImport(existing, [
      { level: 1, text: "Einleitung" },
      { level: 2, text: "Begriff" },
    ]);
    assert.equal(plan.reused, 1);
    assert.equal(plan.created, 1);
    assert.deepEqual(plan.ops[0], {
      kind: "reuse",
      title: "Einleitung",
      level: 1,
      parentTitle: null,
      id: existing[0].id,
    });
    assert.deepEqual(plan.ops[1], {
      kind: "create",
      title: "Begriff",
      level: 2,
      parentTitle: "Einleitung",
      id: null,
    });
  });

  it("doppelter Titel im Dokument bekommt ' (2)'", () => {
    const plan = planOutlineImport(
      [],
      [
        { level: 1, text: "Einleitung" },
        { level: 1, text: "Einleitung" },
      ],
    );
    assert.equal(plan.renamed, 1);
    assert.deepEqual(plan.renames, [
      { from: "Einleitung", to: "Einleitung (2)" },
    ]);
    assert.equal(plan.ops[1].title, "Einleitung (2)");
    assert.equal(plan.created, 2);
  });

  it("Titel existiert an anderer Stelle der Gliederung -> ' (2)'", () => {
    const existing = [
      node("Hauptteil"),
      node("Anderswo", [node("Einleitung")]),
    ];
    const plan = planOutlineImport(existing, [
      { level: 1, text: "Hauptteil" },
      { level: 2, text: "Einleitung" },
    ]);
    assert.equal(plan.reused, 1);
    assert.deepEqual(plan.renames, [
      { from: "Einleitung", to: "Einleitung (2)" },
    ]);
    assert.equal(plan.ops[1].parentTitle, "Hauptteil");
  });

  it("prueft gegen bestehende und bereits geplante Titel (Zaehler springt weiter)", () => {
    const existing = [
      node("Hauptteil"),
      node("Anderswo", [node("Einleitung"), node("Einleitung (2)")]),
    ];
    const plan = planOutlineImport(existing, [
      { level: 1, text: "Hauptteil" },
      { level: 2, text: "Einleitung" },
    ]);
    assert.equal(plan.ops[1].title, "Einleitung (3)");
  });

  it("Unicode-NFD, Gross/Kleinschreibung und Leerraum gelten als gleicher Titel", () => {
    const existing = [node("Ärger")]; // "Ärger" in NFD
    const plan = planOutlineImport(existing, [{ level: 1, text: "  ÄRGER  " }]);
    assert.equal(plan.reused, 1);
    assert.equal(plan.created, 0);
    assert.equal(plan.renamed, 0);
  });

  it("leerer Input ergibt leeren Plan", () => {
    const plan = planOutlineImport([], []);
    assert.deepEqual(plan, {
      ops: [],
      created: 0,
      reused: 0,
      renamed: 0,
      renames: [],
    });
  });

  it("Plan-Ebenen werden begrenzt: erste Ueberschrift landet an der Wurzel", () => {
    const plan = planOutlineImport([], [{ level: 2, text: "X" }]);
    assert.deepEqual(plan.ops[0], {
      kind: "create",
      title: "X",
      level: 1,
      parentTitle: null,
      id: null,
    });
  });
});
