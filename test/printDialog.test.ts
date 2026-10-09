import { assert } from "chai";
import { config } from "../package.json";
import { cleanup, makeWork } from "./helpers";

/**
 * The print annotation form, driven like a user: the fields are filled and the save
 * button fires its command. The panel lives in the main window (dialog.ts).
 */

const api = () => (Zotero as any)[config.addonInstance].api;
const PANEL_ID = "flexannotate-print-annotation-panel";

/**
 * Runs `save` and resolves once Zotero has committed an item event of `kind` for an
 * item that matches. Reading annotations while their save is still running can cache
 * half-loaded data, so the test waits for the commit instead of polling.
 */
function committed(
  kind: "add" | "modify",
  matches: (item: Zotero.Item) => boolean,
  save: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    const observerID = Zotero.Notifier.registerObserver(
      {
        notify(event: string, type: string, ids: (number | string)[]) {
          if (
            event === kind &&
            type === "item" &&
            Zotero.Items.get(ids).some(matches)
          ) {
            Zotero.Notifier.unregisterObserver(observerID);
            resolve();
          }
        },
      },
      ["item"],
    );
    save();
  });
}

describe("print annotation dialog", function () {
  this.timeout(60000);
  let work: Zotero.Item;
  let win: _ZoteroTypes.MainWindow;

  const field = (id: string): any => win.document.getElementById(id);
  const panel = (): any => win.document.getElementById(PANEL_ID);
  const save = () =>
    field("flexannotate-dialog-accept").dispatchEvent(new Event("command"));
  const annotationsOf = (item: Zotero.Item): Zotero.Item[] => {
    const placeholder = api().print.placeholder.find(item);
    return placeholder ? placeholder.getAnnotations() : [];
  };

  before(async function () {
    work = await makeWork("Dialog Werk");
    win = Zotero.getMainWindow();
  });

  after(async function () {
    panel()?.hidePopup();
    await cleanup();
  });

  it("creates a print annotation from the form", async function () {
    await api().print.dialog.open(win, work);
    assert.isFalse(field("flexannotate-dialog-type").disabled);

    field("flexannotate-dialog-page").value = " 12 ";
    field("flexannotate-dialog-locator").value = "chapter";
    field("flexannotate-dialog-type").value = "highlight";
    field("flexannotate-dialog-color").value = "#FF0000";
    field("flexannotate-dialog-text").value = "Zitat";
    field("flexannotate-dialog-comment").value = "Notiz";
    await committed("add", (i) => i.isAnnotation(), save);

    const [ann] = annotationsOf(work);
    assert.equal(ann.annotationType, "highlight");
    assert.equal(ann.annotationPageLabel, "12");
    assert.equal(ann.annotationText, "Zitat");
    assert.equal(ann.annotationComment, "Notiz");
    assert.equal(ann.annotationColor, "#ff0000");
    assert.equal(api().print.printAnnotations.getLocator(ann), "chapter");
  });

  it("keeps the form open when a print source has no page", async function () {
    const before = annotationsOf(work).length;
    await api().print.dialog.open(win, work);
    const el = panel();
    const hide = el.hidePopup;
    let hidden = 0;
    el.hidePopup = () => {
      hidden++;
      hide.call(el);
    };
    try {
      field("flexannotate-dialog-page").value = "   ";
      save();
      // Die Pflichtprüfung läuft synchron, vor dem ersten await: kein Warten nötig.
      assert.equal(hidden, 0);
      assert.equal(annotationsOf(work).length, before);
    } finally {
      delete el.hidePopup;
      el.hidePopup();
    }
  });

  it("edits the page of an existing print annotation", async function () {
    const [ann] = annotationsOf(work);
    await api().print.dialog.openForEdit(win, ann);
    assert.isTrue(field("flexannotate-dialog-type").disabled);

    field("flexannotate-dialog-page").value = "13";
    await committed("modify", (i) => i.id === ann.id, save);
    assert.equal(ann.annotationPageLabel, "13");
  });
});
