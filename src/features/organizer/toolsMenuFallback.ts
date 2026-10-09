/**
 * Eintrag "Werkzeuge -> FlexAnnotate: Organizer" für Zotero 7.x, das kein
 * Zotero.MenuManager hat. Ohne ihn bleibt registerPluginMenu wirkungslos. Eingehängt
 * wird nur, wenn der Manager fehlt, sonst gäbe es den Eintrag doppelt.
 *
 * Werkzeugmenü der Hauptfenster: zoteroPane.xhtml, <menupopup id="menu_ToolsPopup">
 * (.zotero-reference/7.0.32/chrome/content/zotero/zoteroPane.xhtml:715).
 * Das Label kommt aus Fluent (Attribut .label), nicht über data-l10n-id: Fluent
 * setzt bei einem XUL-menuitem den Text, das Label-Attribut bleibt leer (wie in
 * features/print/dialog.ts).
 */
import { config } from "../../../package.json";
import { getString } from "../../utils/locale";
import { defaultLogger, type Feature } from "../../shared/feature";
import { OrganizerFactory } from "./organizer";

type MainWin = _ZoteroTypes.MainWindow;

export const MENU_ITEM_ID = "flexannotate-tools-organizer";
const POPUP_ID = "menu_ToolsPopup";

/** Je Fenster der Klick-Listener, damit removeFromWindow ihn entfernen kann. */
const listeners = new WeakMap<MainWin, () => void>();

/** Der Fallback gilt nur ohne MenuManager (Zotero 7.x). */
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
    // Wie der Toolbar-Button: context-fill braucht die context-properties
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
