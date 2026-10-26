import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  RESTART_GATES,
  gates,
  resolveFeatureEnabled,
  type FeatureGate,
} from "../src/features/gates.ts";
import {
  FEATURE_GROUPS,
  HIDDEN_GATES,
  gateMessageId,
} from "../src/prefs/featureGroups.ts";

/** Message ids of a Fluent file and whether each has a `.label` attribute. */
function parse(locale: string): Map<string, { label: boolean }> {
  // npm runs the unit tests from the project root
  const text = readFileSync(
    join(process.cwd(), "addon", "locale", locale, "features.ftl"),
    "utf8",
  );
  const out = new Map<string, { label: boolean }>();
  let current: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const id = /^([a-z][a-z0-9-]*)\s*=/.exec(line);
    if (id) {
      current = id[1];
      out.set(current, { label: false });
    } else if (current && /^\s+\.label\s*=\s*\S/.test(line)) {
      out.get(current)!.label = true;
    }
  }
  return out;
}

const locales = ["de", "en-US"];
const shown = gates.filter((g) => !HIDDEN_GATES.includes(g.name));

describe("feature texts (Features on/off tab)", () => {
  it("every gate is in exactly one group or hidden, never both", () => {
    const seen = new Map<string, number>();
    for (const group of FEATURE_GROUPS) {
      for (const name of group.gates) seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    for (const gate of gates) {
      const inGroup = seen.get(gate.name) ?? 0;
      const hidden = HIDDEN_GATES.includes(gate.name);
      assert.equal(
        inGroup + (hidden ? 1 : 0),
        1,
        `${gate.name}: ${inGroup} group(s), hidden=${hidden}`,
      );
    }
    assert.equal(
      seen.size + HIDDEN_GATES.length,
      gates.length,
      "group or hidden lists contain unknown gates",
    );
  });

  it("the main switch of a group switches everything below it off", () => {
    for (const group of FEATURE_GROUPS) {
      const [main, ...rest] = group.gates;
      const map = new Map<string, FeatureGate>(
        gates.map((g) => [g.name, { ...g, enabled: g.name !== main }]),
      );
      for (const name of rest) {
        assert.equal(
          resolveFeatureEnabled(name, map),
          false,
          `${name} stays on when its group's main switch ${main} is off`,
        );
      }
    }
  });

  for (const locale of locales) {
    describe(locale, () => {
      const messages = parse(locale);

      it("has a label and a description for every shown gate", () => {
        for (const gate of shown) {
          const id = gateMessageId(gate.name);
          assert.ok(messages.get(id)?.label, `${locale}: label ${id}`);
          assert.ok(
            messages.has(`${id}-description`),
            `${locale}: ${id}-description`,
          );
        }
      });

      it("has a heading for every group and the shared strings", () => {
        for (const group of FEATURE_GROUPS) {
          assert.ok(
            messages.has(`prefs-features-group-${group.id}`),
            `${locale}: group ${group.id}`,
          );
        }
        for (const id of [
          "prefs-tab-options",
          "prefs-tab-features",
          "prefs-features-intro",
          "prefs-features-restart",
          "prefs-features-needs",
        ]) {
          assert.ok(messages.has(id), `${locale}: ${id}`);
        }
      });

      it("has no feature text for hidden or unknown gates", () => {
        const known = new Set(
          shown.flatMap((g) => [
            gateMessageId(g.name),
            `${gateMessageId(g.name)}-description`,
          ]),
        );
        for (const id of messages.keys()) {
          if (/^prefs-feature-(?!s-)/.test(id)) {
            assert.ok(known.has(id), `${locale}: ${id} has no shown gate`);
          }
        }
      });
    });
  }

  it("both locales define the same ids", () => {
    assert.deepEqual(
      [...parse("de").keys()].sort(),
      [...parse("en-US").keys()].sort(),
    );
  });

  it("restart gates are known gates without duplicates", () => {
    const names = new Set(gates.map((g) => g.name));
    for (const name of RESTART_GATES) assert.ok(names.has(name), name);
    assert.equal(new Set(RESTART_GATES).size, RESTART_GATES.length);
  });
});
