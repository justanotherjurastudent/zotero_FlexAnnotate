import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GATE_PREF_PREFIX,
  gates,
  isFeatureEnabled,
  setGateOverrideReader,
} from "../src/features/gates.ts";

describe("gate pref overrides", () => {
  afterEach(() => setGateOverrideReader());

  it("only an explicit false switches a gate off", () => {
    setGateOverrideReader((n) => (n === "readerMenu" ? false : undefined));
    assert.equal(isFeatureEnabled("readerMenu"), false);
    assert.equal(isFeatureEnabled("printMenus"), true);

    setGateOverrideReader(() => true);
    assert.equal(isFeatureEnabled("readerMenu"), true);
  });

  it("cascades through requires like a source-level disable", () => {
    setGateOverrideReader((n) => (n === "organizer" ? false : undefined));
    assert.equal(isFeatureEnabled("organizerToolbarButton"), false);
    assert.equal(isFeatureEnabled("docExport"), false);
    assert.equal(isFeatureEnabled("outlineView"), true);
  });

  it("never switches on a gate the source disabled", () => {
    const gate = gates.find((g) => g.name === "readerMenu")!;
    const was = gate.enabled;
    (gate as { enabled: boolean }).enabled = false;
    try {
      setGateOverrideReader(() => true);
      assert.equal(isFeatureEnabled("readerMenu"), false);
    } finally {
      (gate as { enabled: boolean }).enabled = was;
    }
  });

  it("unknown names stay fail-open even with an override reader", () => {
    setGateOverrideReader(() => false);
    assert.equal(isFeatureEnabled("does-not-exist"), true);
  });

  it("the default reader tolerates a missing or broken Zotero global", () => {
    const g = globalThis as any;
    assert.equal(g.Zotero, undefined);
    assert.equal(isFeatureEnabled("organizer"), true);
    g.Zotero = {
      Prefs: {
        get(key: string) {
          if (key === GATE_PREF_PREFIX + "organizer") return false;
          if (key === GATE_PREF_PREFIX + "readerMenu") return "no";
          throw new Error("boom");
        },
      },
    };
    try {
      assert.equal(isFeatureEnabled("organizer"), false);
      assert.equal(isFeatureEnabled("readerMenu"), true);
      assert.equal(isFeatureEnabled("printMenus"), true);
    } finally {
      delete g.Zotero;
    }
  });
});
