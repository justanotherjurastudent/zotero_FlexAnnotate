/**
 * Passt die Titelzeile von <annotation-row> an den tatsächlichen FlexAnnotate-Locator an
 * (z. B. „Randnummer 318“ statt „Seite 318“).
 *
 * Verifiziert gegen Zotero 10.0.5 (elements/annotationRow.js:93-94):
 * Zotero setzt dort starr `Zotero.getString('pdfReader.page') + ' ' + pageLabel`.
 */
import { assignChecked } from "../../shared/patch";
import { DEFAULT_LOCATOR } from "../../core/locator";
import { getLocator } from "./printAnnotations";
import {
  formatAnnotationTitle,
  locatorLabelText,
} from "../reader/logic/readerLocator";
import { getString } from "../../utils/locale";

const installed = new WeakMap<
  Window,
  { native: () => void; patched: () => void }
>();

function getLabels() {
  return {
    page: getString("reader-locator-page", "label"),
    margin: getString("reader-locator-margin", "label"),
    opus: getString("reader-locator-opus", "label"),
  };
}

export function updateAnnotationRowTitle(row: Element): void {
  const r = row as unknown as {
    _annotation?: Zotero.Item;
    _title?: HTMLElement;
  };
  const ann = r._annotation;
  const titleEl = r._title || row.querySelector(".title");
  if (
    !ann ||
    !titleEl ||
    typeof ann.isAnnotation !== "function" ||
    !ann.isAnnotation()
  ) {
    return;
  }

  const locator = getLocator(ann);
  if (!locator || locator === DEFAULT_LOCATOR) {
    return;
  }

  const label = locatorLabelText(
    locator,
    (l) => {
      try {
        return Zotero.Cite?.getLocatorString?.(l) || undefined;
      } catch {
        return undefined;
      }
    },
    getLabels(),
  );
  titleEl.textContent = formatAnnotationTitle(label, ann.annotationPageLabel);
}

export function patchAnnotationRow(win: Window): boolean {
  if (!win || installed.has(win)) {
    return true;
  }

  try {
    if (!win.customElements?.get("annotation-row")) {
      const doc = win.document as any;
      if (typeof doc?.createXULElement === "function") {
        doc.createXULElement("annotation-row");
      } else if (typeof doc?.createElement === "function") {
        doc.createElement("annotation-row");
      }
    }
    const customClass = win.customElements?.get("annotation-row");
    const proto = customClass?.prototype;
    if (!proto || typeof proto.render !== "function") {
      ztoolkit.log("AnnotationRow.prototype.render not found in window");
      return false;
    }

    const native = proto.render;
    const patched = function (this: Element) {
      native.call(this);
      try {
        updateAnnotationRowTitle(this);
      } catch (e) {
        ztoolkit.log("annotationRow title update failed:", e);
      }
    };

    if (!assignChecked(proto, "render", patched)) {
      ztoolkit.log("Failed to patch AnnotationRow.prototype.render");
      return false;
    }

    installed.set(win, { native, patched });

    // Bereits gerenderte Zeilen im Dokument aktualisieren
    for (const row of win.document.querySelectorAll("annotation-row")) {
      try {
        updateAnnotationRowTitle(row);
      } catch {
        // ignore
      }
    }
    return true;
  } catch (e) {
    ztoolkit.log("patchAnnotationRow failed:", e);
    return false;
  }
}

export function unpatchAnnotationRow(win: Window): void {
  const entry = installed.get(win);
  if (!entry) {
    return;
  }
  installed.delete(win);

  try {
    const proto = win.customElements?.get("annotation-row")?.prototype;
    if (proto) {
      // Hat ein anderes Plugin danach selbst gepatcht, dessen Patch stehen lassen
      if (proto.render !== entry.patched) {
        ztoolkit.log("AnnotationRow.prototype.render patched by others, kept");
        return;
      }
      assignChecked(proto, "render", entry.native);
      for (const row of win.document.querySelectorAll("annotation-row")) {
        try {
          (row as unknown as { render?: () => void }).render?.();
        } catch {
          // ignore
        }
      }
    }
  } catch (e) {
    ztoolkit.log("unpatchAnnotationRow failed:", e);
  }
}
