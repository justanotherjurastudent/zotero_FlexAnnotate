import { assert } from "chai";
import { config } from "../package.json";

describe("startup", function () {
  it("initializes plugin instance with registered api and subsystems", function () {
    const instance = (Zotero as any)[config.addonInstance];
    assert.isObject(instance, "addon instance must exist on Zotero global");
    assert.isObject(instance.api, "addon api must be initialized");
    assert.isObject(instance.data, "addon data must be initialized");
    assert.isObject(instance.api.print, "print feature api registered");
    assert.isObject(instance.api.citavi, "citavi feature api registered");
    assert.isObject(instance.api.gates, "feature gates api registered");
    assert.isFunction(instance.api.gates.isFeatureEnabled);
  });
});
