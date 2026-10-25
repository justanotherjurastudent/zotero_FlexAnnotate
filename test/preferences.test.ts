import { assert } from "chai";
import { config } from "../package.json";
import { waitFor } from "./helpers";

// Pane is registered via Zotero.PreferencePanes.register() in hooks.ts.
function findPane() {
  return Zotero.PreferencePanes.pluginPanes.find(
    (pane) => pane.pluginID === config.addonID,
  );
}

describe("preferences pane", function () {
  it("is registered with its markup and fill script", async function () {
    const pane = findPane();
    assert.isDefined(pane, "pane registered");
    assert.equal((pane as any)?.rawLabel, config.addonName);
    assert.lengthOf(pane?.scripts ?? [], 1);
    const scriptUrl = pane?.scripts?.[0];
    assert.isDefined(scriptUrl, "script url defined");
    const script = await Zotero.File.getContentsFromURL(scriptUrl!);
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

  it("aligns the locator menus in one left-aligned column", async function () {
    const pane = findPane();
    assert.isDefined(pane);
    Zotero.Utilities.Internal.openPreferences(pane!.id!);
    const win = await waitFor(() => {
      const en = Services.wm.getEnumerator("zotero:pref");
      return en.hasMoreElements() ? (en.getNext() as Window) : null;
    });
    try {
      const ids = ["page", "column", "paragraph", "margin", "other"].map(
        (k) => `flexannotate-pref-citavi-locator-${k}`,
      );
      const lefts = await waitFor(() => {
        const els = ids.map((id) => win.document.getElementById(id));
        if (els.some((el) => !el)) return null;
        const rects = els.map((el) => (el as Element).getBoundingClientRect());
        return rects.every((r) => r.width > 0)
          ? rects.map((r) => r.left)
          : null;
      });
      assert.lengthOf(new Set(lefts.map((l) => Math.round(l))), 1, `${lefts}`);
    } finally {
      win.close();
    }
  });
});
