import { assert } from "chai";
import { config } from "../package.json";
import { cleanup, makeWork } from "./helpers";

/**
 * Print annotations in a real Zotero: the placeholder attachment is created once,
 * is shared by later annotations and is removed with the last one, unless the
 * keep-placeholders preference is set.
 */

const api = () => (Zotero as any)[config.addonInstance].api;
const keepPref = `${config.prefsPrefix}.keepEmptyPlaceholders`;

describe("print annotations", function () {
  this.timeout(60000);
  let work: Zotero.Item;
  let originalKeep: boolean;

  const placeholders = () =>
    Zotero.Items.get(work.getAttachments()).filter((a: Zotero.Item) =>
      api().print.placeholder.isPlaceholder(a),
    ) as Zotero.Item[];

  before(async function () {
    originalKeep = Zotero.Prefs.get(keepPref, true) as boolean;
    Zotero.Prefs.set(keepPref, false, true);
    work = await makeWork("Print Werk");
  });

  after(async function () {
    Zotero.Prefs.set(keepPref, originalKeep, true);
    await cleanup();
  });

  it("creates one placeholder and a print annotation on it", async function () {
    const { printAnnotations } = api().print;
    const ann = await printAnnotations.create(work, {
      pageLabel: "12",
      text: "Erstes Zitat",
      type: "highlight",
      color: "#FF0000",
    });

    const [placeholder] = placeholders();
    assert.lengthOf(placeholders(), 1);
    assert.equal(ann.parentID, placeholder.id);
    assert.equal(ann.annotationType, "highlight");
    assert.equal(ann.annotationText, "Erstes Zitat");
    assert.equal(ann.annotationPageLabel, "12");
    assert.equal(ann.annotationSortIndex, "00012|000000|00000");
    assert.equal(ann.annotationColor, "#ff0000");
  });

  it("reuses the same placeholder for a second annotation", async function () {
    const { printAnnotations, placeholder } = api().print;
    const [first] = placeholders();
    const second = await printAnnotations.create(work, {
      pageLabel: "3",
      text: "Zweites Zitat",
      type: "underline",
    });

    assert.lengthOf(placeholders(), 1);
    assert.equal(placeholder.find(work)?.id, first.id);
    assert.equal(second.parentID, first.id);
    assert.lengthOf(first.getAnnotations(), 2);
  });

  it("keeps the placeholder while other annotations remain", async function () {
    const { printAnnotations } = api().print;
    const [placeholder] = placeholders();
    const ann = placeholder.getAnnotations();
    await printAnnotations.erase(ann[0]);

    assert.lengthOf(placeholders(), 1);
    assert.lengthOf(placeholder.getAnnotations(), 1);
  });

  it("removes the placeholder with its last annotation (keep = false)", async function () {
    const { printAnnotations } = api().print;
    const [placeholder] = placeholders();
    await printAnnotations.erase(placeholder.getAnnotations()[0]);

    assert.lengthOf(placeholders(), 0);
  });

  it("keeps an empty placeholder when keepEmptyPlaceholders is set", async function () {
    const { printAnnotations } = api().print;
    Zotero.Prefs.set(keepPref, true, true);
    try {
      const ann = await printAnnotations.create(work, {
        pageLabel: "5",
        text: "Letztes Zitat",
      });
      await printAnnotations.erase(ann);

      assert.lengthOf(placeholders(), 1);
      assert.lengthOf(placeholders()[0].getAnnotations(), 0);
    } finally {
      Zotero.Prefs.set(keepPref, false, true);
    }
  });
});
