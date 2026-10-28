import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  HEADER_VALUE_LIBRARY,
  LABEL_MAX_CHARS,
  labelWithNumber,
  HEADER_VALUE_TREE,
  normalizeTagSuggestMode,
  suggestRows,
  type SuggestInput,
} from "../src/features/organizer/logic/tagSuggest.ts";

const base: SuggestInput = {
  candidates: ["§Anhang", "§Einleitung", "§Fremd", "§Hauptteil", "§Zebra"],
  treeHeads: [
    { tag: "§Hauptteil", num: "" },
    { tag: "§Einleitung", num: "" },
    { tag: "§Nicht vorhanden", num: "" },
  ],
  libraryHeads: [],
  typed: "§",
  mode: "all",
  headingTree: "Baum",
  headingLibrary: "Bibliothek",
  headingNoOutline: "Keine Gliederung",
};

const labels = (i: Partial<SuggestInput>) =>
  suggestRows({ ...base, ...i }).map((r) => r.label);

describe("suggestRows", () => {
  it("lists the main collection outline in tree order, then the rest", () => {
    assert.deepEqual(labels({}), [
      "Baum",
      "§Hauptteil",
      "§Einleitung",
      "Bibliothek",
      "§Anhang",
      "§Fremd",
      "§Zebra",
    ]);
  });

  it("shows the outline number in the label only, never in the value", () => {
    const rows = suggestRows({
      ...base,
      treeHeads: [
        { tag: "§Hauptteil", num: "2" },
        { tag: "§Einleitung", num: "1.1" },
      ],
      // Same tag with different number: the main collection's number applies
      libraryHeads: [
        { tag: "§Hauptteil", num: "9" },
        { tag: "§Zebra", num: "3" },
      ],
    });
    const h = rows.find((r) => r.value === "§Hauptteil");
    assert.ok(h, "§Hauptteil should be present in rows");
    assert.equal(h.label, "§Hauptteil (2)");
    const e = rows.find((r) => r.value === "§Einleitung");
    assert.ok(e, "§Einleitung should be present in rows");
    assert.equal(e.label, "§Einleitung (1.1)");
    const a = rows.find((r) => r.value === "§Anhang");
    assert.ok(a, "§Anhang should be present in rows");
    assert.equal(a.label, "§Anhang");
    const z = rows.find((r) => r.value === "§Zebra");
    assert.ok(z, "§Zebra should be present in rows");
    assert.equal(z.label, "§Zebra (3)");
  });

  it("header rows carry whitespace-only, distinct values", () => {
    const [h1, , , h2] = suggestRows(base);
    assert.equal(h1.value, HEADER_VALUE_TREE);
    assert.equal(h2.value, HEADER_VALUE_LIBRARY);
    assert.notEqual(h1.value, h2.value);
    assert.equal(h1.value.trim(), "");
    assert.equal(h2.value.trim(), "");
  });

  it("mode tree shows only the outline", () => {
    assert.deepEqual(labels({ mode: "tree" }), [
      "Baum",
      "§Hauptteil",
      "§Einleitung",
    ]);
  });

  it("mode typed adds the library part only after typing past the §", () => {
    assert.deepEqual(labels({ mode: "typed" }), [
      "Baum",
      "§Hauptteil",
      "§Einleitung",
    ]);
    assert.deepEqual(
      labels({
        mode: "typed",
        typed: "§E",
        candidates: ["§Einleitung", "§Ei"],
      }),
      ["Baum", "§Einleitung", "Bibliothek", "§Ei"],
    );
  });

  it("without an own outline the library list follows the library outline", () => {
    assert.deepEqual(
      labels({
        treeHeads: [],
        libraryHeads: [
          { tag: "§Zebra", num: "" },
          { tag: "§Anhang", num: "" },
        ],
      }),
      [
        "Keine Gliederung",
        "§Zebra",
        "§Anhang",
        "§Einleitung",
        "§Fremd",
        "§Hauptteil",
      ],
    );
  });

  it("gives no header without an own outline when nothing matches", () => {
    assert.deepEqual(labels({ treeHeads: [], candidates: [] }), []);
  });

  it("falls back to the library list when the outline has no match", () => {
    assert.deepEqual(
      labels({ candidates: ["§Fremd", "§Anhang"], mode: "typed" }),
      ["§Anhang", "§Fremd"],
    );
  });

  it("mode tree with an outline but no match shows nothing", () => {
    assert.deepEqual(labels({ candidates: ["§Fremd"], mode: "tree" }), []);
  });

  it("omits the library header when nothing is left for it", () => {
    assert.deepEqual(labels({ candidates: ["§Hauptteil"] }), [
      "Baum",
      "§Hauptteil",
    ]);
  });
});

describe("labelWithNumber", () => {
  it("takes a wider budget from the caller", () => {
    const name = "§Forschungsstand und Forschungslücke im Gesamtbild";
    assert.ok(labelWithNumber(name, "1.2", 34).includes("…"));
    assert.equal(labelWithNumber(name, "1.2", 80), `${name} (1.2)`);
  });

  it("keeps short names whole", () => {
    assert.equal(labelWithNumber("§Einleitung", "1"), "§Einleitung (1)");
  });

  it("cuts a long name with an ellipsis so the number always stays", () => {
    const long = "§Forschungsstand und Forschungslücke im Gesamtbild";
    const label = labelWithNumber(long, "1.2.3");
    assert.ok(label.endsWith("… (1.2.3)"), label);
    assert.ok(label.length <= LABEL_MAX_CHARS, label);
    assert.ok(label.startsWith("§Forschungsstand"), label);
  });

  it("uses the row value untouched in suggestRows", () => {
    const long = "§Eine sehr lange Überschrift, die nicht in die Zeile passt";
    const rows = suggestRows({
      ...base,
      candidates: [long],
      treeHeads: [{ tag: long, num: "4.1" }],
    });
    const row = rows.find((r) => r.value === long);
    assert.ok(row);
    assert.ok(row.label.endsWith(" (4.1)"));
    assert.notEqual(row.label, long + " (4.1)");
  });
});

describe("normalizeTagSuggestMode", () => {
  it("keeps known values and defaults the rest", () => {
    assert.equal(normalizeTagSuggestMode("tree"), "tree");
    assert.equal(normalizeTagSuggestMode("off"), "off");
    assert.equal(normalizeTagSuggestMode("nonsense"), "all");
    assert.equal(normalizeTagSuggestMode(undefined), "all");
  });
});
