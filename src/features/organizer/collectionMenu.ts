/**
 * Eintrag "FlexAnnotate: Organizer" im Sammlungs-Kontextmenü: öffnet den
 * Organizer direkt mit dem Kategorienbaum dieser (Haupt-)Sammlung.
 *
 * Per DOM statt Zotero.MenuManager, analog print/menus: die Sichtbarkeit des
 * Eintrags (nur bei markierter Sammlung) steuert das Feature selbst auf
 * popupshowing; eigene Einträge überleben Zoteros Neuaufbau des Menüs
 * (docs/architecture.md, Fallstrick 10).
 */
import { getLocaleID } from "../../utils/locale";
import type { Feature } from "../../shared/feature";
import { OrganizerFactory } from "./organizer";

type MainWin = _ZoteroTypes.MainWindow;

const MENU_ID = "zotero-collectionmenu";
const ITEM_ID = "flexannotate-collectionmenu-organizer";

/** Je Fenster die Listener, damit removeFromWindow sie entfernen kann. */
const listeners = new WeakMap<MainWin, { show: () => void; cmd: () => void }>();

/** Aktuell markierte Sammlung, oder null (Bibliothek/Item markiert). */
function selectedCollection(win: MainWin): Zotero.Collection | null {
  try {
    const col = win.ZoteroPane?.getSelectedCollection?.() as
      Zotero.Collection | false | null | undefined;
    // Zotero liefert false/null, wenn kein Item oder keine Sammlung markiert ist
    return col && typeof col === "object" ? col : null;
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
