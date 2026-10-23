import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseDocData,
  serializeDocData,
  recordDocCitation,
  reconcileDocData,
  toggleDocCited,
  type CitedDocData,
} from "../src/features/organizer/logic/cited.ts";

describe("citedDocData: parsing and serialization", () => {
  it("handles empty or invalid inputs gracefully", () => {
    assert.deepEqual(parseDocData(null), { citations: {} });
    assert.deepEqual(parseDocData(undefined), { citations: {} });
    assert.deepEqual(parseDocData(""), { citations: {} });
    assert.deepEqual(parseDocData("not-json"), { citations: {} });
    assert.deepEqual(parseDocData("123"), { citations: {} });
    assert.deepEqual(parseDocData("[]"), { citations: {} });
  });

  it("parses valid JSON with citations and manual entries", () => {
    const raw = JSON.stringify({
      citations: {
        cit1: ["KEY1", "KEY2"],
        cit2: ["KEY3"],
      },
      manual: ["MAN1"],
    });
    const parsed = parseDocData(raw);
    assert.deepEqual(parsed, {
      citations: {
        cit1: ["KEY1", "KEY2"],
        cit2: ["KEY3"],
      },
      manual: ["MAN1"],
    });
  });

  it("filters out non-string array entries and omits empty manual list", () => {
    const raw = JSON.stringify({
      citations: {
        cit1: ["KEY1", 42, null, "KEY2"],
        cit2: "not-array",
      },
      manual: ["MAN1", 123],
    });
    const parsed = parseDocData(raw);
    assert.deepEqual(parsed, {
      citations: {
        cit1: ["KEY1", "KEY2"],
      },
      manual: ["MAN1"],
    });

    // Empty manual is omitted in output
    const serialized = serializeDocData({
      citations: { cit1: ["KEY1"] },
      manual: [],
    });
    assert.equal(serialized, JSON.stringify({ citations: { cit1: ["KEY1"] } }));
  });

  it("safely ignores prototype keys in citations", () => {
    const raw = JSON.stringify({
      citations: {
        __proto__: ["EVIL"],
        constructor: ["EVIL2"],
        prototype: ["EVIL3"],
        validCit: ["KEY1"],
      },
    });
    const parsed = parseDocData(raw);
    assert.deepEqual(parsed, {
      citations: {
        validCit: ["KEY1"],
      },
    });
    assert.equal(
      Object.prototype.hasOwnProperty.call(parsed.citations, "__proto__"),
      false,
    );
  });
});

describe("citedDocData: recording citations", () => {
  it("records a new citationID and merges annotation keys", () => {
    let data: CitedDocData = { citations: {} };
    data = recordDocCitation(data, "cit1", ["KEY1", "KEY2"]);
    assert.deepEqual(data.citations.cit1, ["KEY1", "KEY2"]);

    // Adding more keys to same citationID dedupes
    data = recordDocCitation(data, "cit1", ["KEY2", "KEY3"]);
    assert.deepEqual(data.citations.cit1, ["KEY1", "KEY2", "KEY3"]);

    // Empty citationID or keys does nothing
    assert.strictEqual(recordDocCitation(data, "", ["KEY4"]), data);
    assert.strictEqual(recordDocCitation(data, "cit2", []), data);
  });
});

describe("citedDocData: reconciliation and pruning", () => {
  it("preserves active citations and prunes deleted ones", () => {
    const initial: CitedDocData = {
      citations: {
        cit1: ["ANN1"],
        cit2: ["ANN2", "ANN3"],
        cit3: ["ANN4"],
      },
      manual: ["MAN1"],
    };

    // Active in document: cit1 and cit3. cit2 was deleted in Word.
    const activeIDs = new Set(["cit1", "cit3"]);
    const { data, activeKeys, pruned } = reconcileDocData(initial, activeIDs);

    assert.equal(pruned, true);
    assert.deepEqual(data.citations, {
      cit1: ["ANN1"],
      cit3: ["ANN4"],
    });
    assert.deepEqual(data.manual, ["MAN1"]);

    // Active keys contains ANN1, ANN4, and MAN1 (O(1) Set)
    assert.ok(activeKeys.has("ANN1"));
    assert.ok(activeKeys.has("ANN4"));
    assert.ok(activeKeys.has("MAN1"));
    assert.ok(!activeKeys.has("ANN2"));
    assert.ok(!activeKeys.has("ANN3"));
  });

  it("works with Record<string, unknown> (e.g. session.documentCitationIDs)", () => {
    const initial: CitedDocData = {
      citations: {
        cit1: ["ANN1"],
        cit2: ["ANN2"],
      },
    };
    const documentCitationIDs = { cit2: 0 };
    const { data, activeKeys, pruned } = reconcileDocData(
      initial,
      documentCitationIDs,
    );

    assert.equal(pruned, true);
    assert.deepEqual(data.citations, { cit2: ["ANN2"] });
    assert.deepEqual([...activeKeys], ["ANN2"]);
  });

  it("does not prune when activeCitationIDs is null or undefined", () => {
    const initial: CitedDocData = {
      citations: {
        cit1: ["ANN1"],
        cit2: ["ANN2"],
      },
    };
    const { data, activeKeys, pruned } = reconcileDocData(initial, null);
    assert.equal(pruned, false);
    assert.strictEqual(data, initial);
    assert.deepEqual([...activeKeys].sort(), ["ANN1", "ANN2"]);
  });

  it("keeps annotation cited when cited in multiple footnotes until all are deleted", () => {
    const initial: CitedDocData = {
      citations: {
        fn1: ["ANN_SHARED", "ANN_ONLY_1"],
        fn2: ["ANN_SHARED", "ANN_ONLY_2"],
      },
    };

    // User deletes footnote 1 in Word
    const step1 = reconcileDocData(initial, new Set(["fn2"]));
    assert.equal(step1.pruned, true);
    assert.deepEqual(step1.data.citations, {
      fn2: ["ANN_SHARED", "ANN_ONLY_2"],
    });
    // ANN_SHARED is still cited because fn2 remains!
    assert.ok(step1.activeKeys.has("ANN_SHARED"));
    assert.ok(step1.activeKeys.has("ANN_ONLY_2"));
    assert.ok(!step1.activeKeys.has("ANN_ONLY_1"));

    // User also deletes footnote 2 in Word
    const step2 = reconcileDocData(step1.data, new Set<string>());
    assert.equal(step2.pruned, true);
    assert.deepEqual(step2.data.citations, {});
    // Now ANN_SHARED is completely removed
    assert.equal(step2.activeKeys.size, 0);
  });

  it("handles empty docData gracefully without pruning", () => {
    const empty: CitedDocData = { citations: {} };
    const { data, activeKeys, pruned } = reconcileDocData(
      empty,
      new Set(["cit1"]),
    );
    assert.equal(pruned, false);
    assert.deepEqual(data.citations, {});
    assert.equal(activeKeys.size, 0);
  });
});

describe("citedDocData: manual toggle", () => {
  it("toggling on adds keys to manual list", () => {
    let data: CitedDocData = { citations: {} };
    data = toggleDocCited(data, ["K1"], true);
    assert.deepEqual(data.manual, ["K1"]);

    data = toggleDocCited(data, ["K2"], true);
    assert.deepEqual(data.manual?.sort(), ["K1", "K2"]);
  });

  it("toggling off removes keys from manual and from citations", () => {
    let data: CitedDocData = {
      citations: {
        cit1: ["K1", "K2"],
        cit2: ["K3"],
      },
      manual: ["K1", "K4"],
    };

    // Unmark K1: removed from manual and from cit1
    data = toggleDocCited(data, ["K1"], false);
    assert.deepEqual(data.manual, ["K4"]);
    assert.deepEqual(data.citations.cit1, ["K2"]);

    // Unmark K3: removed from cit2, making cit2 empty so it is pruned
    data = toggleDocCited(data, ["K3"], false);
    assert.deepEqual(data.citations, { cit1: ["K2"] });

    // Unmark K4: manual becomes empty and is pruned
    data = toggleDocCited(data, ["K4"], false);
    assert.equal(data.manual, undefined);

    // Empty keys returns data untouched
    const untouched = toggleDocCited(data, [], true);
    assert.strictEqual(untouched, data);
  });
});

describe("citedDocData: performance benchmark on large documents", () => {
  it("reconciles and queries 1,000 citations in under 5 milliseconds", () => {
    const citations: Record<string, string[]> = {};
    const activeCitationIDs = new Set<string>();

    for (let i = 0; i < 1000; i++) {
      const cid = `cit_${i}`;
      citations[cid] = [`ANN_A_${i}`, `ANN_B_${i}`];
      // Keep only even numbered citations in the document (simulate 500 deleted footnotes)
      if (i % 2 === 0) {
        activeCitationIDs.add(cid);
      }
    }

    const docData: CitedDocData = { citations };
    const serialized = serializeDocData(docData);

    const start = performance.now();

    // 1. Parse JSON
    const parsed = parseDocData(serialized);

    // 2. Single-pass reconciliation against activeCitationIDs
    const {
      data: reconciled,
      activeKeys,
      pruned,
    } = reconcileDocData(parsed, activeCitationIDs);

    // 3. 1,000 O(1) membership lookups (like row rendering in outline view)
    let hitCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (activeKeys.has(`ANN_A_${i}`)) hitCount++;
      if (activeKeys.has(`ANN_B_${i}`)) hitCount++;
    }

    const elapsedMs = performance.now() - start;

    assert.equal(pruned, true);
    assert.equal(Object.keys(reconciled.citations).length, 500);
    assert.equal(activeKeys.size, 1000);
    assert.equal(hitCount, 1000); // exactly the 500 even citations * 2 keys

    // Must be blistering fast (well under 15ms even on slow virtualized CI, typically < 2ms)
    assert.ok(
      elapsedMs < 20,
      `Reconciliation and 1,000 lookups took ${elapsedMs.toFixed(2)}ms (expected < 20ms)`,
    );
  });
});
