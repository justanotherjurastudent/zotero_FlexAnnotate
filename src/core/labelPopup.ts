/**
 * Reine Entscheidungen des Seitenzahl-Popups (.label-popup): Locator-Auswahl,
 * Standard-Checkbox, Anwendungsplan, Zielmenge der Radio-Modi. Keine Zotero-Importe.
 * Herkunft: legacy/readerMenu.js enhanceLabelPopup (Zeilen 316-706).
 */
import { DEFAULT_LOCATOR, FALLBACK_LOCATORS } from "./locator.ts";

export interface LocatorOption {
  value: string;
  label: string;
}

/** Locator-Auswahl, nach Anzeigetext sortiert. Fehlt ein Name, zählt der Wert selbst. */
export function buildLocatorOptions(
  values: readonly string[],
  nameOf: (value: string) => string | undefined,
): LocatorOption[] {
  return values
    .map((value) => ({ value, label: nameOf(value) || value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Eingabevalidierung: nur bekannte Locator-Arten dürfen gespeichert werden. */
export function isKnownLocator(
  value: string,
  known: readonly string[] = FALLBACK_LOCATORS,
): boolean {
  return known.includes(value);
}

export interface CheckboxState {
  checked: boolean;
  disabled: boolean;
  /** true: Text "Ist bereits Standard", false: Text "künftig verwenden". */
  alreadyDefault: boolean;
}

/**
 * Die Checkbox ist gesperrt und angehakt, wenn der gewählte Locator schon der
 * Dokument-Standard ist. 'page' gilt als Grundzustand und sperrt nie.
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
  /** Überhaupt etwas zu tun? Ohne Änderung greift FlexAnnotate nicht ein. */
  apply: boolean;
  /** Dokument-Standard ist neu zu setzen. */
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

/** Lineare Modi ('from', 'all') und Zoteros Auto-Erkennung gelten nur für 'page'. */
export function isPageLocator(locator: string): boolean {
  return locator === DEFAULT_LOCATOR;
}

/** Radio-Vorgabe: 'single' vor 'selected'. */
export function preferredRadio(values: readonly string[]): string | null {
  if (values.includes("single")) return "single";
  if (values.includes("selected")) return "selected";
  return null;
}

/** Seitennummer nur übernehmen, wenn sie eindeutig einer Annotation gilt. */
export function shouldSetPageLabel(
  newLabel: string | undefined,
  targetCount: number,
  mode: string,
): boolean {
  return !!newLabel && (targetCount === 1 || mode === "single");
}

/** Ein Ziel: Schlüssel, Seitenindex (null = Position nicht lesbar), Nutzlast. */
export interface Ref<T = unknown> {
  key: string;
  pageIndex?: number | null;
  item: T;
}

/**
 * Welche Annotationen ein Radio-Modus anfasst. 'page', 'from' und 'all' wirken nur
 * bei Locator 'page' flächig; sonst nur auf die aktuelle Annotation.
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
