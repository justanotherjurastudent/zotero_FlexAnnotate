import { assert } from "chai";
import { config } from "../package.json";
import {
  cleanup,
  makeAnnotation,
  makePdfAttachment,
  makeWork,
} from "./helpers";

describe("annotationRowPatch", function () {
  this.timeout(60000);
  const win = () => Zotero.getMainWindow() as any;

  let work: Zotero.Item;
  let att: Zotero.Item;
  let ann: Zotero.Item;

  before(async function () {
    await Zotero.Styles.init();
    work = await makeWork("AnnotationRow Patch Werk");
    att = await makePdfAttachment(work);
    ann = await makeAnnotation(att, "Zitat mit Randnummer", "318", 0);
    ann.addTag("#flexannotate-locator-opus", 1);
    await ann.saveTx();
  });

  after(async function () {
    await cleanup();
  });

  it("updates annotation-row title to locator label when locator is set", async function () {
    const doc = win().document;
    await win().customElements.whenDefined("annotation-row");
    const row = doc.createXULElement("annotation-row") as any;
    doc.documentElement.appendChild(row);
    try {
      row.annotation = ann;
      const expectedLabel = Zotero.Cite.getLocatorString("opus") || "Opus";
      assert.isTrue(row._title?.textContent?.includes(expectedLabel));
      assert.isTrue(row._title?.textContent?.includes("318"));
    } finally {
      row.remove();
    }
  });

  it("leaves annotation-row title as default page when locator is page", async function () {
    const defaultAnn = await makeAnnotation(att, "Zitat Standard", "12", 0);
    const doc = win().document;
    await win().customElements.whenDefined("annotation-row");
    const row = doc.createXULElement("annotation-row") as any;
    doc.documentElement.appendChild(row);
    try {
      row.annotation = defaultAnn;
      assert.isFalse(row._title?.textContent?.includes("Randnummer"));
      assert.isTrue(row._title?.textContent?.includes("12"));
    } finally {
      row.remove();
    }
  });

  it("adds a jump button for annotations with a passage, none for print annotations", async function () {
    const doc = win().document;
    await win().customElements.whenDefined("annotation-row");
    const api = (Zotero as any)[config.addonInstance].api.print;
    const printAnn = await api.printAnnotations.create(work, {
      pageLabel: "5",
    });
    const opened: unknown[][] = [];
    const reader = Zotero.Reader as any;
    const open = reader.open;
    reader.open = async (...args: unknown[]) => void opened.push(args);
    const row = doc.createXULElement("annotation-row") as any;
    doc.documentElement.appendChild(row);
    try {
      row.annotation = ann;
      const button = row.querySelector(".flexannotate-goto");
      assert.exists(button);
      button.click();
      assert.deepEqual(opened, [[att.id, { annotationID: ann.key }]]);
      row.annotation = printAnn;
      assert.isNull(row.querySelector(".flexannotate-goto"));
      // created freely on a real PDF: no passage either
      row.annotation = await api.printAnnotations.create(
        work,
        { pageLabel: "6" },
        att,
      );
      assert.isNull(row.querySelector(".flexannotate-goto"));
    } finally {
      reader.open = open;
      row.remove();
    }
  });

  const rowApi = () =>
    (Zotero as any)[config.addonInstance].api.print.annotationRowPatch;
  const pageWord = () => Zotero.getString("pdfReader.page");
  const titleOf = async (a: Zotero.Item) => {
    const doc = win().document;
    await win().customElements.whenDefined("annotation-row");
    const row = doc.createXULElement("annotation-row") as any;
    doc.documentElement.appendChild(row);
    try {
      row.annotation = a;
      return String(row._title?.textContent);
    } finally {
      row.remove();
    }
  };
  const proto = () => win().customElements.get("annotation-row").prototype;

  it("shows the margin locator instead of the page label", async function () {
    const marginAnn = await makeAnnotation(att, "Zitat Rn", "7", 0);
    marginAnn.addTag("#flexannotate-locator-margin", 1);
    await marginAnn.saveTx();
    const title = await titleOf(marginAnn);
    assert.isFalse(title.startsWith(pageWord()), title);
    assert.isTrue(title.includes("7"), title);
  });

  it("unpatch brings back Zotero's own title", async function () {
    rowApi().unpatch(win());
    try {
      assert.isTrue((await titleOf(ann)).startsWith(pageWord()));
    } finally {
      rowApi().patch(win());
    }
    assert.isFalse((await titleOf(ann)).startsWith(pageWord()));
  });

  it("unpatch leaves a patch of another plugin in place", async function () {
    rowApi().unpatch(win());
    const nativeRender = proto().render;
    rowApi().patch(win());
    const ours = proto().render;
    const foreign = function (this: Element) {
      return ours.call(this);
    };
    proto().render = foreign;
    try {
      rowApi().unpatch(win());
      assert.strictEqual(proto().render, foreign, "foreign patch survives");
    } finally {
      proto().render = nativeRender;
      rowApi().patch(win());
    }
  });
});
