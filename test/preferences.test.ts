import { assert } from "chai";
import { config } from "../package.json";

// Die Pane wird über Zotero.PreferencePanes.register() in hooks.ts angemeldet.
function findPane() {
  return Zotero.PreferencePanes.pluginPanes.find(
    (pane) => pane.pluginID === config.addonID,
  );
}

describe("preferences pane", function () {
  it("is registered with its markup and fill script", async function () {
    const pane = findPane();
    assert.isDefined(pane, "pane registered");
    assert.equal(pane?.rawLabel, config.addonName);
    assert.lengthOf(pane?.scripts ?? [], 1);
    const script = await Zotero.File.getContentsFromURL(pane!.scripts[0]);
    assert.isNotEmpty(script);
  });

  it("references only preferences that exist with a default value", async function () {
    const pane = findPane();
    assert.isDefined(pane);
    const markup = await Zotero.File.getContentsFromURL(pane!.src);
    const keys = [...markup.matchAll(/preference="([^"]+)"/g)].map((m) => m[1]);
    assert.isAtLeast(keys.length, 10, "pane binds several preferences");
    for (const key of keys) {
      assert.isTrue(key.startsWith(`${config.prefsPrefix}.`), key);
      assert.isDefined(Zotero.Prefs.get(key, true), `default for ${key}`);
    }
  });
});
