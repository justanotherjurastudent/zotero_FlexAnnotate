/**
 * Entry "Tools -> FlexAnnotate: Organizer" for Zotero 7.x, which has no
 * Zotero.MenuManager. Without it registerPluginMenu stays ineffective. Attached
 * only if the manager is missing, otherwise the entry would exist twice.
 *
 * Tools menu of the main windows: zoteroPane.xhtml, <menupopup id="menu_ToolsPopup">
 * (.zotero-reference/7.0.32/chrome/content/zotero/zoteroPane.xhtml:715).
 * The label comes from Fluent (attribute .label), not via data-l10n-id: Fluent
 * sets the text on a XUL-menuitem, the label attribute stays empty (like in
 * features/print/dialog.ts).
 */
import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import { defaultLogger, type Feature } from "../../shared/feature";
import { OrganizerFactory } from "./panel/organizer";

type MainWin = _ZoteroTypes.MainWindow;

export const MENU_ITEM_ID = "flexannotate-tools-organizer";
const POPUP_ID = "menu_ToolsPopup";

/** Per-window click listener so removeFromWindow can remove it. */
const listeners = new WeakMap<MainWin, () => void>();

/** The fallback only applies without MenuManager (Zotero 7.x). */
function needed(): boolean {
  return typeof (Zotero as any).MenuManager?.registerMenu !== "function";
}

export const toolsMenuFallback: Feature = {
  name: "toolsMenuFallback",

  addToWindow(win: MainWin) {
    const doc = win.document;
    const popup = doc.getElementById(POPUP_ID);
    if (!needed() || !popup || doc.getElementById(MENU_ITEM_ID)) {
      return;
    }

    const item = doc.createXULElement("menuitem") as HTMLElement;
    item.id = MENU_ITEM_ID;
    item.setAttribute("label", getString("outline-menu-label", "label"));
    item.setAttribute("class", "menuitem-iconic");
    item.setAttribute(
      "image",
      `chrome://${config.addonRef}/content/icons/organizer.svg`,
    );
    // Like the toolbar button: context-fill requires context-properties
    item.style.setProperty("-moz-context-properties", "fill, fill-opacity");
    item.style.setProperty("fill", "currentColor");
    popup.appendChild(item);

    const listener = () => {
      OrganizerFactory.open().catch((e) =>
        defaultLogger("toolsMenuFallback", "open", e),
      );
    };
    item.addEventListener("command", listener);
    listeners.set(win, listener);
  },

  removeFromWindow(win: MainWin) {
    const item = win.document.getElementById(MENU_ITEM_ID);
    const listener = listeners.get(win);
    if (item && listener) {
      item.removeEventListener("command", listener);
    }
    listeners.delete(win);
    item?.remove();
  },
};
