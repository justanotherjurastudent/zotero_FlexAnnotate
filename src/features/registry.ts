/**
 * Zentrale Feature-Liste — der einzige Schaltknoten des Plugins.
 *
 * Jedes größere Feature ist über ein `FeatureGate` (siehe `gates.ts`) einzeln
 * abschaltbar — z. B. wenn Zotero eine Funktion später selbst mitbringt, eine
 * interne API sich ändert oder ein Feature vorübergehend deaktiviert werden
 * soll.
 *
 * - `globalFeatures` und `dialogInjectors` sind die Listen, die `src/hooks.ts`
 *   startet bzw. im Zitierdialog injiziert. Deaktivierte Einträge werden
 *   herausgefiltert und weder gestartet noch injiziert.
 * - Die Schalter liegen in `gates.ts` (pure, node-getestet).
 *
 * So deaktiviert man ein Feature: in `src/features/gates.ts` den Eintrag auf
 * `enabled: false` setzen. Danach `npm run typecheck`, `npm run test:unit`,
 * `npm run test:zotero` und ein Neustart in Zotero.
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
import { outlineView } from "./organizer/dialog/dialogOutline";
import { persistentDialogPatch } from "./organizer/dialog/dialogPersistent";
import { citeOnlyPatch } from "./citeOnly/integrationPatch";
import { readerMenu } from "./reader/readerMenu";
import { citaviImport } from "./citavi/citaviImport";
import { tagSuggest } from "./organizer/tagSuggest";
import { printMenus } from "./print/menus";
import { annotationRowMenu } from "./print/annotationRowMenu";
import { organizerToolbarButton } from "./organizer/toolbarButton";
import { toolsMenuFallback } from "./organizer/toolsMenuFallback";
import { collectionMenu } from "./organizer/collectionMenu";
import { isFeatureEnabled } from "./gates";

// --- Inline-Features (aus src/hooks.ts hierher gezogen) ------------------

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

// --- Globale Lebenszyklus-Features ---------------------------------------

/** Reihenfolge = Startreihenfolge; gestoppt wird in umgekehrter Reihenfolge. */
const globalFeatureEntries: Feature[] = [
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
  annotationRowMenu,
  annotationRowPatchFeature,
];

/** Aktive globale Features; deaktivierte Einträge sind herausgefiltert. */
export const globalFeatures: Feature[] = globalFeatureEntries.filter((f) =>
  isFeatureEnabled(f.name),
);

// --- Zitierdialog-Injektoren ---------------------------------------------

/** Reihenfolge = Injektionsreihenfolge; detach läuft in derselben Reihenfolge. */
const dialogInjectorEntries: DialogInjector[] = [
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

/** Aktive Zitierdialog-Injektoren; deaktivierte Einträge sind herausgefiltert. */
export const dialogInjectors: DialogInjector[] = dialogInjectorEntries.filter(
  (i) => isFeatureEnabled(i.name),
);
