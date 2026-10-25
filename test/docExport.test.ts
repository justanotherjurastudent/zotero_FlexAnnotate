import { assert } from "chai";
import { config } from "../package.json";
import { lockFile, lastLockError } from "./helpers";
import { files } from "./docFixtures";

/**
 * Outline export as .docx/.odt in real Zotero. File picker is
 * bypassed (exportTo directly); roundtrip reads the exported file back
 * via import, and the exported XML parts additionally via strict DOMParser.
 */

const api = () => (Zotero as any)[config.addonInstance].api;

describe("docExport", function () {
  this.timeout(60000);
  const messages: string[] = [];
  const opened: string[] = [];
  const states: any[] = [];
  let oldAlert: any;
  let oldOpen: any;

  const fresh = (roots: any[] = []) => {
    const s = {
      libraryID: Zotero.Libraries.userLibraryID,
      noteID: null as number | null,
      roots,
      saveChain: Promise.resolve(),
      saveLog: [] as string[],
    };
    states.push(s);
    return s;
  };

  const shape = (ns: any[]): unknown =>
    ns.map((n) => [n.title, shape(n.children)]);

  before(function () {
    oldAlert = api().docExport.alert;
    api().docExport.alert = (_w: unknown, text: string) => messages.push(text);
    oldOpen = api().docExport.openDocument;
    api().docExport.openDocument = (path: string) => opened.push(path);
  });

  beforeEach(function () {
    messages.length = 0;
    opened.length = 0;
  });

  after(async function () {
    api().docExport.alert = oldAlert;
    api().docExport.openDocument = oldOpen;
    for (const s of states) {
      await s.saveChain;
      if (s.noteID) {
        try {
          await (Zotero.Items.get(s.noteID) as Zotero.Item).eraseTx();
        } catch {
          // already gone
        }
      }
    }
    for (const f of files) await IOUtils.remove(f, { ignoreAbsent: true });
  });

  const core = () => api().outline;

  const sample = () => {
    const roots = [core().makeNode("Einleitung"), core().makeNode("Hauptteil")];
    roots[0].children.push(core().makeNode("Hintergrund"));
    roots[0].children[0].children.push(core().makeNode("Stand"));
    return roots;
  };

  const tempPath = (name: string) => PathUtils.join(PathUtils.tempDir, name);

  /** Read entries of a ZIP file as {Name: Text} (nsIZipReader). */
  const readZip = (path: string): Record<string, string> => {
    const zr = (Components.classes as any)[
      "@mozilla.org/libjar/zip-reader;1"
    ].createInstance(Components.interfaces.nsIZipReader);
    zr.open(Zotero.File.pathToFile(path));
    try {
      const out: Record<string, string> = {};
      const names = zr.findEntries("*");
      while (names.hasMore()) {
        const entry = names.getNext();
        // Directory entries (trailing "/") only provide a listing
        if (entry.endsWith("/")) continue;
        out[entry] = Zotero.File.getContents(zr.getInputStream(entry), "UTF-8");
      }
      return out;
    } finally {
      zr.close();
    }
  };

  const assertNoXmlError = (xml: string) => {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    assert.isNull(doc.querySelector("parsererror"), xml.slice(0, 200));
  };

  it("exportiert als DOCX und liest den Import wieder ein", async function () {
    const roots = sample();
    const path = tempPath("flexannotate-export-roundtrip.docx");
    files.push(path);
    const r = await api().docExport.exportTo(roots, { path, format: "docx" });
    assert.equal(r.status, "exported");
    assert.equal(r.count, 4);
    // Valid XML (strict validation, not the lenient import scanner)
    const entries = readZip(path);
    for (const name of Object.keys(entries)) assertNoXmlError(entries[name]);
    assert.deepEqual(Object.keys(entries).sort(), [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
      "word/document.xml",
      "word/numbering.xml",
      "word/styles.xml",
    ]);
    // Roundtrip: import reads back the same titles and levels
    const s = fresh();
    const r2 = await api().docImport.importFromFile(
      { s, render() {} },
      Zotero.File.pathToFile(path),
      { confirm: () => true, stripNumbering: true },
    );
    assert.equal(r2.status, "imported");
    assert.equal(r2.plan.created, 4);
    assert.deepEqual(shape(s.roots), [
      ["Einleitung", [["Hintergrund", [["Stand", []]]]]],
      ["Hauptteil", []],
    ]);
  });

  it("exportiert als ODT mit mimetype zuerst und liest den Import wieder ein", async function () {
    const roots = sample();
    const path = tempPath("flexannotate-export-roundtrip.odt");
    files.push(path);
    const r = await api().docExport.exportTo(roots, { path, format: "odt" });
    assert.equal(r.status, "exported");
    const entries = readZip(path);
    for (const name of Object.keys(entries)) {
      // mimetype is not XML
      if (name !== "mimetype") assertNoXmlError(entries[name]);
    }
    assert.include(Object.keys(entries), "mimetype");
    assert.include(entries["mimetype"], "opendocument.text");
    const s = fresh();
    const r2 = await api().docImport.importFromFile(
      { s, render() {} },
      Zotero.File.pathToFile(path),
      { confirm: () => true, stripNumbering: true },
    );
    assert.equal(r2.status, "imported");
    assert.equal(r2.plan.created, 4);
    assert.deepEqual(shape(s.roots), [
      ["Einleitung", [["Hintergrund", [["Stand", []]]]]],
      ["Hauptteil", []],
    ]);
  });

  it("DOCX traegt Heading-Formatvorlagen und die mehrstufige Nummerierung", async function () {
    const path = tempPath("flexannotate-export-styles.docx");
    files.push(path);
    await api().docExport.exportTo(sample(), { path, format: "docx" });
    const entries = readZip(path);
    const documentXml = entries["word/document.xml"];
    assert.match(documentXml, /<w:pStyle w:val="Heading1"\/>[^]*?Einleitung/);
    assert.match(documentXml, /<w:pStyle w:val="Heading2"\/>[^]*?Hintergrund/);
    assert.match(documentXml, /<w:pStyle w:val="Heading3"\/>[^]*?Stand/);
    const stylesXml = entries["word/styles.xml"];
    assert.match(
      stylesXml,
      /w:styleId="Heading1"[^]*?<w:name w:val="heading 1"\/>/,
    );
    assert.match(stylesXml, /<w:outlineLvl w:val="0"\/>/);
    const numberingXml = entries["word/numbering.xml"];
    assert.match(numberingXml, /<w:lvlText w:val="%1\.%2"\/>/);
    assert.match(numberingXml, /<w:pStyle w:val="Heading2"\/>/);
  });

  it("ODT traegt text:h mit outline-level und die Gliederungsnummerierung", async function () {
    const path = tempPath("flexannotate-export-styles.odt");
    files.push(path);
    await api().docExport.exportTo(sample(), { path, format: "odt" });
    const entries = readZip(path);
    const contentXml = entries["content.xml"];
    assert.match(
      contentXml,
      /<text:h text:style-name="Heading_20_1" text:outline-level="1">Einleitung<\/text:h>/,
    );
    const stylesXml = entries["styles.xml"];
    assert.match(stylesXml, /<text:outline-style style:name="Outline">/);
    assert.match(stylesXml, /style:num-format="1"/);
  });

  it("meldet eine leere Gliederung", async function () {
    const path = tempPath("flexannotate-export-empty.docx");
    files.push(path);
    const r = await api().docExport.exportTo([], { path, format: "docx" });
    assert.equal(r.status, "empty");
    assert.match(messages[0], /keine Überschriften|no headings/i);
  });

  it("meldet eine gesperrte Zieldatei, ohne sie zu veraendern", async function () {
    const path = tempPath("flexannotate-export-locked.docx");
    files.push(path);
    const r = await api().docExport.exportTo(sample(), {
      path,
      format: "docx",
    });
    assert.equal(r.status, "exported");
    const before = await IOUtils.read(path);
    const lock = lockFile(path);
    // File lock requires kernel32 (Windows only); skip elsewhere.
    if (!lock && !Zotero.isWin) return this.skip();
    if (!lock) assert.fail(`lockFile null: ${lastLockError}`);
    try {
      const r2 = await api().docExport.exportTo(sample(), {
        path,
        format: "docx",
      });
      assert.equal(r2.status, "error");
      assert.include(messages[0], "flexannotate-export-locked.docx");
      assert.match(
        messages[0],
        /geöffnet|schreibgeschützt|open in Word|read-only/,
      );
    } finally {
      lock.close();
    }
    // Only readable after unlock: nothing was overwritten
    assert.deepEqual(await IOUtils.read(path), before);
  });

  it("bietet openDocument an", function () {
    assert.isFunction(api().docExport.openDocument);
    api().docExport.openDocument("test.docx");
    assert.deepEqual(opened, ["test.docx"]);
  });
});
