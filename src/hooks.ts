import { getString, initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { AnnotationIndex } from "./modules/annotationIndex";
import { OrganizerFactory } from "./modules/organizer";
import { CitationDialogPatch } from "./modules/citationDialogPatch";
import * as modeSelector from "./features/citeOnly/modeSelector";
import {
  citeOnlyPatch,
  isPatched as citeOnlyIsPatched,
} from "./features/citeOnly/integrationPatch";
import * as openTarget from "./modules/openTarget";
import * as citedCore from "./core/cited";
import * as organizerData from "./modules/organizerData";
import * as outlineCore from "./core/outline";
import * as outlineModelModule from "./modules/outlineModel";
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

import { unregisterAllPluginMenus } from "./utils/menu";
import {
  addToWindow,
  type Feature,
  removeFromWindow,
  startAll,
  stopAll,
} from "./shared/feature";

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
  {
    name: "citationDialog",
    start: () => CitationDialogPatch.start(),
    stop: () => CitationDialogPatch.stop(),
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
    openTarget,
    cited: citedCore,
    CitationDialogPatch,
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

  new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: 3000,
  })
    .createLine({
      text: getString("startup-finish"),
      type: "success",
      progress: 100,
    })
    .show();
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
