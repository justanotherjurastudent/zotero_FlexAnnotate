/**
 * tagSuggest — reine Reihenfolge der `§`-Tag-Vorschläge im Tag-Feld. Keine
 * Zotero-Importe, in Node testbar.
 *
 * Zotero sortiert die Tag-Vorschläge alphabetisch. Für `§`-Eingaben ordnet
 * diese Logik sie in Baumreihenfolge: erst die Überschriften der Gliederung
 * der Hauptsammlung, dann (je nach Einstellung) alle übrigen `§`-Tags der
 * Bibliothek. Hat die Hauptsammlung keine eigene Gliederung, bleibt es bei der
 * Bibliotheksliste, nach Bibliotheksgliederung geordnet.
 */

import type { FlatHeading } from "./flatHeadings.ts";
import { HEADING_PREFIX } from "./outline.ts";

/**
 * off = Zoteros Standardliste; tree = nur die Gliederung der Hauptsammlung;
 * typed = Bibliotheksteil erst, wenn nach dem `§` weitergetippt wurde;
 * all = Bibliotheksteil immer.
 */
export type TagSuggestMode = "off" | "tree" | "typed" | "all";

export const TAG_SUGGEST_MODES: TagSuggestMode[] = [
  "all",
  "typed",
  "tree",
  "off",
];

export const DEFAULT_TAG_SUGGEST_MODE: TagSuggestMode = "all";

/** Unbekannte Werte (Handeingriff in about:config) gelten als Standard. */
export function normalizeTagSuggestMode(v: unknown): TagSuggestMode {
  return TAG_SUGGEST_MODES.includes(v as TagSuggestMode)
    ? (v as TagSuggestMode)
    : DEFAULT_TAG_SUGGEST_MODE;
}

/**
 * Überschriftzeilen sind nicht wählbar gedacht. Ihr Wert besteht nur aus
 * Leerraum (zwei verschiedene, weil Zeilen mit gleichem Wert zusammenfallen
 * können): Wird eine trotzdem übernommen, speichert das Tag-Feld nichts.
 */
export const HEADER_VALUE_TREE = " ";
export const HEADER_VALUE_LIBRARY = "  ";

export interface SuggestRow {
  /** Text, den das Tag-Feld bei Auswahl übernimmt. */
  value: string;
  /** Angezeigter Text. */
  label: string;
}

export interface SuggestInput {
  /** Passende `§`-Tags der Bibliothek (Datenbankabfrage, beliebige Reihenfolge). */
  candidates: string[];
  /** Überschriften der Gliederung(en) der Hauptsammlung in Baumreihenfolge; leer = keine. */
  treeHeads: Pick<FlatHeading, "tag" | "num">[];
  /** Überschriften der Bibliotheksgliederung in Baumreihenfolge (Ordnung und Nummern). */
  libraryHeads: Pick<FlatHeading, "tag" | "num">[];
  /** Eingabe im Tag-Feld, beginnend mit `§`. */
  typed: string;
  mode: TagSuggestMode;
  headingTree: string;
  headingLibrary: string;
}

/**
 * Zeichenbudget einer Zeile (Name + Nummer). Das Popup kürzt zu lange Zeilen
 * selbst am Ende und würde die Nummer abschneiden; deshalb kürzt labelWithNumber
 * den Namen vorher. shortcut: feste Zeichenzahl statt gemessener Breite — in
 * einem schmaleren Popup kann die Nummer trotzdem fallen, in einem breiteren
 * wird früher gekürzt als nötig; Zeilen ohne Nummer kürzt weiter das Popup.
 */
export const LABEL_MAX_CHARS = 34;

/** "Name (1.2)"; ist das zu lang, wird der Name mit "…" gekürzt, die Nummer bleibt. */
export function labelWithNumber(tag: string, num: string): string {
  const suffix = ` (${num})`;
  if (tag.length + suffix.length <= LABEL_MAX_CHARS) return tag + suffix;
  const room = Math.max(1, LABEL_MAX_CHARS - suffix.length - 1);
  return `${tag.slice(0, room).trimEnd()}…${suffix}`;
}

/** Ordnet nach `order`, danach alphabetisch. */
function orderBy(tags: string[], order: string[]): string[] {
  const pos = new Map(order.map((t, i) => [t, i] as const));
  return [...tags].sort((a, b) => {
    const pa = pos.get(a) ?? Infinity;
    const pb = pos.get(b) ?? Infinity;
    return pa === pb ? a.localeCompare(b) : pa < pb ? -1 : 1;
  });
}

export function suggestRows(input: SuggestInput): SuggestRow[] {
  const have = new Set(input.candidates);
  const treeSet = new Set(input.treeHeads.map((h) => h.tag));
  // Bei gleichem Tag gilt die Nummer aus dem Baum der Hauptsammlung
  const numbers = new Map<string, string>();
  for (const h of [...input.treeHeads, ...input.libraryHeads])
    if (h.num && !numbers.has(h.tag)) numbers.set(h.tag, h.num);
  // Die Nummer steht nur im Label; der Wert (= der Tag-Name) bleibt unberührt.
  const plain = (t: string): SuggestRow => {
    const num = numbers.get(t);
    return { value: t, label: num ? labelWithNumber(t, num) : t };
  };
  const inTree = [...treeSet].filter((t) => have.has(t));
  const rest = orderBy(
    input.candidates.filter((t) => !treeSet.has(t)),
    input.libraryHeads.map((h) => h.tag),
  );

  // Keine eigene Gliederung (oder kein Treffer darin): bibliotheksweite Liste.
  if (!inTree.length && !(treeSet.size && input.mode === "tree")) {
    return rest.map(plain);
  }

  const rows: SuggestRow[] = [];
  if (inTree.length) {
    rows.push({ value: HEADER_VALUE_TREE, label: input.headingTree });
    rows.push(...inTree.map(plain));
  }
  const showLibrary =
    input.mode === "all" ||
    (input.mode === "typed" && input.typed.length > HEADING_PREFIX.length);
  if (showLibrary && rest.length) {
    rows.push({ value: HEADER_VALUE_LIBRARY, label: input.headingLibrary });
    rows.push(...rest.map(plain));
  }
  return rows;
}
