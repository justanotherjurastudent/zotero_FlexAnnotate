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

const registeredMenuIDs: string[] = [];

export function registerPluginMenu(opts: RegisterMenuOptions): void {
  const manager = (Zotero as any).MenuManager;
  if (typeof manager?.registerMenu === "function") {
    manager.registerMenu({
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
    if (!registeredMenuIDs.includes(opts.menuID)) {
      registeredMenuIDs.push(opts.menuID);
    }
  }
}

export function unregisterAllPluginMenus(): void {
  const manager = (Zotero as any).MenuManager;
  if (typeof manager?.unregisterMenu === "function") {
    for (const id of registeredMenuIDs) {
      try {
        manager.unregisterMenu(id);
      } catch (e) {
        ztoolkit.log("unregisterMenu error:", e);
      }
    }
  }
  registeredMenuIDs.length = 0;
}
