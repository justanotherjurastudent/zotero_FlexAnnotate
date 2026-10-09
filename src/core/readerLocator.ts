/**
 * Locator-Regeln für die Anzeige im Reader: welcher Locator gilt, und welche Beschriftung
 * er bekommt. Reine Logik ohne Zotero-Globals, daher im Node-Test prüfbar.
 * Herkunft: pre-merge:src/readerMenu.js (getAnnotationLocator, getLocatorLabel).
 */
import { DEFAULT_LOCATOR, LOCATOR_PREFIX } from "./locator.ts";

export interface LocatorLabels {
  page: string;
  margin: string;
  opus: string;
}

/**
 * Locator aus dem eigenen Tag einer Annotation. Tags können als Text oder als Objekt
 * `{ name }` bzw. `{ tag }` vorliegen. Nur bekannte Labels zählen, dazu 'margin'.
 */
export function explicitLocatorFromTags(
  tags: readonly unknown[],
  knownLabels: readonly string[] = [],
): string | null {
  for (const t of tags) {
    const name =
      typeof t === "string"
        ? t
        : (t as { name?: string; tag?: string } | null)?.name ||
          (t as { name?: string; tag?: string } | null)?.tag ||
          "";
    if (!name.startsWith(LOCATOR_PREFIX)) continue;
    const locator = name.slice(LOCATOR_PREFIX.length);
    if (knownLabels.includes(locator) || locator === "margin") return locator;
  }
  return null;
}

/**
 * Anzeigetext eines Locators. `cite` liefert Zoteros Bezeichnung (oder undefined);
 * ohne sie greifen die übersetzten Ersatztexte, zuletzt der Locator selbst mit
 * Großbuchstabe.
 */
export function locatorLabelText(
  locator: string | undefined,
  cite: (locator: string) => string | undefined,
  labels: LocatorLabels,
): string {
  if (!locator || locator === DEFAULT_LOCATOR) {
    return cite("page") || labels.page;
  }
  const label = cite(locator);
  if (label) return label;
  if (locator === "margin") return labels.margin;
  if (locator === "opus") return labels.opus;
  return locator.charAt(0).toUpperCase() + locator.slice(1);
}
