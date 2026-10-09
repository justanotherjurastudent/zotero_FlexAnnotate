import { assert } from "chai";
import { config } from "../package.json";
import { findOrganizerWindow, waitFor } from "./helpers";

/** Toolbar-Button oben in der Zotero-Leiste (features/organizer/toolbarButton.ts). */
const api = () => (Zotero as any)[config.addonInstance].api;
const BUTTON_ID = "flexannotate-tb-organizer";

describe("organizerToolbarButton", function () {
  this.timeout(30000);
  const win = () => Zotero.getMainWindow() as any;
  const doc = () => win().document as Document;
  const feature = () => api().organizerToolbar;
  const buttons = () => doc().querySelectorAll(`#${BUTTON_ID}`);

  after(async function () {
    findOrganizerWindow()?.close();
    feature().addToWindow(win());
  });

  it("adds exactly one button before the sync button", function () {
    assert.lengthOf(buttons(), 1);
    const button = doc().getElementById(BUTTON_ID) as HTMLElement;
    assert.equal(button.parentElement?.id, "zotero-tabs-toolbar");
    assert.equal(button.nextElementSibling?.id, "zotero-tb-sync");
    assert.isNotEmpty(button.getAttribute("data-l10n-id"));
    assert.equal(button.getAttribute("tabindex"), "-1");
  });

  it("does not duplicate on a second addToWindow", function () {
    feature().addToWindow(win());
    assert.lengthOf(buttons(), 1);
  });

  it("opens the organizer on command", async function () {
    findOrganizerWindow()?.close();
    api().OrganizerFactory.lastState = null;
    const button = doc().getElementById(BUTTON_ID) as HTMLElement;
    button.dispatchEvent(new Event("command", { bubbles: true }));
    await waitFor(() => api().OrganizerFactory.lastState);
    assert.isNotNull(api().OrganizerFactory.lastState);
  });

  it("removes the button and its listener on removeFromWindow", function () {
    feature().removeFromWindow(win());
    assert.lengthOf(buttons(), 0);
    feature().addToWindow(win());
    assert.lengthOf(buttons(), 1);
  });
});
