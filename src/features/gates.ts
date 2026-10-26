/**
 * Central feature switches (pure, no Zotero imports — node-testable).
 *
 * Every feature and sub-feature of FlexAnnotate is listed here as a
 * `FeatureGate` so it can be turned off individually — for example when Zotero
 * later ships the feature itself, an internal API changes, or a feature should
 * be disabled temporarily.
 *
 * Two kinds of gates live in `gates`:
 * 1. **Lifecycle & dialog-injector gates** — consumed by `registry.ts` to
 *    filter `activeGlobalFeatures()` and `activeDialogInjectors()` at startup.
 * 2. **Runtime sub-feature gates** — queried via `isFeatureEnabled(name)` in
 *    render/action paths (e.g. `citedTracking`, `footnoteJump`, `docImport`,
 *    `outlineAnchorTags`, `citeprocResetFix`).
 *
 * Coupled features declare their parent gate(s) via `requires`, so turning off
 * a base feature automatically disables its dependent entry points and sub-features
 * without leaving dead UI controls behind.
 *
 * Hotfix switch without a release: set the hidden boolean pref
 * `extensions.flexannotate.gate.<name>` to `false` in about:config. Runtime
 * gates take effect on the next render/action; lifecycle and dialog-injector
 * gates are evaluated at startup (`registry.ts`) and need a Zotero restart.
 * An override can only switch off, never on.
 *
 * Note on semantics: `isFeatureEnabled` returns `true` for unknown names
 * (fail-open). A typo in a gate name therefore silently disables the switch —
 * the consistency test `test-unit/featureGates.test.ts` guards against that.
 */

export type GateName =
  // Lifecycle features & dialog injectors (registry.ts)
  | "organizer"
  | "organizerToolbarButton"
  | "toolsMenuFallback"
  | "collectionMenu"
  | "citationDialog"
  | "persistentDialogPatch"
  | "citeOnlyPatch"
  | "readerMenu"
  | "citaviImport"
  | "annotationIndex"
  | "externalApi"
  | "tagSuggest"
  | "printMenus"
  | "placeholderCleanup"
  | "annotationRowMenu"
  | "annotationRowPatch"
  | "modeSelector"
  | "outlineView"
  // Runtime sub-features
  | "citedTracking"
  | "footnoteJump"
  | "narrowDialogLayout"
  | "dialogShowPlace"
  | "outlineAnchorTags"
  | "outlineScopeHeading"
  | "docImport"
  | "docExport"
  | "noteExport"
  | "orphanTags"
  | "readerLabelPopup"
  | "citaviPrintQuotes"
  | "citaviLinks"
  | "citeprocResetFix";

export interface FeatureGate {
  name: GateName;
  description: string;
  enabled: boolean;
  /**
   * Other gates that must be enabled for this feature to be active.
   * Disabling a required gate automatically disables this gate as well.
   */
  requires?: readonly GateName[];
}

/**
 * Set a feature's `enabled` to `false` to disable it (and any gate that
 * `requires` it).
 */
export const gates: readonly FeatureGate[] = [
  // ── Lifecycle features & dialog injectors ────────────────────────────────
  {
    name: "organizer",
    description: "Organizer: main window, menu entry, outline and note export.",
    enabled: true,
    requires: ["annotationIndex"],
  },
  {
    name: "organizerToolbarButton",
    description: "Organizer button in the Zotero toolbar.",
    enabled: true,
    requires: ["organizer"],
  },
  {
    name: "toolsMenuFallback",
    description: "Organizer entry in the Tools menu (Zotero 7 fallback).",
    enabled: true,
    requires: ["organizer"],
  },
  {
    name: "collectionMenu",
    description:
      "Right-click on a collection: 'Organizer for this collection'.",
    enabled: true,
    requires: ["organizer"],
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
    requires: ["annotationIndex"],
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
    name: "placeholderCleanup",
    description:
      "Removes the empty placeholder file that print annotations hang on, once Zotero's own delete has removed its last annotation (unless the setting to keep empty placeholders is on).",
    enabled: true,
  },
  {
    name: "annotationRowMenu",
    description: "Context menu on annotation rows in the item tree.",
    enabled: true,
    requires: ["printMenus"],
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
    requires: ["citationDialog", "citeOnlyPatch"],
  },
  {
    name: "outlineView",
    description:
      "Outline view in the citation dialog (annotations and works tab).",
    enabled: true,
    requires: ["citationDialog", "annotationIndex"],
  },

  // ── Runtime sub-features ─────────────────────────────────────────────────
  {
    name: "citedTracking",
    description:
      "Track already-cited annotations in the citation dialog (green check, document variable sync, manual mark/unmark).",
    enabled: true,
    requires: ["outlineView"],
  },
  {
    name: "footnoteJump",
    description:
      "Footnote number badges, popover on the green check, and click-to-jump into Word/LibreOffice.",
    enabled: true,
    requires: ["citedTracking"],
  },
  {
    name: "narrowDialogLayout",
    description:
      "Stacked single-column layout below 750 px in the persistent citation window and moving switches into the gear menu.",
    enabled: true,
    requires: ["outlineView", "persistentDialogPatch"],
  },
  {
    name: "dialogShowPlace",
    description:
      "'Show citation place' button in the citation dialog preview (opens PDF reader at annotation).",
    enabled: true,
    requires: ["outlineView"],
  },
  {
    name: "outlineAnchorTags",
    description:
      "Sync heading §-tags onto the ★outline note itself so tags exist in library autocomplete even without filed items.",
    enabled: true,
    requires: ["annotationIndex"],
  },
  {
    name: "outlineScopeHeading",
    description:
      "Name the ★outline note's <h1> heading after its scope (library or top-level collection).",
    enabled: true,
    requires: ["annotationIndex"],
  },
  {
    name: "docImport",
    description:
      "Import outline headings from Word (.docx) or LibreOffice (.odt) in the Organizer footer.",
    enabled: true,
    requires: ["organizer"],
  },
  {
    name: "docExport",
    description:
      "Export outline headings to Word (.docx) or LibreOffice (.odt) in the Organizer footer.",
    enabled: true,
    requires: ["organizer"],
  },
  {
    name: "noteExport",
    description:
      "Export the outline with its filed quotes as a standalone Zotero note.",
    enabled: true,
    requires: ["organizer"],
  },
  {
    name: "orphanTags",
    description:
      "Detect orphaned §-heading tags in the Organizer and offer reassignment or removal.",
    enabled: true,
    requires: ["organizer"],
  },
  {
    name: "readerLabelPopup",
    description:
      "CSL locator-type selector inside the PDF reader's page-number popup.",
    enabled: true,
    requires: ["readerMenu"],
  },
  {
    name: "citaviPrintQuotes",
    description:
      "Second import pass for Citavi XML: import quotes without PDF attachment as print annotations.",
    enabled: true,
    requires: ["citaviImport"],
  },
  {
    name: "citaviLinks",
    description:
      "Second import pass for Citavi XML: link anthology contributions to their parent volume.",
    enabled: true,
    requires: ["citaviImport"],
  },
  {
    name: "citeprocResetFix",
    description:
      "Workaround for Zotero bug in Session.prototype.resetRequest that clears rebuildCiteprocState too early.",
    enabled: true,
    requires: ["citeOnlyPatch"],
  },
];

const gateByName = new Map<string, FeatureGate>(gates.map((g) => [g.name, g]));

/**
 * Gates that are evaluated once at startup (lifecycle features and dialog
 * injectors in `registry.ts`). Changing one needs a Zotero restart; all other
 * gates take effect on the next render/action. Shown in the preferences pane.
 */
export const RESTART_GATES: readonly GateName[] = [
  "organizer",
  "organizerToolbarButton",
  "toolsMenuFallback",
  "collectionMenu",
  "citationDialog",
  "persistentDialogPatch",
  "citeOnlyPatch",
  "readerMenu",
  "citaviImport",
  "annotationIndex",
  "externalApi",
  "tagSuggest",
  "printMenus",
  "placeholderCleanup",
  "annotationRowMenu",
  "annotationRowPatch",
  "modeSelector",
  "outlineView",
];

/** Is there a gate with this name? (Consistency check for tests/code.) */
export function isKnownGate(name: string): name is GateName {
  return gateByName.has(name);
}

/** Prefix of the per-gate override prefs (`<prefix><gateName>`, boolean). */
export const GATE_PREF_PREFIX = "extensions.flexannotate.gate.";

/**
 * Reads the user/hotfix override of a gate. Only an explicit `false` switches
 * a feature off; unset or any other value leaves the `enabled` flag in charge,
 * so an override can never enable something the source disabled.
 */
export type GateOverrideReader = (name: string) => boolean | undefined;

/**
 * Default reader: the hidden pref `extensions.flexannotate.gate.<name>`
 * (settable in about:config, no pref default is registered). Resolves the
 * `Zotero` global at call time so this module stays importable under Node.
 * Never throws; on any error the gate is left on (fail-open).
 */
const prefOverride: GateOverrideReader = (name) => {
  try {
    const v = (globalThis as any).Zotero?.Prefs?.get(
      GATE_PREF_PREFIX + name,
      true,
    );
    return typeof v === "boolean" ? v : undefined;
  } catch {
    return undefined;
  }
};

let readOverride: GateOverrideReader = prefOverride;

/** Replaces the override reader (tests); call without argument to restore. */
export function setGateOverrideReader(reader?: GateOverrideReader): void {
  readOverride = reader ?? prefOverride;
}

/**
 * Evaluates whether a named feature is enabled within a given gate map,
 * recursively checking any `requires` dependencies. Unknown names fail open
 * (`true`). Cycle-safe via `visited`.
 */
export function resolveFeatureEnabled(
  name: string,
  lookup: ReadonlyMap<string, FeatureGate> = gateByName,
  visited: Set<string> = new Set(),
): boolean {
  if (visited.has(name)) return true;
  const gate = lookup.get(name);
  if (!gate) return true;
  if (!gate.enabled || readOverride(name) === false) return false;
  if (gate.requires) {
    visited.add(name);
    for (const req of gate.requires) {
      if (!resolveFeatureEnabled(req, lookup, visited)) return false;
    }
  }
  return true;
}

/**
 * Switch lookup for registrations and runtime UI guards. Unknown names count
 * as active (fail-open), so a newly added feature without a gate key does not
 * silently disappear — see the header note.
 */
export function isFeatureEnabled(name: string): boolean {
  return resolveFeatureEnabled(name, gateByName);
}
