/**
 * Entry "FlexAnnotate: Organizer" in the collection context menu: opens the
 * organizer directly with the category tree of this (top-level) collection.
 *
 * Via DOM instead of Zotero.MenuManager, analogous to print/menus: the visibility of the
 * entry (only for a selected collection) is controlled by the feature itself on
 * popupshowing; own entries survive Zotero's rebuild of the menu
 * (docs/architecture.md, pitfall 10).
 */
import { getLocaleID } from "../../utils/locale";
import { selectedCollection as paneCollection } from "../../utils/window";
import type { Feature } from "../../shared/feature";
import { OrganizerFactory } from "./panel/organizer";

type MainWin = _ZoteroTypes.MainWindow;

const MENU_ID = "zotero-collectionmenu";
const ITEM_ID = "flexannotate-collectionmenu-organizer";

/** Per-window listeners so removeFromWindow can remove them. */
const listeners = new WeakMap<MainWin, { show: () => void; cmd: () => void }>();

/** Currently selected collection, or null (library/item selected). */
function selectedCollection(win: MainWin): Zotero.Collection | null {
  try {
    return paneCollection(win.ZoteroPane);
  } catch {
    return null;
  }
}

export const collectionMenu: Feature = {
  name: "collectionMenu",

  addToWindow(win: MainWin) {
    const doc = win.document;
    const menu = doc.getElementById(MENU_ID);
    if (!menu || doc.getElementById(ITEM_ID)) return;

    const fragment = win.MozXULElement.parseXULToFragment(`
      <menuitem id="${ITEM_ID}" class="menuitem-iconic"
        data-l10n-id="${getLocaleID("outline-collectionmenu-label")}"/>
    `);
    menu.appendChild(fragment);
    const item = doc.getElementById(ITEM_ID) as HTMLElement | null;

    const show = () => {
      if (!item) return;
      const col = selectedCollection(win);
      item.hidden = !col;
    };

    const cmd = () => {
      const col = selectedCollection(win);
      if (!col) return;
      OrganizerFactory.openForCollection(col.id);
    };

    item?.addEventListener("command", cmd);
    menu.addEventListener("popupshowing", show);
    listeners.set(win, { show, cmd });
  },

  removeFromWindow(win: MainWin) {
    const doc = win.document;
    const menu = doc.getElementById(MENU_ID);
    const item = doc.getElementById(ITEM_ID);
    const l = listeners.get(win);
    if (menu && l) {
      menu.removeEventListener("popupshowing", l.show);
    }
    if (item && l) {
      item.removeEventListener("command", l.cmd);
    }
    listeners.delete(win);
    item?.remove();
  },
};
