/**
 * Pure decisions of the page-number popup (.label-popup): locator selection,
 * default checkbox, application plan, target set of the radio modes. No Zotero imports.
 * Origin: pre-merge:src/readerMenu.js enhanceLabelPopup (lines 316-706).
 */
import { DEFAULT_LOCATOR, FALLBACK_LOCATORS } from "./locator.ts";

export interface LocatorOption {
  value: string;
  label: string;
}

/** Locator selection, sorted by display text. If a name is missing, the value itself counts. */
export function buildLocatorOptions(
  values: readonly string[],
  nameOf: (value: string) => string | undefined,
): LocatorOption[] {
  return values
    .map((value) => ({ value, label: nameOf(value) || value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Input validation: only known locator types may be stored. */
export function isKnownLocator(
  value: string,
  known: readonly string[] = FALLBACK_LOCATORS,
): boolean {
  return known.includes(value);
}

export interface CheckboxState {
  checked: boolean;
  disabled: boolean;
  /** true: text "Already default", false: text "Use from now on". */
  alreadyDefault: boolean;
}

/**
 * The checkbox is locked and checked when the chosen locator is already the
 * document default. 'page' counts as the base state and never locks.
 */
export function defaultCheckboxState(
  selected: string,
  documentDefault: string,
): CheckboxState {
  const alreadyDefault =
    selected === documentDefault && documentDefault !== DEFAULT_LOCATOR;
  return { checked: alreadyDefault, disabled: alreadyDefault, alreadyDefault };
}

export interface ApplyPlan {
  /** Anything to do at all? Without a change FlexAnnotate does not intervene. */
  apply: boolean;
  /** Set new document default. */
  setDefault: boolean;
}

export function planApply(
  chosen: string,
  currentLocator: string | null,
  makeDefault: boolean,
  currentDefault: string,
  known: readonly string[] = FALLBACK_LOCATORS,
): ApplyPlan {
  if (!isKnownLocator(chosen, known)) {
    return { apply: false, setDefault: false };
  }
  const locatorChanged = chosen !== currentLocator;
  const setDefault = makeDefault && chosen !== currentDefault;
  return { apply: locatorChanged || setDefault, setDefault };
}

/** Linear modes ('from', 'all') and Zotero's auto-detection only apply to 'page'. */
export function isPageLocator(locator: string): boolean {
  return locator === DEFAULT_LOCATOR;
}

/** Radio-Vorgabe: 'single' vor 'selected'. */
export function preferredRadio(values: readonly string[]): string | null {
  if (values.includes("single")) return "single";
  if (values.includes("selected")) return "selected";
  return null;
}

/** Take the page number only if it unambiguously applies to one annotation. */
export function shouldSetPageLabel(
  newLabel: string | undefined,
  targetCount: number,
  mode: string,
): boolean {
  return !!newLabel && (targetCount === 1 || mode === "single");
}

/** One target: key, page index (null = position not readable), payload. */
export interface Ref<T = unknown> {
  key: string;
  pageIndex?: number | null;
  item: T;
}

/**
 * Which annotations a radio mode touches. 'page', 'from' and 'all' only act area-wide
 * for locator 'page'; otherwise only on the current annotation.
 */
export function selectTargets<T>(
  mode: string,
  chosen: string,
  current: Ref<T> | null,
  all: Ref<T>[],
  selectedKeys: readonly string[],
  pageIndex: number | undefined,
): T[] {
  const onlyCurrent = current ? [current] : [];
  const pick = (refs: Ref<T>[]) => refs.map((r) => r.item);
  switch (mode) {
    case "single":
      return pick(onlyCurrent);
    case "selected": {
      const selected = all.filter((r) => selectedKeys.includes(r.key));
      return pick(selected.length ? selected : onlyCurrent);
    }
    case "page":
      return pick(all.filter((r) => r.pageIndex === pageIndex));
    case "from":
      if (chosen === DEFAULT_LOCATOR && pageIndex !== undefined) {
        return pick(
          all.filter(
            (r) => typeof r.pageIndex === "number" && r.pageIndex >= pageIndex,
          ),
        );
      }
      return pick(onlyCurrent);
    case "all":
      return chosen === DEFAULT_LOCATOR ? pick(all) : pick(onlyCurrent);
    default:
      return pick(onlyCurrent);
  }
}
