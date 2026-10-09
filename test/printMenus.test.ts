import { assert } from "chai";
import { config } from "../package.json";
import {
  cleanup,
  makeAnnotation,
  makePdfAttachment,
  makeWork,
} from "./helpers";

/**
 * Item-Kontextmenü (#zotero-itemmenu) im Hauptfenster. Die Auswahl wird direkt an
 * updateVisibility übergeben, weil die Zeilen im Item-Baum nicht zuverlässig selektierbar
 * sind. Der Popupshowing-Pfad, der die Auswahl aus ZoteroPane liest, ist nicht abgedeckt.
 */
const api = () => (Zotero as any)[config.addonInstance].api;
const SEPARATOR = "flexannotate-itemmenu-separator";
const ENTRIES = [
  "flexannotate-add-print-annotation",
  "flexannotate-itemmenu-edit",
  "flexannotate-itemmenu-delete",
];

describe("printMenus (item context menu)", function () {
  this.timeout(60000);
  const win = () => Zotero.getMainWindow() as any;
  const doc = () => win().document as Document;
  const isHidden = (id: string) =>
    (doc().getElementById(id) as HTMLElement).hidden;

  let work: Zotero.Item;
  let native: Zotero.Item;
  let printAnn: Zotero.Item;

  before(async function () {
    work = await makeWork("Menue Testwerk");
    const att = await makePdfAttachment(work);
    native = await makeAnnotation(att, "Menue Zitat", "4", 0);
    printAnn = await api().print.printAnnotations.create(work, {
      pageLabel: "9",
      text: "Druck",
    });
  });

  after(async function () {
    // Das Menü bleibt für die übrigen Tests im Hauptfenster erhalten.
    api().print.menus.printMenus.addToWindow(win());
    await cleanup();
  });

  it("adds a separator and the three entries once", function () {
    assert.exists(doc().getElementById("zotero-itemmenu"));
    for (const id of [SEPARATOR, ...ENTRIES]) {
      assert.exists(doc().getElementById(id), id);
    }
    api().print.menus.printMenus.addToWindow(win());
    assert.lengthOf(doc().querySelectorAll(`#${ENTRIES[0]}`), 1);
  });

  it("shows only Add for one regular item", function () {
    api().print.menus.updateVisibility(doc(), [work]);
    assert.isFalse(isHidden(SEPARATOR));
    assert.isFalse(isHidden(ENTRIES[0]));
    assert.isTrue(isHidden(ENTRIES[1]));
    assert.isTrue(isHidden(ENTRIES[2]));
  });

  it("shows Edit but not Delete for a native annotation", function () {
    api().print.menus.updateVisibility(doc(), [native]);
    assert.isFalse(isHidden(SEPARATOR));
    assert.isTrue(isHidden(ENTRIES[0]));
    assert.isFalse(isHidden(ENTRIES[1]));
    assert.isTrue(isHidden(ENTRIES[2]));
    assert.isFalse((doc().getElementById(ENTRIES[1]) as any).disabled);
  });

  it("shows Edit and Delete for a print annotation", function () {
    api().print.menus.updateVisibility(doc(), [printAnn]);
    assert.isFalse(isHidden(SEPARATOR));
    assert.isTrue(isHidden(ENTRIES[0]));
    assert.isFalse(isHidden(ENTRIES[1]));
    assert.isFalse(isHidden(ENTRIES[2]));
  });

  it("hides everything for several items or no selection", function () {
    for (const items of [[work, native], []] as Zotero.Item[][]) {
      api().print.menus.updateVisibility(doc(), items);
      assert.isTrue(isHidden(SEPARATOR));
      for (const id of ENTRIES) {
        assert.isTrue(isHidden(id), id);
      }
    }
  });

  it("removes its elements and listeners on removeFromWindow", function () {
    api().print.menus.printMenus.removeFromWindow(win());
    for (const id of [SEPARATOR, ...ENTRIES]) {
      assert.isNull(doc().getElementById(id), id);
    }
  });
});
