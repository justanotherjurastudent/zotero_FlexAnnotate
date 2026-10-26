import { assert } from "chai";
import { config } from "../package.json";
import { cleanup, makeWork, waitFor } from "./helpers";

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

  it("removes the placeholder when Zotero itself deletes the last annotation (keep = false)", async function () {
    const { printAnnotations } = api().print;
    const ann = await printAnnotations.create(work, { pageLabel: "9" });
    assert.lengthOf(placeholders(), 1);
    await ann.eraseTx();
    await waitFor(
      () => (placeholders().length === 0 ? true : null),
      8000,
      "placeholder swept after Zotero's own delete",
    );
  });

  it("does not sweep a new placeholder that still waits for its first annotation", async function () {
    const { placeholder } = api().print;
    const fresh = await makeWork("Frisches Werk");
    await placeholder.create(fresh);
    // any item delete triggers a sweep; the new placeholder is empty at that moment
    await placeholder.sweepEmpty();
    const left = (
      Zotero.Items.get(fresh.getAttachments()) as Zotero.Item[]
    ).filter((a) => placeholder.isPlaceholder(a));
    assert.lengthOf(left, 1);
  });

  it("does not sweep an old empty placeholder that ensure() just handed out", async function () {
    const { placeholder } = api().print;
    const reused = await makeWork("Wiederverwendetes Werk");
    await placeholder.create(reused);
    // let the creation grace period pass: the placeholder is empty and old
    await Zotero.Promise.delay(3200);
    const handedOut = await placeholder.ensure(reused);
    await placeholder.sweepEmpty();
    const left = (
      Zotero.Items.get(reused.getAttachments()) as Zotero.Item[]
    ).filter((a) => placeholder.isPlaceholder(a));
    assert.lengthOf(left, 1);
    assert.equal(left[0].id, handedOut.id);
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
