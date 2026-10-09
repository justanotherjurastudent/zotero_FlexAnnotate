import { assert } from "chai";
import { config } from "../package.json";

/**
 * Lebenszyklus des Reader-Menüs: start richtet den Kontextmenü-Listener ein, stop nimmt
 * ihn wieder weg. Geprüft wird über die Listenliste von Zotero.Reader (xpcom/reader.js,
 * 10.0.5: _registeredListeners, Zeile 2772). Ein geöffneter Reader wird nicht verlangt;
 * dafür fehlt im Testprofil ein zuverlässig öffnbares PDF.
 */

const api = () => (Zotero as any)[config.addonInstance].api;
const listeners = () =>
  (
    (Zotero.Reader as any)._registeredListeners as Array<{
      pluginID?: string;
      type: string;
    }>
  ).filter(
    (l) =>
      l.pluginID === config.addonID && l.type === "createAnnotationContextMenu",
  );

describe("reader menu lifecycle", function () {
  this.timeout(60000);

  after(function () {
    // Plugin-Zustand wie beim Start wiederherstellen
    api().reader.readerMenu.patch();
  });

  it("patch registers the context menu listener once, unpatch removes it", function () {
    const rm = api().reader.readerMenu;
    rm.unpatch();
    assert.isFalse(rm.isPatched());
    assert.lengthOf(listeners(), 0);

    assert.isTrue(rm.patch());
    assert.isTrue(rm.isPatched());
    assert.lengthOf(listeners(), 1);

    rm.patch();
    assert.lengthOf(listeners(), 1, "a second patch does not register again");

    rm.unpatch();
    assert.isFalse(rm.isPatched());
    assert.lengthOf(listeners(), 0, "unpatch removes the listener");
  });
});
