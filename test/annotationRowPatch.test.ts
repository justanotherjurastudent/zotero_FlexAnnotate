import { assert } from "chai";
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
});
