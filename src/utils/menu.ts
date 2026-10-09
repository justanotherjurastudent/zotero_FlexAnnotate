import { getLocaleID, getString } from "./locale";
import { FluentMessageId } from "../../typings/i10n";

export interface RegisterMenuOptions {
  menuID: string;
  target: "main/menubar/tools" | "main/library/item";
  l10nID: FluentMessageId;
  icon?: string;
  onShowing?: (e: Event, context: any) => void;
  onCommand: (e: Event, context: any) => void;
}

/** menuID -> Schlüssel, unter dem Zotero das Menü führt (mit Plugin-Präfix). */
const registeredMenus = new Map<string, string>();

export function registerPluginMenu(opts: RegisterMenuOptions): void {
  const manager = (Zotero as any).MenuManager;
  if (typeof manager?.registerMenu === "function") {
    const key = manager.registerMenu({
      menuID: opts.menuID,
      pluginID: addon.data.config.addonID,
      target: opts.target,
      menus: [
        {
          menuType: "menuitem",
          l10nID: getLocaleID(opts.l10nID),
          icon: opts.icon,
          onShowing: (e: Event, context: any) => {
            if (context?.menuElem && !context.menuElem.label) {
              context.menuElem.label = getString(opts.l10nID);
            }
            if (opts.onShowing) {
              opts.onShowing(e, context);
            }
          },
          onCommand: opts.onCommand,
        },
      ],
    });
    if (key) {
      // unregisterMenu braucht diesen Schlüssel; mit der rohen menuID findet Zotero
      // nichts (pluginAPIBase.mjs:133-170, 312-320).
      registeredMenus.set(opts.menuID, key);
    } else {
      ztoolkit.log(`menu ${opts.menuID} rejected by Zotero.MenuManager`);
    }
  }
}

export function unregisterAllPluginMenus(): void {
  const manager = (Zotero as any).MenuManager;
  if (typeof manager?.unregisterMenu === "function") {
    for (const key of registeredMenus.values()) {
      try {
        manager.unregisterMenu(key);
      } catch (e) {
        ztoolkit.log("unregisterMenu error:", e);
      }
    }
  }
  registeredMenus.clear();
}
