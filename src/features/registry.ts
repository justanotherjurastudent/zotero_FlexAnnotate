/**
 * Central feature list — the single switchboard of the plugin.
 *
 * Every major feature can be turned off individually through a `FeatureGate`
 * (see `gates.ts`) — for example when Zotero later ships the feature itself,
 * an internal API changes, or a feature should be disabled temporarily.
 *
 * - `activeGlobalFeatures()` and `activeDialogInjectors()` return the lists that `src/hooks.ts`
 *   starts or injects into the citation dialog. Disabled entries are filtered
 *   out and neither started nor injected.
 * - The switches live in `gates.ts` (pure, node-tested).
 *
 * To disable a feature, set its entry to `enabled: false` in
 * `src/features/gates.ts`. Afterwards run `npm run typecheck`,
 * `npm run test:unit`, `npm run test:zotero` and restart Zotero.
 */

import type { Feature } from "../shared/feature";
import type { DialogInjector } from "../shared/citationDialog";
import { OrganizerFactory } from "./organizer/panel/organizer";
import { unregisterAllPluginMenus } from "../utils/menu";
import * as citationDialog from "../shared/citationDialog";
import { AnnotationIndex } from "./organizer/annotationIndex";
import {
  installExternalApi,
  uninstallExternalApi,
} from "./organizer/externalApi";
import {
  patchAnnotationRow,
  unpatchAnnotationRow,
} from "./print/annotationRowPatch";
import * as modeSelector from "./citeOnly/modeSelector";
import { outlineView } from "./organizer/citationDialog/dialogOutline";
import { persistentDialogPatch } from "./organizer/citationDialog/dialogPersistent";
import { citeOnlyPatch } from "./citeOnly/integrationPatch";
import { readerMenu } from "./reader/readerMenu";
import { citaviImport } from "./citavi/citaviImport";
import { tagSuggest } from "./organizer/tagSuggest";
import { printMenus } from "./print/menus";
import { placeholderCleanup } from "./print/placeholder";
import { annotationRowMenu } from "./print/annotationRowMenu";
import { organizerToolbarButton } from "./organizer/toolbarButton";
import { toolsMenuFallback } from "./organizer/toolsMenuFallback";
import { collectionMenu } from "./organizer/collectionMenu";
import { isFeatureEnabled } from "./gates";

// --- Inline features (extracted from src/hooks.ts) ------------------

const organizerFeature: Feature = {
  name: "organizer",
  start: () => OrganizerFactory.registerMenu(),
  stop: () => {
    unregisterAllPluginMenus();
    OrganizerFactory.close();
  },
};

const citationDialogFeature: Feature = {
  name: "citationDialog",
  start: () => citationDialog.start(),
  stop: () => citationDialog.stop(),
};

const annotationIndexFeature: Feature = {
  name: "annotationIndex",
  start: () => AnnotationIndex.init(),
  stop: () => AnnotationIndex.unload(),
};

const externalApiFeature: Feature = {
  name: "externalApi",
  start: () => installExternalApi(),
  stop: () => uninstallExternalApi(),
};

const annotationRowPatchFeature: Feature = {
  name: "annotationRowPatch",
  addToWindow: (win) => {
    patchAnnotationRow(win);
  },
  removeFromWindow: (win) => {
    unpatchAnnotationRow(win);
  },
};

// --- Global lifecycle features ---------------------------------------

/** Order = startup order; stopped in reverse order. */
export const globalFeatureEntries: Feature[] = [
  organizerFeature,
  organizerToolbarButton,
  toolsMenuFallback,
  collectionMenu,
  citationDialogFeature,
  persistentDialogPatch,
  citeOnlyPatch,
  readerMenu,
  citaviImport,
  annotationIndexFeature,
  externalApiFeature,
  tagSuggest.feature,
  printMenus,
  placeholderCleanup,
  annotationRowMenu,
  annotationRowPatchFeature,
];

/**
 * Active global features; disabled entries are filtered out. Evaluated on
 * call (not at import) so the gate pref overrides are read at startup.
 */
export function activeGlobalFeatures(): Feature[] {
  return globalFeatureEntries.filter((f) => isFeatureEnabled(f.name));
}

// --- Citation dialog injectors ---------------------------------------------

/** Order = injection order; detached in the same order. */
export const dialogInjectorEntries: DialogInjector[] = [
  {
    name: "modeSelector",
    inject: modeSelector.injectModeSelector,
    detach: modeSelector.removeModeSelector,
  },
  outlineView,
  {
    name: "annotationRowPatch",
    inject: patchAnnotationRow,
    detach: unpatchAnnotationRow,
  },
];

/** Active citation dialog injectors; disabled entries are filtered out. */
export function activeDialogInjectors(): DialogInjector[] {
  return dialogInjectorEntries.filter((i) => isFeatureEnabled(i.name));
}
