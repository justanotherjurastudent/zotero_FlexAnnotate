/**
 * Einträge im Item-Kontextmenü: Print-Annotation anlegen, Annotation bearbeiten,
 * Print-Annotation löschen. Herkunft: pre-merge:src/flexannotate.js (addToWindow, addMenuItem,
 * setMenuIcon, updateMenuState).
 *
 * Per DOM statt Zotero.MenuManager: Zotero baut das Item-Menü bei Annotations-Auswahl
 * nicht neu auf (zoteroPane.js:4680), der MenuManager-Eintrag bliebe also stehen. Die
 * eigenen Einträge bleiben beim Neuaufbau erhalten (docs/architecture.md, Pitfall 9),
 * deshalb steuert das Feature ihre Sichtbarkeit selbst auf popupshowing.
 */
import { config } from "../../../package.json";
import { printMenuState, type SelectionKind } from "../../core/printMenuState";
import { getLocaleID } from "../../utils/locale";
import { defaultLogger, type Feature } from "../../shared/feature";
import * as dialog from "./dialog";
import * as placeholder from "./placeholder";
import * as printAnnotations from "./printAnnotations";

type MainWin = _ZoteroTypes.MainWindow;

const MENU_ID = "zotero-itemmenu";
const SEPARATOR_ID = "flexannotate-itemmenu-separator";
const ADD_ID = "flexannotate-add-print-annotation";
const EDIT_ID = "flexannotate-itemmenu-edit";
const DELETE_ID = "flexannotate-itemmenu-delete";

/** Je Fenster der popupshowing-Listener, damit removeFromWindow ihn entfernen kann. */
const listeners = new WeakMap<MainWin, () => void>();

function kindOf(item: Zotero.Item): SelectionKind {
  if (item.isRegularItem()) return "regular";
  if (item.isAnnotation()) return "annotation";
  return "other";
}

function selectedItems(win: MainWin): Zotero.Item[] {
  return win.ZoteroPane?.getSelectedItems() || [];
}

/**
 * Blendet die Einträge je nach Auswahl ein oder aus. Exportiert, damit Tests die
 * Auswahl direkt übergeben können.
 */
export function updateVisibility(doc: Document, items: Zotero.Item[]): void {
  const single = items.length === 1 ? items[0] : null;
  const state = printMenuState({
    selectedCount: items.length,
    kinds: items.map(kindOf),
    isEditable: !!single && single.isAnnotation() && single.isEditable(),
    isPrintAnnotation:
      !!single &&
      single.isAnnotation() &&
      placeholder.isPlaceholder(single.parentItem),
  });

  setHidden(doc, SEPARATOR_ID, !state.separator);
  setHidden(doc, ADD_ID, !state.add);
  setHidden(doc, EDIT_ID, !state.edit);
  setHidden(doc, DELETE_ID, !state.delete);
  const edit = doc.getElementById(EDIT_ID) as HTMLElement | null;
  if (edit) {
    edit.toggleAttribute("disabled", state.editDisabled);
  }
}

function setHidden(doc: Document, id: string, hidden: boolean): void {
  const element = doc.getElementById(id) as HTMLElement | null;
  if (element) {
    element.hidden = hidden;
  }
}

/** Hängt ein Symbol an. Die SVGs füllen mit context-fill; erst die context-properties holen die Textfarbe. */
function setMenuIcon(item: HTMLElement, name: string): void {
  item.setAttribute(
    "image",
    `chrome://${config.addonRef}/content/icons/${name}.svg`,
  );
  item.style.setProperty("-moz-context-properties", "fill, fill-opacity");
  item.style.setProperty("fill", "currentColor");
}

function parse(win: MainWin, markup: string): DocumentFragment {
  return win.MozXULElement.parseXULToFragment(markup);
}

export const printMenus: Feature = {
  name: "printMenus",

  addToWindow(win: MainWin) {
    const doc = win.document;
    const menu = doc.getElementById(MENU_ID);
    if (!menu || doc.getElementById(SEPARATOR_ID)) {
      return;
    }

    // Eine Einzelauswahl genügt für alle drei Befehle; die Auswahl wird bei jedem
    // Klick neu gelesen, nicht beim Aufbauen des Menüs.
    const onCommand = (run: (annotation: Zotero.Item) => Promise<unknown>) => {
      const items = selectedItems(win);
      if (items.length === 1) {
        run(items[0]).catch((e) => defaultLogger("printMenus", "command", e));
      }
    };

    menu.appendChild(parse(win, `<menuseparator id="${SEPARATOR_ID}"/>`));
    menu.appendChild(
      parse(
        win,
        `<menuitem id="${ADD_ID}" class="menuitem-iconic" data-l10n-id="${getLocaleID("add-print-annotation")}"/>`,
      ),
    );
    menu.appendChild(
      parse(
        win,
        `<menuitem id="${EDIT_ID}" class="menuitem-iconic" data-l10n-id="${getLocaleID("annotation-edit")}"/>`,
      ),
    );
    menu.appendChild(
      parse(
        win,
        `<menuitem id="${DELETE_ID}" class="menuitem-iconic" data-l10n-id="${getLocaleID("annotation-delete")}"/>`,
      ),
    );

    setMenuIcon(doc.getElementById(ADD_ID) as HTMLElement, "menu-add");
    setMenuIcon(doc.getElementById(EDIT_ID) as HTMLElement, "menu-edit");
    setMenuIcon(doc.getElementById(DELETE_ID) as HTMLElement, "menu-delete");

    doc
      .getElementById(ADD_ID)
      ?.addEventListener("command", () =>
        onCommand((item) => dialog.open(win, item)),
      );
    doc
      .getElementById(EDIT_ID)
      ?.addEventListener("command", () =>
        onCommand((item) => dialog.openForEdit(win, item)),
      );
    doc
      .getElementById(DELETE_ID)
      ?.addEventListener("command", () =>
        onCommand((item) => printAnnotations.erase(item)),
      );

    const onShowing = () => {
      try {
        updateVisibility(doc, selectedItems(win));
      } catch (e) {
        defaultLogger("printMenus", "popupshowing", e);
      }
    };
    menu.addEventListener("popupshowing", onShowing);
    listeners.set(win, onShowing);
  },

  removeFromWindow(win: MainWin) {
    const doc = win.document;
    const onShowing = listeners.get(win);
    if (onShowing) {
      doc
        .getElementById(MENU_ID)
        ?.removeEventListener("popupshowing", onShowing);
      listeners.delete(win);
    }
    // Die Befehls-Listener hängen an den Elementen und gehen mit ihnen.
    for (const id of [SEPARATOR_ID, ADD_ID, EDIT_ID, DELETE_ID]) {
      doc.getElementById(id)?.remove();
    }
  },
};
