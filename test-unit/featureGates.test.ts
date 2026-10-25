import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gates, isFeatureEnabled, isKnownGate } from "../src/features/gates.ts";

/**
 * Expected plugin registrations. They must match the entries in
 * `src/features/registry.ts`: `globalFeatureEntries` (lifecycle features) and
 * `dialogInjectorEntries` (citation dialog).
 *
 * `registry.ts` itself is not importable under `node --test` (it loads Zotero
 * modules through imports without a `.ts` suffix). This test therefore checks
 * the pure `gates.ts` against this explicit expectation: a typo in a gate
 * name fails immediately instead of silently making the disabling of a
 * feature ineffective.
 */
const globalFeatureNames = [
  "organizer",
  "organizerToolbarButton",
  "toolsMenuFallback",
  "collectionMenu",
  "citationDialog",
  "persistentDialogPatch",
  "citeOnlyPatch",
  "readerMenu",
  "citaviImport",
  "annotationIndex",
  "externalApi",
  "tagSuggest",
  "printMenus",
  "annotationRowMenu",
  "annotationRowPatch",
];

const dialogInjectorNames = [
  "modeSelector",
  "outlineView",
  "annotationRowPatch",
];

describe("feature gates", () => {
  it("have unique names", () => {
    const names = gates.map((g) => g.name);
    assert.equal(new Set(names).size, names.length);
  });

  it("every registered feature and injector has a gate", () => {
    for (const n of [...globalFeatureNames, ...dialogInjectorNames]) {
      assert.ok(
        isKnownGate(n),
        `registriertes Feature/Injector ohne Gate-Eintrag: ${n}`,
      );
    }
  });

  it("every gate covers at least one registered feature or injector", () => {
    const used = new Set([...globalFeatureNames, ...dialogInjectorNames]);
    for (const g of gates) {
      assert.ok(used.has(g.name), `Gate ohne Registrierung: ${g.name}`);
    }
  });

  it("isFeatureEnabled reflects the gate for known names and true for unknown", () => {
    for (const g of gates) {
      assert.equal(isFeatureEnabled(g.name), g.enabled);
    }
    assert.equal(isFeatureEnabled("does-not-exist"), true);
  });
});
