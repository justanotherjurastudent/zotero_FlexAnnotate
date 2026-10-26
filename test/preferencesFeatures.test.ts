import { assert } from "chai";
import { config } from "../package.json";
import { waitFor } from "./helpers";

/**
 * "Features" tab of the preferences pane: tab switch, one checkbox per gate with
 * translated texts, switching a gate off/on through its checkbox, and the greyed
 * out dependents.
 */

const api = () => (Zotero as any)[config.addonInstance].api;
const PREF = `${config.prefsPrefix}.gate.`;

function findPane() {
  return Zotero.PreferencePanes.pluginPanes.find(
    (pane) => pane.pluginID === config.addonID,
  );
}

describe("preferences: features tab", function () {
  this.timeout(60000);
  let win: Window;

  const el = (id: string) => win.document.getElementById(id) as any;

  before(async function () {
    Zotero.Utilities.Internal.openPreferences(findPane()!.id!);
    win = await waitFor(() => {
      const en = Services.wm.getEnumerator("zotero:pref");
      return en.hasMoreElements() ? (en.getNext() as Window) : null;
    });
    // the pane script builds the rows after the pane's load event
    await waitFor(() => el("flexannotate-feature-organizer"));
  });

  afterEach(function () {
    for (const g of api().gates.gates) Zotero.Prefs.clear(PREF + g.name, true);
  });

  after(function () {
    win?.close();
  });

  it("switches between the Options and the Features tab", function () {
    assert.equal(
      el("flexannotate-tab-options").getAttribute("aria-selected"),
      "true",
    );
    assert.isFalse(el("flexannotate-panel-options").hidden);
    assert.isTrue(el("flexannotate-panel-features").hidden);

    el("flexannotate-tab-features").click();
    assert.equal(
      el("flexannotate-tab-features").getAttribute("aria-selected"),
      "true",
    );
    assert.isTrue(el("flexannotate-panel-options").hidden);
    assert.isFalse(el("flexannotate-panel-features").hidden);

    el("flexannotate-tab-options").click();
    assert.isFalse(el("flexannotate-panel-options").hidden);
  });

  it("shows one checkbox per gate with a translated label", async function () {
    for (const gate of api().gates.gates) {
      const box = el(`flexannotate-feature-${gate.name}`);
      assert.exists(box, `checkbox for ${gate.name}`);
      await waitFor(() => box.label, 10000);
      assert.notMatch(box.label, /^prefs-feature|^flexannotate-/, gate.name);
    }
  });

  it("switches a gate off and on through its checkbox", async function () {
    const box = el("flexannotate-feature-docImport");
    assert.isTrue(box.checked);

    box.click();
    assert.isFalse(box.checked);
    assert.strictEqual(Zotero.Prefs.get(PREF + "docImport", true), false);
    assert.isFalse(api().gates.isFeatureEnabled("docImport"));

    box.click();
    assert.isTrue(box.checked);
    assert.isUndefined(Zotero.Prefs.get(PREF + "docImport", true));
    assert.isTrue(api().gates.isFeatureEnabled("docImport"));
  });

  it("greys out dependents of a switched-off gate and explains why", async function () {
    el("flexannotate-feature-organizer").click();
    try {
      await waitFor(() => el("flexannotate-feature-docImport").disabled);
      const note = el("flexannotate-feature-note-docImport");
      await waitFor(() => !note.hidden && note.textContent.trim());
      assert.isFalse(el("flexannotate-feature-annotationIndex").disabled);
    } finally {
      el("flexannotate-feature-organizer").click();
    }
    await waitFor(() => !el("flexannotate-feature-docImport").disabled);
  });

  it("marks startup gates as needing a restart", async function () {
    const note = el("flexannotate-feature-note-readerMenu");
    await waitFor(() => !note.hidden && note.textContent.trim());
    assert.isTrue(el("flexannotate-feature-note-docImport").hidden);
  });
});
