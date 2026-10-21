/**
 * Context menu on annotation rows in the right-hand item pane. Origin:
 * pre-merge:src/annotationMenu.js.
 *
 * Zotero renders annotations there as <annotation-row annotation-id="…"> and does not
 * provide its own context menu for them. Rows are rebuilt on every selection change,
 * so the listener is attached to the document (capturing phase) rather than individual rows.
 * Editing and deletion apply to every editable annotation (real PDF annotations
 * only after a confirmation).
 */
import { config } from "../../../package.json";
import { getLocaleID } from "../../utils/locale";
import { defaultLogger, type Feature } from "../../shared/feature";
import * as dialog from "./dialog";
import * as printAnnotations from "./printAnnotations";

type MainWin = _ZoteroTypes.MainWindow;
type Popup = HTMLElement & {
  openPopupAtScreen(x: number, y: number, isContextMenu: boolean): void;
};

const POPUP_ID = "flexannotate-annotation-popup";
const EDIT_ID = "flexannotate-annotation-edit";
const DELETE_ID = "flexannotate-annotation-delete";
/** The association is stored on the popup: right-clicking in another window will not overwrite it. */
const ANNOTATION_ATTR = "data-flexannotate-annotation-id";

/** Context menu listener per window, allowing removeFromWindow to clean it up. */
const listeners = new WeakMap<MainWin, (event: MouseEvent) => void>();

function setIcon(item: HTMLElement, name: string): void {
  item.classList.add("menuitem-iconic");
  item.setAttribute(
    "image",
    `chrome://${config.addonRef}/content/icons/${name}.svg`,
  );
  // The SVGs use context-fill; context-properties are required to inherit the text color.
  item.style.setProperty("-moz-context-properties", "fill, fill-opacity");
  item.style.setProperty("fill", "currentColor");
}

function annotationOf(popup: Element): Zotero.Item | null {
  const id = parseInt(popup.getAttribute(ANNOTATION_ATTR) ?? "", 10);
  return id ? Zotero.Items.get(id) || null : null;
}

function onContextMenu(event: MouseEvent, doc: Document, popup: Popup): void {
  const target = event.target as Element | null;
  const row = target?.closest?.("annotation-row");
  if (!row) {
    return;
  }
  const id = parseInt(row.getAttribute("annotation-id") ?? "", 10);
  const annotation = id ? Zotero.Items.get(id) : null;
  if (!annotation || !annotation.isAnnotation()) {
    return;
  }

  const editable = annotation.isEditable();
  (doc.getElementById(DELETE_ID) as HTMLElement).hidden = !editable;
  (doc.getElementById(EDIT_ID) as HTMLElement).toggleAttribute(
    "disabled",
    !editable,
  );

  popup.setAttribute(ANNOTATION_ATTR, String(annotation.id));
  event.preventDefault();
  event.stopPropagation();
  popup.openPopupAtScreen(event.screenX, event.screenY, true);
}

export const annotationRowMenu: Feature = {
  name: "annotationRowMenu",

  addToWindow(win: MainWin) {
    const doc = win.document;
    if (doc.getElementById(POPUP_ID)) {
      return;
    }

    const fragment = win.MozXULElement.parseXULToFragment(`
      <menupopup id="${POPUP_ID}">
        <menuitem id="${EDIT_ID}" data-l10n-id="${getLocaleID("annotation-edit")}"/>
        <menuitem id="${DELETE_ID}" data-l10n-id="${getLocaleID("annotation-delete")}"/>
      </menupopup>
    `);
    doc.documentElement?.appendChild(fragment);
    const popup = doc.getElementById(POPUP_ID) as Popup;

    setIcon(doc.getElementById(EDIT_ID) as HTMLElement, "menu-edit");
    setIcon(doc.getElementById(DELETE_ID) as HTMLElement, "menu-delete");

    // Command listeners are bound to the menu items and get cleaned up when the popup is removed.
    doc.getElementById(EDIT_ID)?.addEventListener("command", () => {
      const annotation = annotationOf(popup);
      if (annotation) {
        dialog
          .openForEdit(win, annotation)
          .catch((e) => defaultLogger("annotationRowMenu", "edit", e));
      }
    });
    doc.getElementById(DELETE_ID)?.addEventListener("command", () => {
      const annotation = annotationOf(popup);
      if (annotation) {
        printAnnotations
          .eraseWithConfirm(win, annotation)
          .catch((e) => defaultLogger("annotationRowMenu", "delete", e));
      }
    });

    const listener = (event: MouseEvent) => {
      try {
        onContextMenu(event, doc, popup);
      } catch (e) {
        defaultLogger("annotationRowMenu", "contextmenu", e);
      }
    };
    doc.addEventListener("contextmenu", listener as EventListener, true);
    listeners.set(win, listener);
  },

  removeFromWindow(win: MainWin) {
    const listener = listeners.get(win);
    if (listener) {
      win.document.removeEventListener(
        "contextmenu",
        listener as EventListener,
        true,
      );
      listeners.delete(win);
    }
    win.document.getElementById(POPUP_ID)?.remove();
  },
};
