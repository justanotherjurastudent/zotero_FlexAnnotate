/**
 * Einträge im Item-Kontextmenü: Print-Annotation anlegen, Annotation bearbeiten,
 * Print-Annotation löschen. Herkunft: legacy/flexannotate.js (addToWindow, updateMenuState).
 *
 * Der Trenner setzt Zotero selbst (menuManager.js:739); ein eigener Trenner würde das
 * ganze Menü ablehnen (menuManager.js:233). Er bleibt daher auch dann sichtbar, wenn alle
 * drei Einträge ausgeblendet sind. Die Sichtbarkeit steuert printMenuState.
 */
import { config } from "../../../package.json";
import {
  printMenuState,
  type MenuState,
  type SelectionKind,
} from "../../core/printMenuState";
import { defaultLogger, type Feature } from "../../shared/feature";
import {
  registerPluginMenus,
  unregisterPluginMenu,
  type MenuContext,
} from "../../utils/menu";
import * as dialog from "./dialog";
import * as placeholder from "./placeholder";
import * as printAnnotations from "./printAnnotations";

const MENU_ID = "flexannotate-item-menu";

/** Zotero legt die Auswahl als `items` in den Kontext (zoteroPane.js:4699). */
type ItemContext = MenuContext & { items?: Zotero.Item[] };

function kindOf(item: Zotero.Item): SelectionKind {
  if (item.isRegularItem()) return "regular";
  if (item.isAnnotation()) return "annotation";
  return "other";
}

function stateOf(context: MenuContext): MenuState {
  const items = (context as ItemContext).items ?? [];
  const single = items.length === 1 ? items[0] : null;
  return printMenuState({
    selectedCount: items.length,
    kinds: items.map(kindOf),
    isEditable: !!single && single.isAnnotation() && single.isEditable(),
    isPrintAnnotation:
      !!single &&
      single.isAnnotation() &&
      placeholder.isPlaceholder(single.parentItem),
  });
}

/** Das einzige ausgewählte Item, sonst undefined. */
function singleItem(context: MenuContext): Zotero.Item | undefined {
  const items = (context as ItemContext).items ?? [];
  return items.length === 1 ? items[0] : undefined;
}

function run(hook: string, task: () => Promise<unknown>): void {
  task().catch((e) => defaultLogger("printMenus", hook, e));
}

const icon = (name: string) =>
  `chrome://${config.addonRef}/content/icons/${name}.svg`;

export const printMenus: Feature = {
  name: "printMenus",
  start: () => {
    registerPluginMenus({
      menuID: MENU_ID,
      target: "main/library/item",
      menus: [
        {
          menuType: "menuitem",
          l10nID: "add-print-annotation",
          icon: icon("menu-add"),
          onShowing: (_e, context) => {
            context.setVisible(stateOf(context).add);
          },
          onCommand: (_e, context) => {
            const item = singleItem(context);
            if (item)
              run("add", () => dialog.open(Zotero.getMainWindow(), item));
          },
        },
        {
          menuType: "menuitem",
          l10nID: "annotation-edit",
          icon: icon("menu-edit"),
          onShowing: (_e, context) => {
            const state = stateOf(context);
            context.setVisible(state.edit);
            context.setEnabled(!state.editDisabled);
          },
          onCommand: (_e, context) => {
            const item = singleItem(context);
            if (item) {
              run("edit", () =>
                dialog.openForEdit(Zotero.getMainWindow(), item),
              );
            }
          },
        },
        {
          menuType: "menuitem",
          l10nID: "annotation-delete",
          icon: icon("menu-delete"),
          onShowing: (_e, context) => {
            context.setVisible(stateOf(context).delete);
          },
          onCommand: (_e, context) => {
            const item = singleItem(context);
            if (item) run("delete", () => printAnnotations.erase(item));
          },
        },
      ],
    });
  },
  stop: () => unregisterPluginMenu(MENU_ID),
};
