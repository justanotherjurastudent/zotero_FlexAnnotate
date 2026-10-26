import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RESTART_GATES, gates } from "../src/features/gates.ts";
import { FEATURE_GROUPS, gateMessageId } from "../src/prefs/featureGroups.ts";

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

describe("feature texts (Features tab)", () => {
  it("every gate belongs to exactly one group", () => {
    const seen = new Map<string, number>();
    for (const group of FEATURE_GROUPS) {
      for (const name of group.gates) seen.set(name, (seen.get(name) ?? 0) + 1);
    }
    for (const gate of gates) {
      assert.equal(seen.get(gate.name), 1, `group count of ${gate.name}`);
    }
    assert.equal(seen.size, gates.length, "group lists contain unknown gates");
  });

  for (const locale of locales) {
    describe(locale, () => {
      const messages = parse(locale);

      it("has a label and a description for every gate", () => {
        for (const gate of gates) {
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

      it("has no feature text without a gate", () => {
        const known = new Set(
          gates.flatMap((g) => [
            gateMessageId(g.name),
            `${gateMessageId(g.name)}-description`,
          ]),
        );
        for (const id of messages.keys()) {
          if (/^prefs-feature-(?!s-)/.test(id)) {
            assert.ok(known.has(id), `${locale}: ${id} has no gate`);
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
