/**
 * Kontextmenü an den Annotations-Zeilen im rechten Item-Bereich. Herkunft:
 * legacy/annotationMenu.js.
 *
 * Zotero zeichnet Annotationen dort als <annotation-row annotation-id="…"> und bringt
 * kein eigenes Menü dafür mit. Die Zeilen werden bei jeder Auswahländerung neu gebaut,
 * deshalb hängt der Listener am Dokument (Capture) und nicht an den Zeilen.
 * Bearbeiten gilt für jede Annotation, Löschen nur für Print-Annotationen.
 */
import { config } from "../../../package.json";
import { getLocaleID } from "../../utils/locale";
import { defaultLogger, type Feature } from "../../shared/feature";
import * as dialog from "./dialog";
import * as placeholder from "./placeholder";
import * as printAnnotations from "./printAnnotations";

type MainWin = _ZoteroTypes.MainWindow;
type Popup = HTMLElement & {
  openPopupAtScreen(x: number, y: number, isContextMenu: boolean): void;
};

const POPUP_ID = "flexannotate-annotation-popup";
const EDIT_ID = "flexannotate-annotation-edit";
const DELETE_ID = "flexannotate-annotation-delete";
/** Die Zuordnung hängt am Popup: ein Rechtsklick in einem anderen Fenster überschreibt sie nicht. */
const ANNOTATION_ATTR = "data-flexannotate-annotation-id";

/** Je Fenster der Kontextmenü-Listener, damit removeFromWindow ihn entfernen kann. */
const listeners = new WeakMap<MainWin, (event: MouseEvent) => void>();

function setIcon(item: HTMLElement, name: string): void {
  item.classList.add("menuitem-iconic");
  item.setAttribute(
    "image",
    `chrome://${config.addonRef}/content/icons/${name}.svg`,
  );
  // Die SVGs füllen mit context-fill; erst die context-properties holen die Textfarbe.
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

  const isPrint = placeholder.isPlaceholder(annotation.parentItem);
  (doc.getElementById(DELETE_ID) as HTMLElement).hidden = !isPrint;
  (doc.getElementById(EDIT_ID) as HTMLElement).toggleAttribute(
    "disabled",
    !annotation.isEditable(),
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

    // Die Befehls-Listener hängen an den Menüeinträgen und gehen mit dem Popup.
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
          .erase(annotation)
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
