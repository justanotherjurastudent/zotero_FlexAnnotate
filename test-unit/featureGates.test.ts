import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  gates,
  isFeatureEnabled,
  isKnownGate,
  resolveFeatureEnabled,
  type FeatureGate,
  type GateName,
} from "../src/features/gates.ts";

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
const globalFeatureNames: GateName[] = [
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
  "placeholderCleanup",
  "annotationRowMenu",
  "annotationRowPatch",
];

const dialogInjectorNames: GateName[] = [
  "modeSelector",
  "outlineView",
  "annotationRowPatch",
];

const runtimeGateNames: GateName[] = [
  "citedTracking",
  "footnoteJump",
  "narrowDialogLayout",
  "dialogShowPlace",
  "outlineAnchorTags",
  "outlineScopeHeading",
  "docImport",
  "docExport",
  "noteExport",
  "orphanTags",
  "readerLabelPopup",
  "citaviPrintQuotes",
  "citaviLinks",
  "citeprocResetFix",
];

function withDisabled(disabled: GateName[]): Map<string, FeatureGate> {
  const off = new Set<GateName>(disabled);
  return new Map(
    gates.map((g) => [
      g.name,
      { ...g, enabled: off.has(g.name) ? false : true },
    ]),
  );
}

describe("feature gates", () => {
  it("have unique names", () => {
    const names = gates.map((g) => g.name);
    assert.equal(new Set(names).size, names.length);
  });

  it("every registered feature, injector and runtime sub-feature has a gate", () => {
    for (const n of [
      ...globalFeatureNames,
      ...dialogInjectorNames,
      ...runtimeGateNames,
    ]) {
      assert.ok(
        isKnownGate(n),
        `registered feature/injector/runtime-gate without gate entry: ${n}`,
      );
    }
  });

  it("every gate covers a registered feature, injector or runtime sub-feature", () => {
    const used = new Set<string>([
      ...globalFeatureNames,
      ...dialogInjectorNames,
      ...runtimeGateNames,
    ]);
    for (const g of gates) {
      assert.ok(
        used.has(g.name),
        `gate without registration or runtime use: ${g.name}`,
      );
    }
  });

  it("every requires entry references a known gate without self-dependency", () => {
    for (const g of gates) {
      for (const req of g.requires ?? []) {
        assert.ok(
          isKnownGate(req),
          `unknown requires target ${req} in ${g.name}`,
        );
        assert.notEqual(req, g.name, `self-dependency in ${g.name}`);
      }
    }
  });

  it("isFeatureEnabled reflects the gate for known names and true for unknown", () => {
    for (const g of gates) {
      assert.equal(isFeatureEnabled(g.name), g.enabled);
    }
    assert.equal(isFeatureEnabled("does-not-exist"), true);
  });

  it("disabling organizer cascades to toolbar button, tools fallback, collection menu and export/import sub-features", () => {
    const map = withDisabled(["organizer"]);
    assert.equal(resolveFeatureEnabled("organizer", map), false);
    assert.equal(resolveFeatureEnabled("organizerToolbarButton", map), false);
    assert.equal(resolveFeatureEnabled("toolsMenuFallback", map), false);
    assert.equal(resolveFeatureEnabled("collectionMenu", map), false);
    assert.equal(resolveFeatureEnabled("docImport", map), false);
    assert.equal(resolveFeatureEnabled("docExport", map), false);
    assert.equal(resolveFeatureEnabled("noteExport", map), false);
    assert.equal(resolveFeatureEnabled("orphanTags", map), false);
    assert.equal(resolveFeatureEnabled("outlineView", map), true);
  });

  it("disabling citeOnlyPatch cascades to modeSelector and citeprocResetFix", () => {
    const map = withDisabled(["citeOnlyPatch"]);
    assert.equal(resolveFeatureEnabled("citeOnlyPatch", map), false);
    assert.equal(resolveFeatureEnabled("modeSelector", map), false);
    assert.equal(resolveFeatureEnabled("citeprocResetFix", map), false);
    assert.equal(resolveFeatureEnabled("outlineView", map), true);
  });

  it("disabling citationDialog cascades to modeSelector, outlineView, citedTracking and footnoteJump", () => {
    const map = withDisabled(["citationDialog"]);
    assert.equal(resolveFeatureEnabled("citationDialog", map), false);
    assert.equal(resolveFeatureEnabled("modeSelector", map), false);
    assert.equal(resolveFeatureEnabled("outlineView", map), false);
    assert.equal(resolveFeatureEnabled("citedTracking", map), false);
    assert.equal(resolveFeatureEnabled("footnoteJump", map), false);
    assert.equal(resolveFeatureEnabled("narrowDialogLayout", map), false);
    assert.equal(resolveFeatureEnabled("dialogShowPlace", map), false);
  });

  it("disabling citedTracking cascades to footnoteJump", () => {
    const map = withDisabled(["citedTracking"]);
    assert.equal(resolveFeatureEnabled("citedTracking", map), false);
    assert.equal(resolveFeatureEnabled("footnoteJump", map), false);
    assert.equal(resolveFeatureEnabled("outlineView", map), true);
  });

  it("disabling citaviImport cascades to citaviPrintQuotes and citaviLinks", () => {
    const map = withDisabled(["citaviImport"]);
    assert.equal(resolveFeatureEnabled("citaviImport", map), false);
    assert.equal(resolveFeatureEnabled("citaviPrintQuotes", map), false);
    assert.equal(resolveFeatureEnabled("citaviLinks", map), false);
  });

  it("disabling readerMenu cascades to readerLabelPopup", () => {
    const map = withDisabled(["readerMenu"]);
    assert.equal(resolveFeatureEnabled("readerMenu", map), false);
    assert.equal(resolveFeatureEnabled("readerLabelPopup", map), false);
  });

  it("disabling annotationIndex cascades to organizer, outlineView, externalApi and anchor tags", () => {
    const map = withDisabled(["annotationIndex"]);
    assert.equal(resolveFeatureEnabled("annotationIndex", map), false);
    assert.equal(resolveFeatureEnabled("organizer", map), false);
    assert.equal(resolveFeatureEnabled("outlineView", map), false);
    assert.equal(resolveFeatureEnabled("externalApi", map), false);
    assert.equal(resolveFeatureEnabled("outlineAnchorTags", map), false);
    assert.equal(resolveFeatureEnabled("outlineScopeHeading", map), false);
  });

  it("disabling printMenus cascades to annotationRowMenu", () => {
    const map = withDisabled(["printMenus"]);
    assert.equal(resolveFeatureEnabled("printMenus", map), false);
    assert.equal(resolveFeatureEnabled("annotationRowMenu", map), false);
  });
});
