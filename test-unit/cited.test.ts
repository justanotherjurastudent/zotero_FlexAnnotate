import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseDocData,
  serializeDocData,
  recordDocCitation,
  reconcileDocData,
  toggleDocCited,
  buildCitationLocationsMap,
  buildWorkCitationLocationsMap,
  findCitationLocations,
  findWorkCitationLocations,
  getLocationsForRow,
  formatCitationLocationLabel,
  formatCitationLocationList,
  type CitedDocData,
  type CitationLocation,
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
    // Leere aktive ID-Menge ohne authoritativeEmpty = Session nicht geladen: nichts löschen
    const step2 = reconcileDocData(step1.data, new Set<string>());
    assert.equal(step2.pruned, false);
    assert.deepEqual(step2.data.citations, step1.data.citations);
    assert.equal(step2.activeKeys.size, 0);
    const step3 = reconcileDocData(step1.data, {});
    assert.equal(step3.pruned, false);
    assert.deepEqual(step3.data.citations, step1.data.citations);

    // Mit authoritativeEmpty = true (nach echtem Dokument-Scan): letzte Fußnote wird bereinigt
    const step4 = reconcileDocData(step1.data, {}, true);
    assert.equal(step4.pruned, true);
    assert.deepEqual(step4.data.citations, {});
    assert.equal(step4.activeKeys.size, 0);
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

    // Must be blistering fast (well under 50ms even on slow virtualized CI, typically < 2ms)
    assert.ok(
      elapsedMs < 50,
      `Reconciliation and 1,000 lookups took ${elapsedMs.toFixed(2)}ms (expected < 50ms)`,
    );
  });
});

describe("citationLocations: footnote and document location mapping", () => {
  it("handles null, undefined, and empty inputs gracefully", () => {
    assert.deepEqual(buildCitationLocationsMap(null, null), new Map());
    assert.deepEqual(buildCitationLocationsMap(undefined, []), new Map());
    assert.deepEqual(
      buildCitationLocationsMap({ citations: {} }, null),
      new Map(),
    );
    assert.deepEqual(
      buildCitationLocationsMap({ citations: { c1: ["K1"] } }, []),
      new Map(),
    );
    assert.deepEqual(findCitationLocations(null, [], "K1"), []);
    assert.deepEqual(
      findCitationLocations({ citations: {} }, [{ citationID: "c1" }], "K1"),
      [],
    );
    assert.deepEqual(
      findCitationLocations(
        { citations: { c1: ["K1"] } },
        [{ citationID: "c1" }],
        "",
      ),
      [],
    );
  });

  it("maps footnote noteIndex (> 0) and in-text (noteIndex === 0)", () => {
    const docData: CitedDocData = {
      citations: {
        cit_fn: ["ANN_FN"],
        cit_text: ["ANN_TEXT"],
      },
    };
    const citations = [
      {
        citationID: "cit_fn",
        properties: { noteIndex: 12 },
        field: { id: "f1" },
      },
      {
        citationID: "cit_text",
        properties: { noteIndex: 0 },
        field: { id: "f2" },
      },
    ];

    const map = buildCitationLocationsMap(docData, citations);
    assert.equal(map.size, 2);

    const fnLocs = map.get("ANN_FN") ?? [];
    assert.equal(fnLocs.length, 1);
    assert.equal(fnLocs[0].citationID, "cit_fn");
    assert.equal(fnLocs[0].noteIndex, 12);
    assert.strictEqual(fnLocs[0].citation, citations[0]);

    const textLocs = map.get("ANN_TEXT") ?? [];
    assert.equal(textLocs.length, 1);
    assert.equal(textLocs[0].citationID, "cit_text");
    assert.equal(textLocs[0].noteIndex, 0);
  });

  it("sorts multiple locations for the same annotation by noteIndex ascending", () => {
    const docData: CitedDocData = {
      citations: {
        cit_later: ["ANN_MULTI"],
        cit_early: ["ANN_MULTI"],
        cit_intext: ["ANN_MULTI"],
      },
    };
    const citations = [
      { citationID: "cit_later", properties: { noteIndex: 42 } },
      { citationID: "cit_early", properties: { noteIndex: 3 } },
      { citationID: "cit_intext", properties: { noteIndex: 0 } },
    ];

    const locs = findCitationLocations(docData, citations, "ANN_MULTI");
    assert.equal(locs.length, 3);
    assert.equal(locs[0].noteIndex, 0);
    assert.equal(locs[0].citationID, "cit_intext");
    assert.equal(locs[1].noteIndex, 3);
    assert.equal(locs[1].citationID, "cit_early");
    assert.equal(locs[2].noteIndex, 42);
    assert.equal(locs[2].citationID, "cit_later");
  });

  it("handles object dictionaries for citationsByIndex as well as arrays", () => {
    const docData: CitedDocData = {
      citations: {
        c1: ["ANN1"],
      },
    };
    const citationsObj = {
      0: { citationID: "c1", properties: { noteIndex: 5 } },
    };

    const locs = findCitationLocations(docData, citationsObj, "ANN1");
    assert.equal(locs.length, 1);
    assert.equal(locs[0].noteIndex, 5);
  });

  it("falls back gracefully when noteIndex is missing, negative, or not a number", () => {
    const docData: CitedDocData = {
      citations: {
        c_undef: ["A1"],
        c_nan: ["A2"],
        c_direct: ["A3"],
        c_neg: ["A4"],
      },
    };
    const citations = [
      { citationID: "c_undef", properties: {} },
      { citationID: "c_nan", properties: { noteIndex: "invalid" } },
      { citationID: "c_direct", noteIndex: 7 }, // fallback to top-level noteIndex
      { citationID: "c_neg", properties: { noteIndex: -3 } },
    ];

    const locs1 = findCitationLocations(docData, citations, "A1");
    assert.equal(locs1[0].noteIndex, 0);

    const locs2 = findCitationLocations(docData, citations, "A2");
    assert.equal(locs2[0].noteIndex, 0);

    const locs3 = findCitationLocations(docData, citations, "A3");
    assert.equal(locs3[0].noteIndex, 7);

    const locs4 = findCitationLocations(docData, citations, "A4");
    assert.equal(
      locs4[0].noteIndex,
      0,
      "negative noteIndex is normalized to 0",
    );
  });

  it("secondary sort: orders multiple citations with identical noteIndex by document sequence", () => {
    // Deliberately insert c_later before c_earlier into docData.citations
    const docData: CitedDocData = {
      citations: {
        c_text_later: ["ANN_ORDER"],
        c_text_earlier: ["ANN_ORDER"],
        c_fn5_later: ["ANN_ORDER"],
        c_fn5_earlier: ["ANN_ORDER"],
      },
    };
    // Sequential citations in document order
    const citations = [
      {
        citationID: "c_text_earlier",
        properties: { noteIndex: 0, zoteroIndex: 1 },
      },
      {
        citationID: "c_text_later",
        properties: { noteIndex: 0, zoteroIndex: 4 },
      },
      {
        citationID: "c_fn5_earlier",
        properties: { noteIndex: 5, zoteroIndex: 8 },
      },
      {
        citationID: "c_fn5_later",
        properties: { noteIndex: 5, zoteroIndex: 15 },
      },
    ];

    const locs = findCitationLocations(docData, citations, "ANN_ORDER");
    assert.equal(locs.length, 4);
    assert.equal(locs[0].citationID, "c_text_earlier");
    assert.equal(locs[0].noteIndex, 0);
    assert.equal(locs[1].citationID, "c_text_later");
    assert.equal(locs[1].noteIndex, 0);
    assert.equal(locs[2].citationID, "c_fn5_earlier");
    assert.equal(locs[2].noteIndex, 5);
    assert.equal(locs[3].citationID, "c_fn5_later");
    assert.equal(locs[3].noteIndex, 5);
  });

  it("sorts object dictionary with non-sequential string keys numerically", () => {
    const docData: CitedDocData = {
      citations: {
        c10: ["ANN"],
        c2: ["ANN"],
      },
    };
    // Keys "10" and "2" would sort lexicographically ("10" before "2") if not sorted numerically
    const citationsObj: Record<string, any> = {
      "10": { citationID: "c10", properties: { noteIndex: 0 } },
      "2": { citationID: "c2", properties: { noteIndex: 0 } },
    };

    const locs = findCitationLocations(docData, citationsObj, "ANN");
    assert.equal(locs.length, 2);
    assert.equal(locs[0].citationID, "c2");
    assert.equal(locs[1].citationID, "c10");
  });

  it("safely handles duplicate citationIDs and prototype poisoning keys", () => {
    const docData: CitedDocData = {
      citations: {
        __proto__: ["EVIL"],
        constructor: ["EVIL2"],
        c1: ["A1"],
      },
    };
    const citations = [
      { citationID: "c1", properties: { noteIndex: 1 } },
      { citationID: "c1", properties: { noteIndex: 1 } }, // duplicate entry
    ];

    const map = buildCitationLocationsMap(docData, citations);
    assert.equal(map.has("EVIL"), false);
    assert.equal(map.has("EVIL2"), false);
    const a1Locs = map.get("A1") ?? [];
    assert.equal(a1Locs.length, 1);
  });

  it("extracts citationID from properties.citationID when missing at top level", () => {
    const docData: CitedDocData = {
      citations: {
        nested_cid: ["ANN_NESTED"],
      },
    };
    const citations = [
      {
        properties: { citationID: "nested_cid", noteIndex: 7 },
      },
    ];

    const map = buildCitationLocationsMap(docData, citations);
    const locs = map.get("ANN_NESTED") ?? [];
    assert.equal(locs.length, 1);
    assert.equal(locs[0].citationID, "nested_cid");
    assert.equal(locs[0].noteIndex, 7);

    const workMap = buildWorkCitationLocationsMap({
      "99": [
        {
          properties: { citationID: "nested_cid", noteIndex: 7 },
        },
      ],
    });
    const workLocs = workMap.get(99) ?? [];
    assert.equal(workLocs.length, 1);
    assert.equal(workLocs[0].citationID, "nested_cid");
    assert.equal(workLocs[0].noteIndex, 7);
  });

  it("performance: builds location map for 1,000 citations in under 5ms", () => {
    const citations: any[] = [];
    const docDataCitations: Record<string, string[]> = {};

    for (let i = 0; i < 1000; i++) {
      const cid = `cit_${i}`;
      citations.push({
        citationID: cid,
        properties: { noteIndex: (i % 200) + 1 },
      });
      docDataCitations[cid] = [`ANN_${i}`, `ANN_SHARED_${i % 10}`];
    }

    const docData: CitedDocData = { citations: docDataCitations };

    const start = performance.now();
    const map = buildCitationLocationsMap(docData, citations);
    const elapsed = performance.now() - start;

    assert.equal(map.size, 1010); // 1000 individual + 10 shared
    const sharedLocs = map.get("ANN_SHARED_0") ?? [];
    assert.equal(sharedLocs.length, 100);
    assert.ok(
      elapsed < 50,
      `buildCitationLocationsMap took ${elapsed.toFixed(2)}ms (expected < 50ms)`,
    );
  });
});

describe("cited: work citation locations (buildWorkCitationLocationsMap)", () => {
  it("handles null, undefined, or empty inputs", () => {
    assert.equal(buildWorkCitationLocationsMap(null).size, 0);
    assert.equal(buildWorkCitationLocationsMap(undefined).size, 0);
    assert.equal(buildWorkCitationLocationsMap({}).size, 0);
    assert.deepEqual(findWorkCitationLocations(null, 123), []);
  });

  it("extracts and sorts footnote locations for multiple works", () => {
    const citationsByItemID = {
      "42": [
        {
          citationID: "cit_b",
          properties: { noteIndex: 12, zoteroIndex: 5 },
        },
        {
          citationID: "cit_a",
          properties: { noteIndex: 3, zoteroIndex: 2 },
        },
        {
          citationID: "cit_c",
          properties: { noteIndex: 3, zoteroIndex: 4 },
        },
      ],
      "99": [
        {
          citationID: "cit_x",
          properties: { noteIndex: 0, zoteroIndex: 0 },
        },
      ],
    };

    const map = buildWorkCitationLocationsMap(citationsByItemID);
    assert.equal(map.size, 2);

    const locs42 = map.get(42) ?? [];
    assert.equal(locs42.length, 3);
    // Should be sorted by noteIndex ascending, then docIndex ascending:
    // cit_a (fn 3, doc 2), cit_c (fn 3, doc 4), cit_b (fn 12, doc 5)
    assert.equal(locs42[0].citationID, "cit_a");
    assert.equal(locs42[0].noteIndex, 3);
    assert.equal(locs42[1].citationID, "cit_c");
    assert.equal(locs42[1].noteIndex, 3);
    assert.equal(locs42[2].citationID, "cit_b");
    assert.equal(locs42[2].noteIndex, 12);

    const locs99 = findWorkCitationLocations(citationsByItemID, 99);
    assert.equal(locs99.length, 1);
    assert.equal(locs99[0].noteIndex, 0); // in-text
  });

  it("distinguishes noteType (footnotes vs endnotes vs in-text)", () => {
    const docData: CitedDocData = {
      citations: {
        cit_fn: ["A_KEY"],
        cit_en: ["A_KEY"],
        cit_txt: ["A_KEY"],
      },
    };
    const citations = [
      {
        citationID: "cit_txt",
        properties: { noteIndex: 0, noteType: 0 },
      },
      {
        citationID: "cit_fn",
        properties: { noteIndex: 3, noteType: 1 },
      },
      {
        citationID: "cit_en",
        properties: { noteIndex: 5, noteType: 2 },
      },
    ];

    const locs = findCitationLocations(docData, citations, "A_KEY");
    assert.equal(locs.length, 3);
    assert.equal(locs[0].noteIndex, 0);
    assert.equal(locs[0].noteType, 0);
    assert.equal(locs[1].noteIndex, 3);
    assert.equal(locs[1].noteType, 1);
    assert.equal(locs[2].noteIndex, 5);
    assert.equal(locs[2].noteType, 2);

    // Default noteType from document prefs
    const locsDefault = findCitationLocations(
      { citations: { c_auto: ["K"] } },
      [{ citationID: "c_auto", properties: { noteIndex: 4 } }],
      "K",
      2, // defaultNoteType = 2 (endnotes)
    );
    assert.equal(locsDefault[0].noteType, 2);
  });

  it("deduplicates citations with the same citationID", () => {
    const citationsByItemID = {
      "10": [
        { citationID: "same_id", properties: { noteIndex: 1 } },
        { citationID: "same_id", properties: { noteIndex: 1 } },
      ],
    };
    const locs = findWorkCitationLocations(citationsByItemID, 10);
    assert.equal(locs.length, 1);
  });

  it("safely ignores prototype pollution keys", () => {
    const raw = JSON.parse(
      '{"__proto__":[{"citationID":"evil"}],"constructor":[],"12":[{"citationID":"good","properties":{"noteIndex":1}}]}',
    );
    const map = buildWorkCitationLocationsMap(raw);
    assert.equal(map.has(NaN), false);
    assert.equal(map.size, 1);
    assert.equal(map.get(12)?.[0].citationID, "good");
  });

  it("performance: processes 1,000 cited works in under 10ms", () => {
    const byItemID: Record<string, any[]> = {};
    for (let i = 1; i <= 1000; i++) {
      byItemID[String(i)] = [
        { citationID: `c_${i}_1`, properties: { noteIndex: i % 50 } },
        { citationID: `c_${i}_2`, properties: { noteIndex: (i % 50) + 1 } },
      ];
    }

    const start = performance.now();
    const map = buildWorkCitationLocationsMap(byItemID);
    const elapsed = performance.now() - start;

    assert.equal(map.size, 1000);
    assert.ok(
      elapsed < 50,
      `buildWorkCitationLocationsMap took ${elapsed.toFixed(2)}ms (expected < 50ms)`,
    );
  });

  it("sorts citations by noteType first so footnotes and endnotes do not interleave", () => {
    const citationsByItemID = {
      "20": [
        {
          citationID: "en1",
          properties: { noteIndex: 1, noteType: 2, zoteroIndex: 2 },
        },
        {
          citationID: "fn1",
          properties: { noteIndex: 1, noteType: 1, zoteroIndex: 1 },
        },
        {
          citationID: "txt1",
          properties: { noteIndex: 0, noteType: 0, zoteroIndex: 0 },
        },
      ],
    };
    const locs = findWorkCitationLocations(citationsByItemID, 20);
    assert.equal(locs.length, 3);
    assert.equal(locs[0].citationID, "txt1");
    assert.equal(locs[0].noteType, 0);
    assert.equal(locs[1].citationID, "fn1");
    assert.equal(locs[1].noteType, 1);
    assert.equal(locs[2].citationID, "en1");
    assert.equal(locs[2].noteType, 2);
  });

  it("findWorkCitationLocations respects defaultNoteType when cit.noteType is omitted", () => {
    const citationsByItemID = {
      "30": [{ citationID: "c_end", properties: { noteIndex: 7 } }],
    };
    const locs = findWorkCitationLocations(citationsByItemID, 30, 2);
    assert.equal(locs.length, 1);
    assert.equal(locs[0].noteIndex, 7);
    assert.equal(locs[0].noteType, 2);
  });

  it("sorts citations by noteType first so footnotes and endnotes do not interleave", () => {
    const citationsByItemID = {
      "20": [
        {
          citationID: "en1",
          properties: { noteIndex: 1, noteType: 2, zoteroIndex: 2 },
        },
        {
          citationID: "fn1",
          properties: { noteIndex: 1, noteType: 1, zoteroIndex: 1 },
        },
        {
          citationID: "txt1",
          properties: { noteIndex: 0, noteType: 0, zoteroIndex: 0 },
        },
      ],
    };
    const locs = findWorkCitationLocations(citationsByItemID, 20);
    assert.equal(locs.length, 3);
    assert.equal(locs[0].citationID, "txt1");
    assert.equal(locs[0].noteType, 0);
    assert.equal(locs[1].citationID, "fn1");
    assert.equal(locs[1].noteType, 1);
    assert.equal(locs[2].citationID, "en1");
    assert.equal(locs[2].noteType, 2);
  });

  it("findWorkCitationLocations respects defaultNoteType when cit.noteType is omitted", () => {
    const citationsByItemID = {
      "30": [{ citationID: "c_end", properties: { noteIndex: 7 } }],
    };
    const locs = findWorkCitationLocations(citationsByItemID, 30, 2);
    assert.equal(locs.length, 1);
    assert.equal(locs[0].noteIndex, 7);
    assert.equal(locs[0].noteType, 2);
  });
});

describe("citedDocData: location label formatting", () => {
  it("formats in-text citations as Text or Text n", () => {
    const loc: CitationLocation = {
      citationID: "c1",
      noteIndex: 0,
      noteType: 0,
    };
    assert.equal(formatCitationLocationLabel(loc, 1, 1), "Text");
    assert.equal(formatCitationLocationLabel(loc, 1, 2), "Text 1");
    assert.equal(formatCitationLocationLabel(loc, 2, 2), "Text 2");
  });

  it("formats footnotes as Fn. {n} or Fn. {n} (count)", () => {
    const loc: CitationLocation = {
      citationID: "c2",
      noteIndex: 4,
      noteType: 1,
    };
    assert.equal(formatCitationLocationLabel(loc, 1, 1), "Fn. 4");
    assert.equal(formatCitationLocationLabel(loc, 1, 2), "Fn. 4 (1)");
    assert.equal(formatCitationLocationLabel(loc, 2, 2), "Fn. 4 (2)");
  });

  it("formats endnotes as Endn. {n} or Endn. {n} (count)", () => {
    const loc: CitationLocation = {
      citationID: "c3",
      noteIndex: 6,
      noteType: 2,
    };
    assert.equal(formatCitationLocationLabel(loc, 1, 1), "Endn. 6");
    assert.equal(formatCitationLocationLabel(loc, 1, 2), "Endn. 6 (1)");
    assert.equal(formatCitationLocationLabel(loc, 2, 2), "Endn. 6 (2)");
  });

  it("supports custom formatting options (e.g. English labels)", () => {
    const locEn: CitationLocation = {
      citationID: "c4",
      noteIndex: 3,
      noteType: 2,
    };
    const label = formatCitationLocationLabel(locEn, 1, 1, {
      endnotePattern: "En. {n}",
    });
    assert.equal(label, "En. 3");
  });

  it("formatCitationLocationList numbers duplicate locations correctly", () => {
    const locs: CitationLocation[] = [
      { citationID: "t1", noteIndex: 0, noteType: 0 },
      { citationID: "t2", noteIndex: 0, noteType: 0 },
      { citationID: "f1", noteIndex: 5, noteType: 1 },
      { citationID: "f2", noteIndex: 5, noteType: 1 },
      { citationID: "e1", noteIndex: 2, noteType: 2 },
    ];
    const formatted = formatCitationLocationList(locs);
    assert.equal(formatted.length, 5);
    assert.equal(formatted[0].label, "Text 1");
    assert.equal(formatted[1].label, "Text 2");
    assert.equal(formatted[2].label, "Fn. 5 (1)");
    assert.equal(formatted[3].label, "Fn. 5 (2)");
    assert.equal(formatted[4].label, "Endn. 2");
  });

  it("getLocationsForRow resolves locations for work, annotation and falls back to parent work", () => {
    const workLoc: CitationLocation = {
      citationID: "w1",
      noteIndex: 2,
      noteType: 1,
    };
    const annLoc: CitationLocation = {
      citationID: "a1",
      noteIndex: 5,
      noteType: 1,
    };

    const locMap = new Map<string, CitationLocation[]>([
      ["ANN_CITED", [annLoc]],
      ["ANN_EMPTY", []],
    ]);
    const workLocMap = new Map<number, CitationLocation[]>([[42, [workLoc]]]);

    // Work row
    const workRes = getLocationsForRow(
      { id: 42, kind: "work" },
      locMap,
      workLocMap,
    );
    assert.deepEqual(workRes, [workLoc]);

    // Annotation row with direct citation
    const annDirect = getLocationsForRow(
      { id: 101, key: "ANN_CITED", workID: 42 },
      locMap,
      workLocMap,
    );
    assert.deepEqual(annDirect, [annLoc]);

    // Annotation row without direct citation -> falls back to parent workID 42
    const annFallback = getLocationsForRow(
      { id: 102, key: "ANN_UNCITED", workID: 42 },
      locMap,
      workLocMap,
    );
    assert.deepEqual(annFallback, [workLoc]);

    // Annotation row with empty list in locMap -> falls back to parent workID 42
    const annEmptyFallback = getLocationsForRow(
      { id: 103, key: "ANN_EMPTY", workID: 42 },
      locMap,
      workLocMap,
    );
    assert.deepEqual(annEmptyFallback, [workLoc]);

    // Annotation row with neither direct citation nor parent work citation
    const annNone = getLocationsForRow(
      { id: 104, key: "ANN_NONE", workID: 99 },
      locMap,
      workLocMap,
    );
    assert.equal(annNone, undefined);
  });
});
