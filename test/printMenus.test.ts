import { assert } from "chai";
import { config } from "../package.json";

/**
 * Registrierung des Item-Kontextmenüs. Nicht geprüft: das Öffnen des Menüs (Sichtbarkeit
 * je Auswahl) und stop(), weil das Feature aus dem Test heraus nicht erreichbar ist.
 * getCustomMenuOptions ist eine interne Methode von Zotero.MenuManager
 * (menuManager.js:330) und kann sich zwischen Versionen ändern.
 */
describe("printMenus", function () {
  it("registers one item menu with three entries", function () {
    const manager = (Zotero as any).MenuManager._menuManager;
    const option = manager
      .getCustomMenuOptions("main/library/item")
      // Zotero führt die menuID mit Plugin-Präfix (pluginAPIBase.mjs:312-320).
      .find((o: any) =>
        String(o.menuID).endsWith(`-${config.addonRef}-item-menu`),
      );

    assert.exists(option, "item menu is registered");
    assert.deepEqual(
      option.menus.map((m: any) => m.l10nID),
      [
        `${config.addonRef}-add-print-annotation`,
        `${config.addonRef}-annotation-edit`,
        `${config.addonRef}-annotation-delete`,
      ],
    );
  });
});
