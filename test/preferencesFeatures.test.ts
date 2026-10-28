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

  after(async function () {
    win?.close();
    await waitFor(() => {
      const en = Services.wm.getEnumerator("zotero:pref");
      return !en.hasMoreElements();
    });
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

  // Gates that exist but are not offered in the settings (see HIDDEN_GATES in featureGroups.ts)
  const HIDDEN = [
    "docImport",
    "docExport",
    "noteExport",
    "citeprocResetFix",
    "placeholderCleanup",
  ];

  it("shows one checkbox per gate with a translated label, except the hidden ones", async function () {
    for (const gate of api().gates.gates) {
      const box = el(`flexannotate-feature-${gate.name}`);
      if (HIDDEN.includes(gate.name)) {
        assert.notExists(box, `no checkbox for hidden gate ${gate.name}`);
        continue;
      }
      assert.exists(box, `checkbox for ${gate.name}`);
      await waitFor(() => box.label, 10000);
      assert.notMatch(box.label, /^prefs-feature|^flexannotate-/, gate.name);
    }
  });

  it("sets the main switch of each group in bold and indents the rest", function () {
    assert.equal(
      el("flexannotate-feature-organizer").style.fontWeight,
      "600",
      "main switch is bold",
    );
    assert.notEqual(
      el("flexannotate-feature-organizerToolbarButton").style.fontWeight,
      "600",
    );
    assert.notEqual(
      el("flexannotate-feature-organizerToolbarButton").parentElement.style
        .marginInlineStart,
      "",
      "dependent row is indented",
    );
  });

  it("switches a gate off and on through its checkbox", async function () {
    const box = el("flexannotate-feature-outlineScopeHeading");
    assert.isTrue(box.checked);

    box.click();
    assert.isFalse(box.checked);
    assert.strictEqual(
      Zotero.Prefs.get(PREF + "outlineScopeHeading", true),
      false,
    );
    assert.isFalse(api().gates.isFeatureEnabled("outlineScopeHeading"));

    box.click();
    assert.isTrue(box.checked);
    assert.isUndefined(Zotero.Prefs.get(PREF + "outlineScopeHeading", true));
    assert.isTrue(api().gates.isFeatureEnabled("outlineScopeHeading"));
  });

  it("greys out dependents of a switched-off gate and explains why", async function () {
    el("flexannotate-feature-organizer").click();
    try {
      await waitFor(
        () => el("flexannotate-feature-organizerToolbarButton").disabled,
      );
      const note = el("flexannotate-feature-note-organizerToolbarButton");
      await waitFor(() => !note.hidden && note.textContent.trim());
      assert.isFalse(el("flexannotate-feature-annotationIndex").disabled);
    } finally {
      el("flexannotate-feature-organizer").click();
    }
    await waitFor(
      () => !el("flexannotate-feature-organizerToolbarButton").disabled,
    );
  });

  it("the citation dialog main switch greys out the whole dialog group", async function () {
    el("flexannotate-feature-citationDialog").click();
    try {
      for (const name of [
        "outlineView",
        "citedTracking",
        "footnoteJump",
        "dialogShowPlace",
        "persistentDialogPatch",
        "narrowDialogLayout",
        "modeSelector",
      ]) {
        await waitFor(() => el(`flexannotate-feature-${name}`).disabled);
      }
      assert.isFalse(api().gates.isFeatureEnabled("persistentDialogPatch"));
    } finally {
      el("flexannotate-feature-citationDialog").click();
    }
    await waitFor(
      () => !el("flexannotate-feature-persistentDialogPatch").disabled,
    );
  });

  it("marks startup gates as needing a restart", async function () {
    const note = el("flexannotate-feature-note-readerMenu");
    await waitFor(() => !note.hidden && note.textContent.trim());
    assert.isTrue(el("flexannotate-feature-note-outlineScopeHeading").hidden);
  });
});
