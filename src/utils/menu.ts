import { getLocaleID, getString } from "./locale";
import { FluentMessageId } from "../../typings/i10n";

/** Kontext, den Zotero jedem Menü-Callback übergibt (menuManager.js:600-633). */
export interface MenuContext {
  readonly menuElem?: MenuElement;
  setVisible(visible: boolean): void;
  setEnabled(enabled: boolean): void;
}

type MenuElement = HTMLElement & { label: string };

export type MenuTarget = "main/menubar/tools" | "main/library/item";

/**
 * Ein Eintrag. Ein `separator` ist nur für Ziele außerhalb von GROUPED_TARGETS erlaubt
 * (menuManager.js:233-238 lehnt das ganze Menü ab); für `main/library/item` setzt Zotero
 * selbst einen Trenner vor die eigenen Einträge (menuManager.js:739).
 */
export type MenuItemSpec =
  | {
      menuType: "menuitem";
      l10nID: FluentMessageId;
      icon?: string;
      darkIcon?: string;
      onShowing?: (e: Event, context: MenuContext) => void;
      onCommand: (e: Event, context: MenuContext) => void;
    }
  | { menuType: "separator" };

export interface RegisterMenusOptions {
  menuID: string;
  target: MenuTarget;
  menus: MenuItemSpec[];
}

export interface RegisterMenuOptions {
  menuID: string;
  target: MenuTarget;
  l10nID: FluentMessageId;
  icon?: string;
  onShowing?: (e: Event, context: MenuContext) => void;
  onCommand: (e: Event, context: MenuContext) => void;
}

/** menuID -> Schlüssel, unter dem Zotero das Menü führt (mit Plugin-Präfix). */
const registeredMenus = new Map<string, string>();

/**
 * Registriert ein Menü mit mehreren Einträgen. Zotero lehnt doppelte menuIDs ab
 * (pluginAPIBase.mjs:177-183) und meldet das nur als Warnung; deshalb wird hier geloggt.
 */
export function registerPluginMenus(opts: RegisterMenusOptions): void {
  const manager = (Zotero as any).MenuManager;
  if (typeof manager?.registerMenu !== "function") {
    return;
  }
  const key = manager.registerMenu({
    menuID: opts.menuID,
    pluginID: addon.data.config.addonID,
    target: opts.target,
    menus: opts.menus.map(toMenuData),
  });
  if (!key) {
    ztoolkit.log(`menu ${opts.menuID} rejected by Zotero.MenuManager`);
    return;
  }
  // unregisterMenu braucht genau diesen Schlüssel: mit der rohen menuID findet Zotero
  // nichts (pluginAPIBase.mjs:133-170, 312-320).
  registeredMenus.set(opts.menuID, key);
}

export function registerPluginMenu(opts: RegisterMenuOptions): void {
  registerPluginMenus({
    menuID: opts.menuID,
    target: opts.target,
    menus: [
      {
        menuType: "menuitem",
        l10nID: opts.l10nID,
        icon: opts.icon,
        onShowing: opts.onShowing,
        onCommand: opts.onCommand,
      },
    ],
  });
}

export function unregisterPluginMenu(menuID: string): void {
  const key = registeredMenus.get(menuID);
  if (key === undefined) {
    return;
  }
  registeredMenus.delete(menuID);
  removeFromZotero(key);
}

export function unregisterAllPluginMenus(): void {
  for (const key of registeredMenus.values()) {
    removeFromZotero(key);
  }
  registeredMenus.clear();
}

function removeFromZotero(key: string): void {
  const manager = (Zotero as any).MenuManager;
  if (typeof manager?.unregisterMenu !== "function") {
    return;
  }
  try {
    manager.unregisterMenu(key);
  } catch (e) {
    ztoolkit.log("unregisterMenu error:", e);
  }
}

function toMenuData(spec: MenuItemSpec) {
  if (spec.menuType === "separator") {
    return { menuType: "separator" as const };
  }
  const { l10nID, icon, darkIcon, onShowing, onCommand } = spec;
  return {
    menuType: "menuitem" as const,
    l10nID: getLocaleID(l10nID),
    icon,
    darkIcon,
    onShowing: (e: Event, context: MenuContext) => {
      const elem = context?.menuElem;
      if (elem && !elem.label) {
        elem.label = getString(l10nID);
      }
      // SVG-Icons füllen mit fill="context-fill". Ohne context-properties bleiben sie
      // schwarz (dunkles Design); so macht es legacy/flexannotate.js:268-273 auch.
      if (elem && icon) {
        elem.style.setProperty("-moz-context-properties", "fill, fill-opacity");
        elem.style.setProperty("fill", "currentColor");
      }
      onShowing?.(e, context);
    },
    onCommand,
  };
}
