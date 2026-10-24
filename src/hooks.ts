import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { OrganizerFactory } from "./features/organizer/panel/organizer";
import { registerDialogInjector } from "./shared/citationDialog";
import { outlineView } from "./features/organizer/dialog/dialogOutline";
import * as modeSelector from "./features/citeOnly/modeSelector";
import {
  citeOnlyPatch,
  isPatched as citeOnlyIsPatched,
} from "./features/citeOnly/integrationPatch";
import { docImport } from "./features/organizer/doc/docImport";
import { docExport } from "./features/organizer/doc/docExport";
import {
  persistentDialogPatch,
  readPersistentPref,
  writePersistentPref,
  getPersistentWindow,
  rememberCommandForTest,
  lastCommandForTest,
  setPendingInsertForTest,
  patchExecCommand,
  unpatchExecCommand,
  openBrowseForTest,
  makeBrowseIoForTest,
  persistentSupported,
  activatePersistentOnOpenDialog,
  patchInterfaceMethods,
  unpatchInterfaceMethods,
} from "./features/organizer/dialog/dialogPersistent";
import { normalizePersistentOptions } from "./features/organizer/logic/persistentOptions";
import * as openTarget from "./features/organizer/openTarget";
import * as docOutlineCore from "./features/organizer/logic/docOutline";
import * as citedCore from "./features/organizer/logic/cited";
import * as dialogCitedModule from "./features/organizer/dialog/dialogCited";
import * as organizerData from "./features/organizer/panel/organizerData";
import * as outlineCore from "./features/organizer/logic/outline";
import * as flatHeadingsCore from "./features/organizer/logic/flatHeadings";
import * as outlineModelModule from "./features/organizer/outlineModel";
import * as organizerStrings from "./features/organizer/strings";
import * as printPlaceholder from "./features/print/placeholder";
import * as printAnnotations from "./features/print/printAnnotations";
import * as printDialog from "./features/print/dialog";
import {
  printMenus,
  updateVisibility as updatePrintMenus,
} from "./features/print/menus";
import {
  patchAnnotationRow,
  unpatchAnnotationRow,
} from "./features/print/annotationRowPatch";
import * as readerMenuModule from "./features/reader/readerMenu";
import { CitaviImport, citaviImport } from "./features/citavi/citaviImport";
import { linkContributions } from "./features/citavi/citaviLinks";
import { importPrintQuotes } from "./features/citavi/citaviPrintQuotes";

import { organizerToolbarButton } from "./features/organizer/toolbarButton";
import { tagSuggest } from "./features/organizer/tagSuggest";
import { toolsMenuFallback } from "./features/organizer/toolsMenuFallback";
import {
  installExternalApi,
  uninstallExternalApi,
} from "./features/organizer/externalApi";
import {
  addToWindow,
  removeFromWindow,
  startAll,
  stopAll,
} from "./shared/feature";
import {
  dialogInjectors,
  globalFeatures,
} from "./features/registry";

// Zitierdialog-Injektoren: zentrale Liste aus der Registry übernehmen. Die
// Reihenfolge (Modus-Auswahl, Gliederung, Zeilen-Patch) steht in registry.ts.
for (const injector of dialogInjectors) {
  registerDialogInjector(injector);
}

// Globale Lebenszyklus-Features: zentrale Liste aus der Registry übernehmen.
// Reihenfolge = Startreihenfolge; gestoppt wird in umgekehrter Reihenfolge.
const features = globalFeatures;

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
    flatHeadings: flatHeadingsCore,
    outlineModel: outlineModelModule,
    organizerStrings,
    externalApi: {
      install: installExternalApi,
      uninstall: uninstallExternalApi,
    },
    OrganizerFactory,
    docImport,
    docExport,
    docOutline: docOutlineCore,
    organizerToolbar: organizerToolbarButton,
    toolsMenu: toolsMenuFallback,
    openTarget,
    tagSuggest,
    cited: citedCore,
    dialogCited: dialogCitedModule,
    CitationDialogPatch: { viewOf: outlineView.viewOf },
    persistentDialog: {
      feature: persistentDialogPatch,
      readPref: readPersistentPref,
      writePref: writePersistentPref,
      getWindow: getPersistentWindow,
      normalizeOptions: normalizePersistentOptions,
      rememberCommand: rememberCommandForTest,
      lastCommand: lastCommandForTest,
      setPendingInsert: setPendingInsertForTest,
      patchExec: patchExecCommand,
      unpatchExec: unpatchExecCommand,
      openBrowse: openBrowseForTest,
      makeBrowseIo: makeBrowseIoForTest,
      activateOnOpenDialog: activatePersistentOnOpenDialog,
      supported: persistentSupported,
      patchInterface: patchInterfaceMethods,
      unpatchInterface: unpatchInterfaceMethods,
    },
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
      annotationRowPatch: {
        patch: patchAnnotationRow,
        unpatch: unpatchAnnotationRow,
      },
    },
  };

  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: `chrome://${addon.data.config.addonRef}/content/preferences.xhtml`,
    scripts: [
      `chrome://${addon.data.config.addonRef}/content/scripts/preferences.js`,
    ],
    label: addon.data.config.addonName,
    image: `chrome://${addon.data.config.addonRef}/content/icons/icon.svg`,
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
