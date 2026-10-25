/**
 * Locator rules for display in the reader: which locator applies, and which label
 * it receives. Pure logic without Zotero globals, testable in Node.
 * Origin: pre-merge:src/readerMenu.js (getAnnotationLocator, getLocatorLabel).
 */
import { DEFAULT_LOCATOR, LOCATOR_PREFIX } from "../../../core/locator.ts";

export interface LocatorLabels {
  page: string;
  margin: string;
  opus: string;
}

/**
 * Extracts explicit locator from an annotation's tags. Tags can be plain strings
 * or objects shaped as `{ name }` or `{ tag }`. Only known labels count, plus 'margin'.
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
 * Display text of a locator. `cite` returns Zotero's localized label (or undefined);
 * without it localized fallback strings are used, lastly capitalizing the locator string.
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
  if (locator === "opus" && labels.opus) return labels.opus;
  return locator.charAt(0).toUpperCase() + locator.slice(1);
}

/**
 * Constructs the title for an AnnotationRow ("<Label> <PageLabel>").
 */
export function formatAnnotationTitle(
  label: string,
  pageLabel: string | undefined,
): string {
  return `${label} ${pageLabel || "-"}`;
}
