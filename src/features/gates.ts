/**
 * Central feature switches (pure, no Zotero imports — node-testable).
 *
 * Every major feature is listed here as a `FeatureGate` so it can be turned
 * off individually — for example when Zotero later ships the feature itself,
 * an internal API changes, or a feature should be disabled temporarily.
 *
 * This file holds only data and the pure lookup logic. `registry.ts` derives
 * the active `globalFeatures`/`dialogInjectors` from it; the actual
 * registration and Zotero coupling lives there.
 *
 * Note on semantics: `isFeatureEnabled` returns `true` for unknown names
 * (fail-open). A typo in a gate name therefore silently disables the switch —
 * the consistency test `test-unit/featureGates.test.ts` guards exactly that.
 */

export interface FeatureGate {
  name: string;
  description: string;
  enabled: boolean;
}

/**
 * Set a feature's `enabled` to `false` to remove it from the registrations.
 * `description` names what the feature does and when one would disable it.
 */
export const gates: FeatureGate[] = [
  {
    name: "organizer",
    description: "Organizer: main window, menu entry, outline and note export.",
    enabled: true,
  },
  {
    name: "organizerToolbarButton",
    description: "Organizer button in the Zotero toolbar.",
    enabled: true,
  },
  {
    name: "toolsMenuFallback",
    description: "Organizer entry in the Tools menu (Zotero 7 fallback).",
    enabled: true,
  },
  {
    name: "collectionMenu",
    description:
      "Right-click on a collection: 'Organizer for this collection'.",
    enabled: true,
  },
  {
    name: "citationDialog",
    description:
      "Citation dialog window watcher; base for the mode selector, outline view and row patch in the dialog.",
    enabled: true,
  },
  {
    name: "persistentDialogPatch",
    description:
      "Keep the citation window open (companion window), including remembering position/size.",
    enabled: true,
  },
  {
    name: "citeOnlyPatch",
    description:
      "Citation-only insertion: integration patch for the citation dialog.",
    enabled: true,
  },
  {
    name: "readerMenu",
    description: "Reader context menu of the Zotero reader.",
    enabled: true,
  },
  {
    name: "citaviImport",
    description: "Citavi import (files, links, print quotes).",
    enabled: true,
  },
  {
    name: "annotationIndex",
    description:
      "Library-wide annotation index (notifier observer) as the basis of the organizer.",
    enabled: true,
  },
  {
    name: "externalApi",
    description:
      "Plugin-to-plugin interface Zotero.FlexAnnotate for AI integrations.",
    enabled: true,
  },
  {
    name: "tagSuggest",
    description: "Heading-ordered §-tag suggestions in the tag row (PDF/item).",
    enabled: true,
  },
  {
    name: "printMenus",
    description: "Menus for print annotations (print rank, locator).",
    enabled: true,
  },
  {
    name: "annotationRowMenu",
    description: "Context menu on annotation rows in the item tree.",
    enabled: true,
  },
  {
    name: "annotationRowPatch",
    description:
      "Annotation-row patch: stabilises the list rendering (formatting). Counts as a feature and as a citation dialog injector.",
    enabled: true,
  },
  {
    name: "modeSelector",
    description: "Mode selector (annotations/works) in the citation dialog.",
    enabled: true,
  },
  {
    name: "outlineView",
    description:
      "Outline view in the citation dialog (annotations and works tab).",
    enabled: true,
  },
];

const gateByName = new Map(gates.map((g) => [g.name, g.enabled]));

/** Is there a gate with this name? (Consistency check for tests/code.) */
export function isKnownGate(name: string): boolean {
  return gateByName.has(name);
}

/**
 * Switch lookup for the registrations. Unknown names count as active
 * (fail-open), so a newly added feature without a gate key does not silently
 * disappear — see the header note.
 */
export function isFeatureEnabled(name: string): boolean {
  return gateByName.get(name) ?? true;
}
