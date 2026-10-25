/**
 * Toolbar button in the top Zotero bar that opens the organizer. Sits
 * before Zotero's sync button (#zotero-tb-sync); icon and dark mode like Zotero's
 * own buttons (list-style-image + context-fill, see chrome/content/zotero-platform/win/zotero.css in 10.0.5).
 */
import { config } from "../../../package.json";
import { getLocaleID } from "../../utils/locale";
import { defaultLogger, type Feature } from "../../shared/feature";
import { OrganizerFactory } from "./panel/organizer";

type MainWin = _ZoteroTypes.MainWindow;

export const BUTTON_ID = "flexannotate-tb-organizer";
const TOOLBAR_ID = "zotero-tabs-toolbar";
const SYNC_ID = "zotero-tb-sync";

/** Per-window click listener so removeFromWindow can remove it. */
const listeners = new WeakMap<MainWin, () => void>();

export const organizerToolbarButton: Feature = {
  name: "organizerToolbarButton",

  addToWindow(win: MainWin) {
    const doc = win.document;
    const toolbar = doc.getElementById(TOOLBAR_ID);
    if (!toolbar || doc.getElementById(BUTTON_ID)) {
      return;
    }

    const fragment = win.MozXULElement.parseXULToFragment(`
      <toolbarbutton id="${BUTTON_ID}" class="zotero-tb-button" tabindex="-1"
        data-l10n-id="${getLocaleID("outline-toolbar-button")}"/>
    `);
    // Without a sync button (other Zotero layout) the icon attaches to the end of the bar.
    toolbar.insertBefore(fragment, doc.getElementById(SYNC_ID));

    const button = doc.getElementById(BUTTON_ID) as HTMLElement;
    button.setAttribute(
      "image",
      `chrome://${config.addonRef}/content/icons/organizer.svg`,
    );
    // The SVGs fill with context-fill; only the context-properties first fetch the text color.
    button.style.setProperty("-moz-context-properties", "fill, fill-opacity");
    button.style.setProperty("fill", "currentColor");

    const listener = () => {
      OrganizerFactory.open().catch((e) =>
        defaultLogger("organizerToolbarButton", "open", e),
      );
    };
    button.addEventListener("command", listener);
    listeners.set(win, listener);
  },

  removeFromWindow(win: MainWin) {
    const button = win.document.getElementById(BUTTON_ID);
    const listener = listeners.get(win);
    if (button && listener) {
      button.removeEventListener("command", listener);
    }
    listeners.delete(win);
    button?.remove();
  },
};
