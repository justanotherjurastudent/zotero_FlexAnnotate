import { assert } from "chai";
import { config } from "../package.json";
import { findOrganizerWindow, waitFor } from "./helpers";

/**
 * Hotfix switches: the hidden pref `extensions.flexannotate.gate.<name>`
 * (= false) turns a gate off. The smoke test switches every gate off in turn
 * and checks that the lifecycle (stop/start/addToWindow/removeFromWindow) and
 * the organizer still work, so an emergency switch does not cause a second bug.
 */

const api = () => (Zotero as any)[config.addonInstance].api;
const PREF = `${config.prefsPrefix}.gate.`;

const setGate = (name: string, on: boolean | null) =>
  on === null
    ? Zotero.Prefs.clear(PREF + name, true)
    : Zotero.Prefs.set(PREF + name, on, true);

describe("feature gates", function () {
  this.timeout(300000);

  afterEach(function () {
    for (const g of api().gates.gates) setGate(g.name, null);
  });

  it("a pref set to false switches a gate and its dependents off", function () {
    const names = () =>
      api()
        .registry.activeGlobalFeatures()
        .map((f: any) => f.name);
    assert.include(names(), "organizerToolbarButton");

    setGate("organizer", false);
    assert.isFalse(api().gates.isFeatureEnabled("organizer"));
    assert.isFalse(api().gates.isFeatureEnabled("docImport"));
    assert.notInclude(names(), "organizer");
    assert.notInclude(names(), "organizerToolbarButton");
    assert.include(names(), "printMenus");

    setGate("organizer", null);
    assert.isTrue(api().gates.isFeatureEnabled("organizer"));
    assert.include(names(), "organizerToolbarButton");
  });

  it("ignores true and non-boolean values (an override only switches off)", function () {
    setGate("organizer", true);
    assert.isTrue(api().gates.isFeatureEnabled("organizer"));
    Zotero.Prefs.set(PREF + "organizer", "no", true);
    assert.isTrue(api().gates.isFeatureEnabled("organizer"));
  });

  it("filters dialog injectors by gate", function () {
    const names = () =>
      api()
        .registry.activeDialogInjectors()
        .map((i: any) => i.name);
    setGate("citationDialog", false);
    assert.deepEqual(names(), ["annotationRowPatch"]);
  });

  it("survives every single gate switched off (lifecycle and organizer)", async function () {
    // readerMenu.stop() reads the locator labels, which need initialized styles (other
    // suites initialize them in their before hook; this test must not depend on that).
    await Zotero.Styles.init();
    const win = Zotero.getMainWindow();
    const { registry, featureLifecycle: fl } = api();
    const all = registry.globalFeatureEntries;
    const errors: string[] = [];
    const log = (feature: string, hook: string, e: unknown) =>
      errors.push(`${feature}.${hook}: ${e}`);

    try {
      for (const g of api().gates.gates) {
        errors.length = 0;
        setGate(g.name, false);
        const active = registry.activeGlobalFeatures();

        // Same sequence as a Zotero restart with the gate off.
        fl.removeFromWindow(all, win, log);
        fl.stopAll(all, log);
        await fl.startAll(active, log);
        await fl.addToWindow(active, win, log);

        if (api().gates.isFeatureEnabled("organizer")) {
          await api().OrganizerFactory.open();
          await waitFor(findOrganizerWindow, 25000);
          findOrganizerWindow()?.close();
          await waitFor(() => !findOrganizerWindow(), 8000);
        }

        fl.removeFromWindow(active, win, log);
        fl.stopAll(active, log);
        setGate(g.name, null);
        assert.isEmpty(errors, `gate ${g.name} off: ${errors.join(" | ")}`);
      }
    } finally {
      for (const g of api().gates.gates) setGate(g.name, null);
      await fl.startAll(all, log);
      await fl.addToWindow(all, win, log);
    }
  });
});
