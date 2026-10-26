/**
 * Layout data of the "Features on/off" tab in the preferences pane: which gate sits
 * in which group, and how a gate maps to its Fluent message ids. Pure (no Zotero
 * imports), so it is node-testable and shared by the pane script and the tests.
 *
 * The first gate of a group is its main switch: it is shown first and in bold, the
 * others are indented below it and greyed out while it is off (they `require` it
 * in `gates.ts`). A group with one gate is just that gate.
 *
 * Every gate in `gates.ts` is either in exactly one group or in `HIDDEN_GATES`.
 * Each shown gate needs a label and a description in both locale files
 * (`test-unit/featureTexts.test.ts` checks it).
 */

import type { GateName } from "../features/gates.ts";

export interface FeatureGroup {
  /** Fluent id suffix: `prefs-features-group-<id>`. */
  id: string;
  /** Main switch first, then the gates below it. */
  gates: readonly GateName[];
}

/** Order = order on screen. */
export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    id: "index",
    gates: ["annotationIndex", "outlineAnchorTags", "outlineScopeHeading"],
  },
  {
    id: "organizer",
    gates: [
      "organizer",
      "organizerToolbarButton",
      "toolsMenuFallback",
      "collectionMenu",
      "orphanTags",
    ],
  },
  {
    id: "dialog",
    gates: [
      "citationDialog",
      "outlineView",
      "citedTracking",
      "footnoteJump",
      "dialogShowPlace",
      "persistentDialogPatch",
      "narrowDialogLayout",
    ],
  },
  { id: "citeonly", gates: ["citeOnlyPatch", "modeSelector"] },
  { id: "print", gates: ["printMenus", "annotationRowMenu"] },
  { id: "rows", gates: ["annotationRowPatch"] },
  { id: "reader", gates: ["readerMenu", "readerLabelPopup"] },
  { id: "tags", gates: ["tagSuggest"] },
  { id: "citavi", gates: ["citaviImport", "citaviPrintQuotes", "citaviLinks"] },
  { id: "api", gates: ["externalApi"] },
];

/**
 * Gates that exist in `gates.ts` (about:config still works) but are not offered
 * in the settings:
 * - docImport, docExport, noteExport: only run when the user clicks their
 *   button in the organizer; the organizer switch covers them.
 * - citeprocResetFix: workaround for a Zotero bug that also exists in older
 *   versions; it is meant to be limited by Zotero version in code, not by the user.
 * - placeholderCleanup: already has its own setting ("Keep empty placeholder
 *   attachments") in the Settings tab; two switches for one thing would conflict.
 */
export const HIDDEN_GATES: readonly GateName[] = [
  "docImport",
  "docExport",
  "noteExport",
  "citeprocResetFix",
  "placeholderCleanup",
];

/** `organizerToolbarButton` → `prefs-feature-organizer-toolbar-button` (label); append `-description` for the text. */
export function gateMessageId(name: string): string {
  return `prefs-feature-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}
