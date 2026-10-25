/**
 * Pure rules of the annotation input form, without Zotero globals (node-testable).
 * Origin: pre-merge:src/dialog.js. The form itself (DOM, window, saving) lives in
 * features/print/dialog.ts.
 */
import { DEFAULT_LOCATOR } from "./locator.ts";

/** 'full' all fields, 'comment' comment only, 'locator' locator and page. */
export type DialogView = "full" | "comment" | "locator";

/** Types selectable when creating; further ones only appear when editing. */
export const CREATABLE_TYPES = ["highlight", "underline", "note"];

/**
 * View when editing: multiple annotations only in locator mode, otherwise the
 * requested one (default 'full').
 */
export function editView(count: number, requested?: DialogView): DialogView {
  return count > 1 ? "locator" : requested || "full";
}

/** Field that gets focus when opening. */
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

/** Width and visible groups of a view. */
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

/** Besides the selectable types, only shows the type of the edited annotation. */
export function isTypeHidden(value: string, currentType: string): boolean {
  return !CREATABLE_TYPES.includes(value) && value !== currentType;
}

export interface CheckboxState {
  checked: boolean;
  disabled: boolean;
}

/**
 * The default checkmark is set and locked when the chosen locator is already the
 * document default. 'page' does not count as a default.
 */
export function defaultCheckboxState(
  docDefault: string,
  chosen: string,
): CheckboxState {
  const isDefault = docDefault === chosen && docDefault !== DEFAULT_LOCATOR;
  return { checked: isDefault, disabled: isDefault };
}

/** Whether saving should set the document default (never in the comment view). */
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
 * Locator types alphabetically by label. If the label is missing, the type itself counts.
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
 * Next element on tab traversal. `current` -1 means: no element has focus.
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

/** Fields for printAnnotations.create/update; only those matching the view. */
export interface DialogSaveData {
  locator?: string;
  pageLabel?: string;
  type?: _ZoteroTypes.Annotations.AnnotationType;
  color?: string;
  text?: string;
  comment?: string;
}

/**
 * Builds the save data from the field values. Returns null if the page number is
 * required (print source) and missing; the form then stays open.
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
