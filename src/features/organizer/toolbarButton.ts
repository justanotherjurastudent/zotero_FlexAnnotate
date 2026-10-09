/**
 * Toolbar-Button in der oberen Zotero-Leiste, der den Organizer öffnet. Sitzt
 * vor Zoteros Sync-Button (#zotero-tb-sync); Icon und Dark Mode wie bei Zoteros
 * eigenen Buttons (list-style-image + context-fill, siehe chrome/content/zotero-platform/win/zotero.css in 10.0.5).
 */
import { config } from "../../../package.json";
import { getLocaleID } from "../../utils/locale";
import { defaultLogger, type Feature } from "../../shared/feature";
import { OrganizerFactory } from "../../modules/organizer";

type MainWin = _ZoteroTypes.MainWindow;

export const BUTTON_ID = "flexannotate-tb-organizer";
const TOOLBAR_ID = "zotero-tabs-toolbar";
const SYNC_ID = "zotero-tb-sync";

/** Je Fenster der Klick-Listener, damit removeFromWindow ihn entfernen kann. */
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
    // Ohne Sync-Button (anderes Zotero-Layout) hängt sich das Icon ans Ende der Leiste.
    toolbar.insertBefore(fragment, doc.getElementById(SYNC_ID));

    const button = doc.getElementById(BUTTON_ID) as HTMLElement;
    button.setAttribute(
      "image",
      `chrome://${config.addonRef}/content/icons/organizer.svg`,
    );
    // Die SVGs füllen mit context-fill; erst die context-properties holen die Textfarbe.
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
