import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { AnnotationIndex } from "./features/organizer/annotationIndex";
import { OrganizerFactory } from "./features/organizer/organizer";
import * as citationDialog from "./shared/citationDialog";
import { outlineView } from "./features/organizer/dialogOutline";
import * as modeSelector from "./features/citeOnly/modeSelector";
import {
  citeOnlyPatch,
  isPatched as citeOnlyIsPatched,
} from "./features/citeOnly/integrationPatch";
import * as openTarget from "./features/organizer/openTarget";
import * as citedCore from "./core/cited";
import * as organizerData from "./features/organizer/organizerData";
import * as outlineCore from "./core/outline";
import * as outlineModelModule from "./features/organizer/outlineModel";
import * as printPlaceholder from "./features/print/placeholder";
import * as printAnnotations from "./features/print/printAnnotations";
import * as printDialog from "./features/print/dialog";
import {
  printMenus,
  updateVisibility as updatePrintMenus,
} from "./features/print/menus";
import { annotationRowMenu } from "./features/print/annotationRowMenu";
import * as readerMenuModule from "./features/reader/readerMenu";
import { CitaviImport, citaviImport } from "./features/citavi/citaviImport";
import { linkContributions } from "./features/citavi/citaviLinks";
import { importPrintQuotes } from "./features/citavi/citaviPrintQuotes";

import { organizerToolbarButton } from "./features/organizer/toolbarButton";
import { unregisterAllPluginMenus } from "./utils/menu";
import {
  addToWindow,
  type Feature,
  removeFromWindow,
  startAll,
  stopAll,
} from "./shared/feature";

// Injektionsreihenfolge im Zitierdialog: erst die Modus-Auswahl, dann die Gliederung.
citationDialog.registerDialogInjector({
  name: "modeSelector",
  inject: modeSelector.injectModeSelector,
  detach: modeSelector.removeModeSelector,
});
citationDialog.registerDialogInjector(outlineView);

/**
 * Reihenfolge = Startreihenfolge; gestoppt wird in umgekehrter Reihenfolge.
 * Die Hooks sind voneinander unabhängig.
 */
const features: Feature[] = [
  {
    name: "organizer",
    start: () => OrganizerFactory.registerMenu(),
    stop: () => unregisterAllPluginMenus(),
  },
  organizerToolbarButton,
  {
    name: "citationDialog",
    start: () => citationDialog.start(),
    stop: () => citationDialog.stop(),
  },
  citeOnlyPatch,
  readerMenuModule.readerMenu,
  citaviImport,
  {
    // Cross-paper annotation layer: Notifier observer keeps the index fresh as
    // annotations are added/edited/removed anywhere in the library.
    name: "annotationIndex",
    start: () => AnnotationIndex.init(),
    stop: () => AnnotationIndex.unload(),
  },
  printMenus,
  annotationRowMenu,
];

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // Exposed for the integration tests (and later the Word dialog patch).
  addon.api = {
    organizerData,
    outline: outlineCore,
    outlineModel: outlineModelModule,
    OrganizerFactory,
    organizerToolbar: organizerToolbarButton,
    openTarget,
    cited: citedCore,
    CitationDialogPatch: { viewOf: outlineView.viewOf },
    modeSelector,
    citeOnly: { patch: citeOnlyPatch, isPatched: citeOnlyIsPatched },
    reader: { readerMenu: readerMenuModule },
    citavi: {
      importer: CitaviImport,
      feature: citaviImport,
      importPrintQuotes,
      linkContributions,
    },
    print: {
      placeholder: printPlaceholder,
      printAnnotations,
      dialog: printDialog,
      menus: { printMenus, updateVisibility: updatePrintMenus },
    },
  };

  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: `chrome://${addon.data.config.addonRef}/content/preferences.xhtml`,
    scripts: [
      `chrome://${addon.data.config.addonRef}/content/scripts/preferences.js`,
    ],
    label: addon.data.config.addonName,
    image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
  });

  await startAll(features);

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );
  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-addon.ftl`,
  );

  await addToWindow(features, win);
}

async function onMainWindowUnload(win: _ZoteroTypes.MainWindow): Promise<void> {
  removeFromWindow(features, win);
  ztoolkit.unregisterAll();
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  stopAll(features);
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  ztoolkit.log("notify", event, type, ids, extraData);
}

async function onPrefsEvent(_type: string, _data: { [key: string]: any }) {
  // preferences are bound declaratively in preferences.xhtml
}

function onShortcuts(_type: string) {
  // no shortcuts registered
}

function onDialogEvents(_type: string) {
  // no dialog events registered
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
