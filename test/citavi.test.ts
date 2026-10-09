import { assert } from "chai";
import { config } from "../package.json";
import { cleanup, created, makePdfAttachment, makeWork } from "./helpers";

/**
 * Citavi import in a real Zotero. The translation object is a fake built around a real
 * DOM and Zotero.Utilities: the Citavi translator is not installed in the test profile,
 * so Zotero's own translate() cannot be triggered here. All data is synthetic.
 */

const api = () => (Zotero as any)[config.addonInstance].api;
const prefs = `${config.prefsPrefix}`;
const keepNotesPref = `${prefs}.citaviKeepNotes`;

/**
 * Synthetic Citavi export in the shape of docs/architecture.md "Citavi export format".
 * PageRange holds escaped markup, so the text content contains literal <os>/<nt> tags.
 */
const FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<CitaviExchangeData Version="7.4.0.0">
  <KnowledgeItems>
    <KnowledgeItem id="K1">
      <ReferenceID>R1</ReferenceID>
      <CoreStatement>Kernaussage eins</CoreStatement>
      <Text>Wörtliches Zitat eins</Text>
      <QuotationType>1</QuotationType>
      <PageRange>&lt;sp&gt; &lt;n&gt;128&lt;/n&gt; &lt;nt&gt;Margin&lt;/nt&gt; &lt;os&gt;128&lt;/os&gt; &lt;/sp&gt;</PageRange>
      <PageRangeNumber>128</PageRangeNumber>
    </KnowledgeItem>
    <KnowledgeItem id="K2">
      <ReferenceID>R2</ReferenceID>
      <CoreStatement>Kern zwei</CoreStatement>
      <Text>Zitat zwei</Text>
      <QuotationType>1</QuotationType>
      <PageRange>&lt;sp&gt; &lt;n&gt;5&lt;/n&gt; &lt;os&gt;5&lt;/os&gt; &lt;/sp&gt;</PageRange>
      <PageRangeNumber>5</PageRangeNumber>
    </KnowledgeItem>
    <KnowledgeItem id="K3">
      <ReferenceID>R1</ReferenceID>
      <CoreStatement>Indirekte Aussage</CoreStatement>
      <Text>Original</Text>
      <QuotationType>2</QuotationType>
      <PageRangeNumber>-1</PageRangeNumber>
    </KnowledgeItem>
    <KnowledgeItem id="K4">
      <ReferenceID>R9</ReferenceID>
      <CoreStatement>Unbekannte Quelle</CoreStatement>
    </KnowledgeItem>
    <KnowledgeItem id="K5">
      <ReferenceID>R1</ReferenceID>
      <CoreStatement></CoreStatement>
      <Text></Text>
      <QuotationType>1</QuotationType>
    </KnowledgeItem>
  </KnowledgeItems>
  <KnowledgeItemKeywords>
    <OnetoN>K10:x;KW3:x</OnetoN>
    <OnetoN>K1:x;KW1:x;KW2:x</OnetoN>
  </KnowledgeItemKeywords>
  <Keywords>
    <Keyword id="KW1"><Name>Schlagwort eins</Name></Keyword>
    <Keyword id="KW2"><Name>Schlagwort zwei</Name></Keyword>
    <Keyword id="KW3"><Name>Schlagwort drei</Name></Keyword>
  </Keywords>
  <EntityLinks>
    <EntityLink><SourceID>K2</SourceID></EntityLink>
  </EntityLinks>
  <ReferenceReferences>
    <OnetoN>R3;R1;R2</OnetoN>
  </ReferenceReferences>
</CitaviExchangeData>`;

/** Stands in for Zotero's Translate.Import object: the members the import reads. */
function fakeTranslation(
  xml: string,
  idMap: Record<string, number>,
): Record<string, any> {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return {
    translator: [{ label: "Citavi 6 XML" }],
    _itemSaver: { _IDMap: idMap },
    _io: { init() {} },
    _sandboxZotero: { getXML: () => doc, Utilities: Zotero.Utilities },
  };
}

describe("citavi import", function () {
  this.timeout(60000);
  let originalKeepNotes: boolean;
  let works: { a: Zotero.Item; b: Zotero.Item; c: Zotero.Item };
  let idMap: Record<string, number>;

  before(async function () {
    originalKeepNotes = Zotero.Prefs.get(keepNotesPref, true) as boolean;
    Zotero.Prefs.set(
      `${config.prefsPrefix}.keepEmptyPlaceholders`,
      false,
      true,
    );
  });

  beforeEach(async function () {
    // Source A: print work without attachment. B: has a PDF (anchored quote handled
    // by Zotero). C: parent of the contributions.
    const a = await makeWork("Druckwerk A");
    const b = await makeWork("Werk B mit PDF");
    await makePdfAttachment(b);
    const c = await makeWork("Hauptwerk C");
    works = { a, b, c };
    idMap = { R1: a.id, R2: b.id, R3: c.id };
    Zotero.Prefs.set(keepNotesPref, false, true);
  });

  afterEach(async function () {
    await cleanup();
  });

  after(async function () {
    Zotero.Prefs.set(keepNotesPref, originalKeepNotes, true);
    Zotero.Prefs.clear(`${config.prefsPrefix}.keepEmptyPlaceholders`, true);
  });

  const annotationsOf = (work: Zotero.Item) =>
    Zotero.Items.get(work.getAttachments())
      .filter((att: Zotero.Item) => api().print.placeholder.isPlaceholder(att))
      .flatMap((att: Zotero.Item) => att.getAnnotations()) as Zotero.Item[];

  it("creates print annotations for unanchored quotes and reports the skip reasons", async function () {
    const result = await api().citavi.importPrintQuotes(
      fakeTranslation(FIXTURE, idMap),
    );
    // K1 and K3 are created; K2 (anchored, PDF) is left to Zotero; K4 has no item;
    // K5 has no text and no comment.
    assert.equal(result.created, 2);
    assert.equal(result.duplicates, 0);

    const anns = annotationsOf(works.a);
    assert.lengthOf(anns, 2);
    const byText = (t: string) => anns.find((x) => x.annotationText === t)!;

    const direct = byText("Wörtliches Zitat eins");
    assert.equal(direct.annotationComment, "Kernaussage eins");
    assert.equal(direct.annotationPageLabel, "128");
    assert.equal(direct.annotationColor, "#2ea8e5");
    assert.equal(api().print.printAnnotations.getLocator(direct), "paragraph");
    const tags = direct.getTags().map((t: { tag: string }) => t.tag);
    assert.include(tags, "Schlagwort eins");
    assert.include(tags, "Schlagwort zwei");
    // K10 is listed first in the OnetoN section and shares the prefix "K1"
    assert.notInclude(tags, "Schlagwort drei");

    // Indirect quote (type 2): the core statement becomes the text, the quote the comment.
    const indirect = byText("Indirekte Aussage");
    assert.equal(indirect.annotationComment, "Original");
    assert.equal(indirect.annotationColor, "#a6507b");
    // Zotero stores an empty page label as null (xpcom/data/item.js:2290)
    assert.isNull(indirect.annotationPageLabel);
  });

  it("skips quotes already annotated on a second import", async function () {
    const first = await api().citavi.importPrintQuotes(
      fakeTranslation(FIXTURE, idMap),
    );
    assert.equal(first.created, 2);

    const second = await api().citavi.importPrintQuotes(
      fakeTranslation(FIXTURE, idMap),
    );
    assert.equal(second.created, 0);
    assert.equal(second.duplicates, 2, "K1 and K3 are duplicates");
    assert.lengthOf(annotationsOf(works.a), 2);
  });

  it("creates a quote again when its page differs from the existing one", async function () {
    await api().citavi.importPrintQuotes(fakeTranslation(FIXTURE, idMap));

    // PageRange is escaped in the XML, so the replaced text is the escaped form
    const moved = FIXTURE.replace(
      "&lt;os&gt;128&lt;/os&gt;",
      "&lt;os&gt;129&lt;/os&gt;",
    );
    assert.notEqual(moved, FIXTURE, "the page change reached the fixture");
    const result = await api().citavi.importPrintQuotes(
      fakeTranslation(moved, idMap),
    );
    assert.equal(result.created, 1, "K1 on page 129 is new");
    assert.equal(result.duplicates, 1, "K3 is still a duplicate");
    const pages = annotationsOf(works.a).map((a) => a.annotationPageLabel);
    assert.sameMembers(pages, ["128", "129", null]);
  });

  it("removes the translator note only when citaviKeepNotes is off", async function () {
    const noteHtml =
      "<h1>Kernaussage eins</h1>\n<p>Wörtliches Zitat eins</p>\n<i>128</i>";
    const makeNote = async () => {
      const note = new Zotero.Item("note");
      note.libraryID = works.a.libraryID;
      note.parentID = works.a.id;
      note.setNote(noteHtml);
      await note.saveTx();
      created.push(note);
      return note;
    };

    await makeNote();
    await api().citavi.importPrintQuotes(fakeTranslation(FIXTURE, idMap));
    assert.lengthOf(works.a.getNotes(), 0, "note removed with keepNotes off");

    Zotero.Prefs.set(keepNotesPref, true, true);
    await makeNote();
    await api().citavi.importPrintQuotes(fakeTranslation(FIXTURE, idMap));
    assert.lengthOf(works.a.getNotes(), 1, "note kept with keepNotes on");
  });

  it("links the contribution group with its parent and among siblings", async function () {
    const linked = await api().citavi.linkContributions(
      fakeTranslation(FIXTURE, idMap),
    );
    assert.equal(linked, 3);
    const keys = (item: Zotero.Item) => item.relatedItems as string[];
    assert.include(keys(works.c), works.a.key);
    assert.include(keys(works.c), works.b.key);
    assert.include(keys(works.a), works.b.key);
    assert.include(keys(works.a), works.c.key);
  });

  it("patches translate once, tolerates a double start and restores on stop", function () {
    const proto = (Zotero as any).Translate.Import.prototype;
    const feature = api().citavi.feature;
    // The plugin already patched translate at startup: begin from the unpatched state.
    feature.stop();
    try {
      const before = proto.translate;

      feature.start();
      const patched = proto.translate;
      assert.notEqual(patched, before, "start installs the patch");

      feature.start();
      assert.equal(
        proto.translate,
        patched,
        "second start does not wrap again",
      );

      feature.stop();
      assert.equal(proto.translate, before, "stop restores the original");
    } finally {
      feature.start();
    }
  });

  it("sequences the pass on a window's file interface and restores it", function () {
    const fileInterface = {
      importFile: async () => "file",
      importFromClipboard: async () => "clip",
    };
    const originalFile = fileInterface.importFile;
    const win = {
      Zotero_File_Interface: fileInterface,
      location: { href: "chrome://test/" },
    } as unknown as Window;

    api().citavi.feature.addToWindow(win);
    assert.notEqual(fileInterface.importFile, originalFile);

    api().citavi.feature.removeFromWindow(win);
    assert.equal(fileInterface.importFile, originalFile);
  });
});
