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

  it("unpatch leaves a foreign patch on Zotero.Reader.open in place", function () {
    const rm = api().reader.readerMenu;
    rm.unpatch();
    const native = Zotero.Reader.open;
    rm.patch();
    const ours = Zotero.Reader.open;
    const foreign = async function (this: any, ...args: any[]) {
      return (ours as any).apply(this, args);
    };
    (Zotero.Reader as any).open = foreign;
    try {
      rm.unpatch();
      assert.strictEqual(
        (Zotero.Reader as any).open,
        foreign,
        "foreign open patch survives unpatch()",
      );
    } finally {
      (Zotero.Reader as any).open = native;
      rm.patch();
    }
  });
});
