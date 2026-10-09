import { assert } from "chai";
import { config } from "../package.json";
import { findOrganizerWindow, waitFor } from "./helpers";

/**
 * Werkzeugmenü-Eintrag ohne Zotero.MenuManager (features/organizer/toolsMenuFallback.ts).
 * Zotero 7.x: Eintrag vorhanden; 8.x und 10.x: der Manager übernimmt, kein Duplikat.
 */
const api = () => (Zotero as any)[config.addonInstance].api;
const ITEM_ID = "flexannotate-tools-organizer";
const hasManager = () =>
  typeof (Zotero as any).MenuManager?.registerMenu === "function";

describe("toolsMenuFallback", function () {
  this.timeout(30000);
  const win = () => Zotero.getMainWindow() as any;
  const items = () => win().document.querySelectorAll(`#${ITEM_ID}`);

  after(function () {
    findOrganizerWindow()?.close();
  });

  it("adds its entry to the Tools menu only without Zotero.MenuManager", function () {
    if (hasManager()) {
      assert.lengthOf(items(), 0, "the menu manager owns the entry");
      return;
    }
    assert.lengthOf(items(), 1);
    const item = items()[0] as HTMLElement;
    assert.equal(item.parentElement?.id, "menu_ToolsPopup");
    assert.isNotEmpty(item.getAttribute("label"));
  });

  it("does not duplicate on a second addToWindow", function () {
    api().toolsMenu.addToWindow(win());
    assert.isAtMost(items().length, 1);
  });

  it("opens the organizer on command", async function () {
    if (hasManager()) this.skip(); // the menu manager's entry is tested in Zotero 8+
    findOrganizerWindow()?.close();
    api().OrganizerFactory.lastState = null;
    (items()[0] as HTMLElement).dispatchEvent(
      new Event("command", { bubbles: true }),
    );
    await waitFor(() => api().OrganizerFactory.lastState);
    assert.isNotNull(api().OrganizerFactory.lastState);
  });

  it("removes its entry and listener on removeFromWindow", function () {
    if (hasManager()) this.skip();
    api().toolsMenu.removeFromWindow(win());
    assert.lengthOf(items(), 0);
    api().toolsMenu.addToWindow(win());
    assert.lengthOf(items(), 1);
  });
});
