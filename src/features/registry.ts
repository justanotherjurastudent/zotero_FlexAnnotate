/**
 * Zentrale Feature-Liste — der einzige Schaltknoten des Plugins.
 *
 * Jedes größere Feature ist hier als Eintrag gelistet, damit man es einzeln
 * abschalten kann — z. B. wenn Zotero eine Funktion später selbst mitbringt,
 * eine interne API sich ändert oder ein Feature vorübergehend deaktiviert
 * werden soll.
 *
 * - `globalFeatures` und `dialogInjectors` sind die Listen, die `src/hooks.ts`
 *   startet bzw. im Zitierdialog injiziert. Deaktivierte Einträge werden
 *   herausgefiltert und weder gestartet noch injiziert.
 * - `isFeatureEnabled(name)` erlaubt zusätzliches Laufzeit-Gating im Render-
 *   und Layout-Pfad (z. B. Fußnoten-Badges, Zitier-Haken, schmales Fenster).
 *   Der Name muss zu einem Gate-Eintrag passen.
 *
 * So deaktiviert man ein Feature: unten im `gates`-Array den Eintrag auf
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

// --- Gates: zentraler Schalter je Feature --------------------------------

export interface FeatureGate {
  name: string;
  description: string;
  enabled: boolean;
}

/**
 * Ein Feature auf `enabled: false` setzen blendet es aus der Registrierung.
 * `description` nennt, was das Feature tut und wann man es abschalten würde.
 */
const gates: FeatureGate[] = [
  {
    name: "organizer",
    description:
      "Organizer: Hauptfenster, Menü-Eintrag, Gliederung und Notiz-Export.",
    enabled: true,
  },
  {
    name: "organizerToolbarButton",
    description: "Organizer-Knopf in der Zotero-Toolbar.",
    enabled: true,
  },
  {
    name: "toolsMenuFallback",
    description: "Organizer-Eintrag im Tools-Menü (Fallback für Zotero 7).",
    enabled: true,
  },
  {
    name: "collectionMenu",
    description: "Rechtsklick auf Sammlung: 'Organizer für diese Sammlung'.",
    enabled: true,
  },
  {
    name: "citationDialog",
    description:
      "Window-Watcher für den Zitierdialog; Basis für Modus-Auswahl, Gliederungsansicht und Zeilen-Patch im Dialog.",
    enabled: true,
  },
  {
    name: "persistentDialogPatch",
    description:
      "Zitierfenster offen halten (Blätterfenster) inkl. Ort/Größe merken.",
    enabled: true,
  },
  {
    name: "citeOnlyPatch",
    description:
      "Nur-Nachweis-Zitieren: Integration-Patch für den Zitierdialog.",
    enabled: true,
  },
  {
    name: "readerMenu",
    description: "Reader-Kontextmenü des Zotero-Readers.",
    enabled: true,
  },
  {
    name: "citaviImport",
    description: "Citavi-Import (Dateien, Verknüpfungen, Druck-Zitate).",
    enabled: true,
  },
  {
    name: "annotationIndex",
    description:
      "Bibliotheksweiter Annotation-Index (Notifier-Observer) als Grundlage des Organizers.",
    enabled: true,
  },
  {
    name: "externalApi",
    description:
      "Plugin-zu-Plugin-Schnittstelle Zotero.FlexAnnotate für KI-Anbindungen.",
    enabled: true,
  },
  {
    name: "tagSuggest",
    description:
      "§-Tag-Vorschläge in Gliederungsreihenfolge in der Tag-Zeile (PDF/Item).",
    enabled: true,
  },
  {
    name: "printMenus",
    description: "Menüs für Print-Annotationen (Druckrang, Locator).",
    enabled: true,
  },
  {
    name: "annotationRowMenu",
    description: "Kontextmenü auf Annotation-Zeilen im Item-Baum.",
    enabled: true,
  },
  {
    name: "annotationRowPatch",
    description:
      "Annotation-Zeilen-Patch: stabilisiert das Listen-Rendering (Formatierung). Gilt als Feature und als Zitierdialog-Injektor.",
    enabled: true,
  },
  {
    name: "modeSelector",
    description:
      "Modus-Auswahl (Annotationen/Werke) im Zitierdialog.",
    enabled: true,
  },
  {
    name: "outlineView",
    description:
      "Gliederungsansicht im Zitierdialog (Annotationen- und Werke-Tab).",
    enabled: true,
  },
];

const gateByName = new Map(gates.map((g) => [g.name, g.enabled]));

/** Laufzeit-Gate für Render-Pfade; unbekannte Namen gelten als aktiv. */
export function isFeatureEnabled(name: string): boolean {
  return gateByName.get(name) ?? true;
}

// --- Globale Lebenszyklus-Features ---------------------------------------

/** Reihenfolge = Startreihenfolge; gestoppt wird in umgekehrter Reihenfolge. */
const globalFeatureEntries: (Feature & { gate?: string })[] = [
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
export const globalFeatures: Feature[] = globalFeatureEntries.filter(
  (f) => isFeatureEnabled(f.gate ?? f.name),
);

// --- Zitierdialog-Injektoren ---------------------------------------------

/** Reihenfolge = Injektionsreihenfolge; detach läuft in derselben Reihenfolge. */
const dialogInjectorEntries: (DialogInjector & { gate?: string })[] = [
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
  (i) => isFeatureEnabled(i.gate ?? i.name),
);
