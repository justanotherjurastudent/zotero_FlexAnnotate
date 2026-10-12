/**
 * Sichtbarkeit der Einträge im Item-Kontextmenü, ohne Zotero-Globals (in Node testbar).
 * Herkunft: pre-merge:src/flexannotate.js updateMenuState. Die Zuordnung zu Menüeinträgen steht
 * in features/print/menus.ts.
 */

export type SelectionKind = "regular" | "annotation" | "other";

export interface MenuStateInput {
  selectedCount: number;
  /** Art jedes ausgewählten Items, in Auswahlreihenfolge */
  kinds: SelectionKind[];
  /** Nur für die einzelne Annotation relevant */
  isEditable: boolean;
  /** Nur für die einzelne Annotation relevant: hängt unter einem Platzhalter */
  isPrintAnnotation: boolean;
}

export interface MenuState {
  add: boolean;
  edit: boolean;
  editDisabled: boolean;
  delete: boolean;
  separator: boolean;
}

export function printMenuState(input: MenuStateInput): MenuState {
  const single = input.selectedCount === 1 ? input.kinds[0] : undefined;
  const add = single === "regular";
  const edit = single === "annotation";
  return {
    add,
    edit,
    editDisabled: edit && !input.isEditable,
    delete: edit && input.isPrintAnnotation,
    separator: add || edit,
  };
}
