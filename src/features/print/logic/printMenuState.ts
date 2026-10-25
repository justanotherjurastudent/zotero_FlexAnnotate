/**
 * Visibility of items in the item context menu, without Zotero globals (testable in Node).
 * Origin: pre-merge:src/flexannotate.js updateMenuState. Menu entry mapping lives in
 * features/print/menus.ts.
 */

export type SelectionKind = "regular" | "annotation" | "other";

export interface MenuStateInput {
  selectedCount: number;
  /** Kind of each selected item, in selection order */
  kinds: SelectionKind[];
  /** Relevant only for a single annotation */
  isEditable: boolean;
  /** Relevant only for a single annotation: attached under a placeholder */
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
