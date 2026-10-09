/**
 * Reine Regeln der Eingabemaske für Annotationen, ohne Zotero-Globals (in Node testbar).
 * Herkunft: legacy/dialog.js. Die Maske selbst (DOM, Fenster, Speichern) steht in
 * features/print/dialog.ts.
 */
import { DEFAULT_LOCATOR } from "./locator.ts";

/** 'full' alle Felder, 'comment' nur der Kommentar, 'locator' Locator und Seite. */
export type DialogView = "full" | "comment" | "locator";

/** Typen, die beim Anlegen wählbar sind; weitere erscheinen nur beim Bearbeiten. */
export const CREATABLE_TYPES = ["highlight", "underline", "note"];

/**
 * Ansicht beim Bearbeiten: mehrere Annotationen nur im Locator-Modus, sonst die
 * gewünschte (Standard 'full').
 */
export function editView(count: number, requested?: DialogView): DialogView {
  return count > 1 ? "locator" : requested || "full";
}

/** Feld, das beim Öffnen den Fokus bekommt. */
export function initialFocus(
  view: DialogView,
  isPrint: boolean,
): "page" | "comment" | "locator" {
  if (view === "comment") return "comment";
  if (view === "locator") return "locator";
  return isPrint ? "page" : "comment";
}

const SIZES: Record<DialogView, [width: number, min: number, max: number]> = {
  locator: [320, 280, 360],
  comment: [380, 340, 420],
  full: [440, 380, 480],
};

export interface ViewLayout {
  width: number;
  minWidth: number;
  maxWidth: number;
  locator: boolean;
  typeColor: boolean;
  text: boolean;
  comment: boolean;
}

/** Breite und sichtbare Gruppen einer Ansicht. */
export function viewLayout(view: DialogView): ViewLayout {
  const [width, minWidth, maxWidth] = SIZES[view];
  return {
    width,
    minWidth,
    maxWidth,
    locator: view !== "comment",
    typeColor: view === "full",
    text: view === "full",
    comment: view !== "locator",
  };
}

/** Zeigt außer den wählbaren Typen nur den Typ der bearbeiteten Annotation. */
export function isTypeHidden(value: string, currentType: string): boolean {
  return !CREATABLE_TYPES.includes(value) && value !== currentType;
}

export interface CheckboxState {
  checked: boolean;
  disabled: boolean;
}

/**
 * Der Standard-Haken ist gesetzt und gesperrt, wenn der gewählte Locator bereits der
 * Standard des Dokuments ist. 'page' zählt nicht als Standard.
 */
export function defaultCheckboxState(
  docDefault: string,
  chosen: string,
): CheckboxState {
  const isDefault = docDefault === chosen && docDefault !== DEFAULT_LOCATOR;
  return { checked: isDefault, disabled: isDefault };
}

/** Ob das Speichern den Dokument-Standard setzen soll (nie in der Kommentar-Ansicht). */
export function wantsDefault(
  view: DialogView,
  checked: boolean,
  disabled: boolean,
): boolean {
  return view !== "comment" && checked && !disabled;
}

export interface LocatorEntry {
  value: string;
  label: string;
}

/**
 * Locator-Typen alphabetisch nach Beschriftung. Fehlt die Beschriftung, gilt der Typ selbst.
 */
export function buildLocatorEntries(
  locators: string[],
  labelOf: (locator: string) => string | undefined,
): LocatorEntry[] {
  return locators
    .map((value) => ({ value, label: labelOf(value) || value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Nächstes Element beim Tab-Durchlauf. `current` -1 heißt: kein Element hat den Fokus.
 */
export function nextFocusIndex(
  count: number,
  current: number,
  backwards: boolean,
): number {
  if (backwards) {
    return current <= 0 ? count - 1 : current - 1;
  }
  return current === -1 || current >= count - 1 ? 0 : current + 1;
}

export interface DialogInput {
  locator: string;
  page: string;
  type: _ZoteroTypes.Annotations.AnnotationType;
  color: string;
  text: string;
  comment: string;
}

/** Felder für printAnnotations.create/update; nur die der Ansicht entsprechenden. */
export interface DialogSaveData {
  locator?: string;
  pageLabel?: string;
  type?: _ZoteroTypes.Annotations.AnnotationType;
  color?: string;
  text?: string;
  comment?: string;
}

/**
 * Baut die Speicherdaten aus den Feldwerten. Liefert null, wenn die Seitenzahl Pflicht
 * ist (Print-Quelle) und fehlt; dann bleibt die Maske offen.
 */
export function buildSaveData(
  input: DialogInput,
  opts: { view: DialogView; multi: boolean; requirePage: boolean },
): DialogSaveData | null {
  const data: DialogSaveData = {};
  if (opts.view !== "comment") {
    data.locator = input.locator;
    if (!opts.multi) {
      const page = input.page.trim();
      if (!page && opts.requirePage) {
        return null;
      }
      data.pageLabel = page;
    }
  }
  if (opts.view === "full") {
    data.type = input.type;
    data.color = input.color;
    data.text = input.text.trim();
  }
  if (opts.view !== "locator") {
    data.comment = input.comment.trim();
  }
  return data;
}
