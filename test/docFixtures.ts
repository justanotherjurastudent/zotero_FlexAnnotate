/**
 * Echte .docx/.odt-Dateien (ZIP per nsIZipWriter) fuer die Import-Tests.
 * Alle erzeugten Dateien stehen in `files` und werden vom Test aufgeraeumt.
 */

export const files: string[] = [];

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
export const para = (style: string | null, inner: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${inner}</w:p>`;
export const run = (t: string) =>
  `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
export const docx = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body}</w:body></w:document>`;
export const styleDef = (id: string, name: string, lvl: number) =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:pPr><w:outlineLvl w:val="${lvl}"/></w:pPr></w:style>`;
export const styles = (...d: string[]) =>
  `<?xml version="1.0"?><w:styles ${W}>${d.join("")}</w:styles>`;

export const CONTENT_TYPES =
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
export const RELS =
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

export const DE_BODY =
  para(
    "berschrift1",
    run("1. Einleitung") +
      "<w:del><w:r><w:delText>gelöscht</w:delText></w:r></w:del>" +
      '<w:r><w:footnoteReference w:id="2"/></w:r>',
  ) +
  para("berschrift2", run("1.1 Hintergrund")) +
  para("Standard", run("Fließtext, keine Überschrift")) +
  para("berschrift3", run("1.1.1 Stand")) +
  para("berschrift1", run("2. Hauptteil")) +
  para("berschrift2", run("2.1 Begriff"));
export const DE_STYLES = styles(
  styleDef("berschrift1", "heading 1", 0),
  styleDef("berschrift2", "heading 2", 1),
  styleDef("berschrift3", "heading 3", 2),
);
export const EN_BODY =
  para("Heading1", run("Introduction")) +
  para("Heading2", run("Background")) +
  para("Heading1", run("Method"));
export const EN_STYLES = styles(
  styleDef("Heading1", "heading 1", 0),
  styleDef("Heading2", "heading 2", 1),
);

export const ODT_CONTENT =
  '<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text>' +
  '<text:h text:outline-level="1">Zusammenfassung<text:note><text:note-body><text:p>Fußnote</text:p></text:note-body></text:note></text:h>' +
  '<text:h text:outline-level="2">Ergebnisse<text:tracked-changes/></text:h>' +
  "<text:p>Text</text:p>" +
  '<text:h text:outline-level="1">Ausblick</text:h>' +
  "</office:text></office:body></office:document-content>";

/** ZIP mit den Eintraegen {Name: Text} schreiben (nsIZipWriter). */
export const makeZip = (name: string, entries: Record<string, string>) => {
  const path = PathUtils.join(
    PathUtils.tempDir,
    `flexannotate-test-${Date.now()}-${files.length}-${name}`,
  );
  files.push(path);
  const zw = (Components.classes as any)[
    "@mozilla.org/zipwriter;1"
  ].createInstance(Components.interfaces.nsIZipWriter);
  zw.open(Zotero.File.pathToFile(path), 0x04 | 0x08 | 0x20); // rw, create, truncate
  try {
    for (const [entry, text] of Object.entries(entries)) {
      const stream = (Components.classes as any)[
        "@mozilla.org/io/string-input-stream;1"
      ].createInstance(Components.interfaces.nsIStringInputStream);
      stream.setUTF8Data(text);
      zw.addEntryStream(
        entry,
        Date.now() * 1000,
        Components.interfaces.nsIZipWriter.COMPRESSION_DEFAULT,
        stream,
        false,
      );
    }
  } finally {
    zw.close();
  }
  return Zotero.File.pathToFile(path);
};

export const makeDocx = (name: string, body: string, stylesXml?: string) =>
  makeZip(name, {
    "[Content_Types].xml": CONTENT_TYPES,
    "_rels/.rels": RELS,
    "word/document.xml": docx(body),
    ...(stylesXml && { "word/styles.xml": stylesXml }),
  });

export const makeOdt = (name: string, content: string) =>
  makeZip(name, {
    mimetype: "application/vnd.oasis.opendocument.text",
    "content.xml": content,
    "META-INF/manifest.xml":
      '<?xml version="1.0"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/></manifest:manifest>',
  });
