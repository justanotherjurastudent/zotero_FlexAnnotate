import { assert } from "chai";
import { config } from "../package.json";

/**
 * Lifecycle of the reader menu: start sets up the context menu listener, stop removes
 * it. Verified via the listener list of Zotero.Reader (xpcom/reader.js,
 * 10.0.5: _registeredListeners, line 2772). An open reader is not required;
 * the test profile lacks a reliably openable PDF.
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
    // Restore plugin state to startup baseline
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
