/**
 * Layout data of the "Features" tab in the preferences pane: which gate sits in
 * which group, and how a gate maps to its Fluent message ids. Pure (no Zotero
 * imports), so it is node-testable and shared by the pane script and the tests.
 *
 * Every gate in `gates.ts` must appear in exactly one group and have a label and
 * a description in both locale files (`test-unit/featureTexts.test.ts` checks it).
 */

import type { GateName } from "../features/gates.ts";

export interface FeatureGroup {
  /** Fluent id suffix: `prefs-features-group-<id>`. */
  id: string;
  gates: readonly GateName[];
}

/** Order = order on screen. */
export const FEATURE_GROUPS: readonly FeatureGroup[] = [
  {
    id: "organizer",
    gates: [
      "annotationIndex",
      "organizer",
      "organizerToolbarButton",
      "toolsMenuFallback",
      "collectionMenu",
      "docImport",
      "docExport",
      "noteExport",
      "orphanTags",
      "outlineAnchorTags",
      "outlineScopeHeading",
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
  {
    id: "citeonly",
    gates: ["citeOnlyPatch", "modeSelector", "citeprocResetFix"],
  },
  {
    id: "print",
    gates: [
      "printMenus",
      "placeholderCleanup",
      "annotationRowMenu",
      "annotationRowPatch",
    ],
  },
  {
    id: "reader",
    gates: ["readerMenu", "readerLabelPopup", "tagSuggest"],
  },
  {
    id: "citavi",
    gates: ["citaviImport", "citaviPrintQuotes", "citaviLinks"],
  },
  {
    id: "api",
    gates: ["externalApi"],
  },
];

/** `organizerToolbarButton` → `prefs-feature-organizer-toolbar-button` (label); append `-description` for the text. */
export function gateMessageId(name: string): string {
  return `prefs-feature-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}
