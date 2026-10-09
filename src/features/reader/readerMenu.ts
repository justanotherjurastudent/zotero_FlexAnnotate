/**
 * Reader-Integration (Dokumentenansicht), Teil 1: Kontextmenü an Annotationen, Sidebar-
 * Header und Aktualisierung der Locator-Anzeige. Herkunft: pre-merge:src/readerMenu.js
 * (Zeilen 1-315 und 714-907). Das Seitenzahl-Popup steht in labelPopup.ts.
 *
 * Zotero-Quelle (10.0.5, chrome/content/zotero/xpcom/reader.js): registerEventListener
 * Zeile 2771, unregisterEventListener 2780, Reader.open 2917, _readers 2680.
 */
import { config } from "../../../package.json";
import { assignChecked } from "../../shared/patch";
import { defaultLogger, type Feature } from "../../shared/feature";
import { getString } from "../../utils/locale";
import { DEFAULT_LOCATOR } from "../../core/locator";
import {
  explicitLocatorFromTags,
  locatorLabelText,
} from "../../core/readerLocator";
import type { DialogView } from "../../core/printDialog";
import * as printDialog from "../print/dialog";
import * as printAnnotations from "../print/printAnnotations";
import { enhanceLabelPopup, setLabelPopupHooks } from "./labelPopup";

type MainWin = _ZoteroTypes.MainWindow;
type ReaderInstance = _ZoteroTypes.ReaderInstance;

const EVENT = "createAnnotationContextMenu";
const HEADER_EVENT = "renderSidebarAnnotationHeader";
const NOTIFIER_ID = "flexannotate-reader";

/** Interne Felder des Reader-Objekts, die Zotero nicht typisiert. */
interface ReaderInternals {
  itemID?: number;
  _window?: Window;
  _iframeWindow?: Window & {
    wrappedJSObject?: { _reader?: { _annotationManager?: AnnotationManager } };
    _reader?: { _annotationManager?: AnnotationManager };
  };
  _isTabClosed?: boolean;
  _internalReader?: { _annotationManager?: AnnotationManager };
  _annotationManager?: AnnotationManager;
  _state?: {
    annotations?: ReaderAnnotation[];
    primaryViewAnnotationPopup?: { annotation?: { id?: string } };
    secondaryViewAnnotationPopup?: { annotation?: { id?: string } };
  };
}

interface AnnotationManager {
  _getAnnotationByID(id: string): ReaderAnnotation | undefined;
  updateAnnotations(updates: unknown[]): void;
}

interface ReaderAnnotation {
  id: string;
  key?: string;
  comment?: string;
  tags?: unknown[];
}

interface MenuItem {
  label: string;
  persistent: boolean;
  onCommand: () => void;
}

interface ReaderEvent {
  reader: ReaderInstance;
  params: { ids?: string[]; annotation?: { id: string } };
  append: (...items: MenuItem[]) => void;
  doc?: Document;
}

interface HeaderEvent {
  reader: ReaderInstance;
  doc: Document;
  params: { annotation?: { id: string } };
}

/** Eingeschränkte Sicht auf Zoteros Reader-Registry. */
interface ReaderRegistry {
  _readers?: ReaderInstance[];
  open?: (...args: unknown[]) => Promise<ReaderInstance | undefined>;
  registerEventListener?: (
    type: string,
    handler: (event: never) => void,
    pluginID?: string,
  ) => void;
  unregisterEventListener?: (type: string, handler: never) => void;
}

const registry = (): ReaderRegistry =>
  Zotero.Reader as unknown as ReaderRegistry;
const internals = (reader: ReaderInstance): ReaderInternals =>
  reader as unknown as ReaderInternals;

let handler: ((event: ReaderEvent) => void) | null = null;
let headerHandler: ((event: HeaderEvent) => void) | null = null;
let notifierID: string | null = null;
const watchedReaders = new WeakSet<ReaderInstance>();
const observers = new Set<MutationObserver>();
let origOpen: ReaderRegistry["open"] | null = null;
let updatingLocators = false;

/** Ersatztext für die Seitenbezeichnung, wenn Zotero keine liefert. */
const labels = () => ({
  page: getString("reader-locator-page"),
  margin: getString("reader-locator-margin"),
  opus: getString("reader-locator-opus"),
});

/** Ist die Reader-Erweiterung eingerichtet? Ersetzt die Prüfung auf den Handler. */
export function isPatched(): boolean {
  return handler !== null;
}

/**
 * Registriert Kontextmenü, Sidebar-Header und Notifier und überwacht die Reader-Popups.
 * Mehrfacher Aufruf ist unschädlich.
 *
 * @return true, wenn eingerichtet
 */
export function patch(): boolean {
  if (handler) {
    return true;
  }
  const zr = registry();
  if (typeof zr.registerEventListener !== "function") {
    ztoolkit.log("FlexAnnotate: Zotero.Reader.registerEventListener not found");
    return false;
  }

  // 1. Kontextmenü-Handler für Annotationen im Reader
  handler = (event) => {
    try {
      onContextMenu(event);
    } catch (e) {
      defaultLogger("readerMenu", "contextMenu", e);
    }
  };
  zr.registerEventListener(EVENT, handler as never, config.addonID);

  // 2. Sidebar-Header-Handler: Passt „Seite“ an den gewählten Locator an (z. B. Randnummer)
  headerHandler = (event) => {
    try {
      onSidebarAnnotationHeader(event);
    } catch (e) {
      defaultLogger("readerMenu", "sidebarHeader", e);
    }
  };
  zr.registerEventListener(
    HEADER_EVENT,
    headerHandler as never,
    config.addonID,
  );

  // 3. Item-Änderungen überwachen, um geöffnete Reader sofort zu aktualisieren
  notifierID = Zotero.Notifier.registerObserver(
    {
      notify: (event: string, type: string) => {
        try {
          if (type === "item" && ["modify", "add", "trash"].includes(event)) {
            updateAllReaders();
            setTimeout(() => updateAllReaders(), 100);
          }
        } catch (e) {
          defaultLogger("readerMenu", "notify", e);
        }
      },
    },
    ["item"],
    NOTIFIER_ID,
  );

  // Nach dem Speichern im Dialog offene Reader aktualisieren (siehe print/dialog.ts)
  printDialog.setAfterSave(() => updateAllReaders());
  // Callbacks für das Seitenzahl-Popup (labelPopup.ts importiert dieses Modul nicht)
  setLabelPopupHooks({
    updateLocators: updateAllLocators,
    updateReaders: updateAllReaders,
    getAnnotationManager,
  });

  // 4. Bestehende und künftige Reader überwachen für den Seitenzahl-Popup
  watchAllReaders();

  ztoolkit.log(
    "Registered reader context menu, sidebar header listener and label popup watcher",
  );
  return true;
}

/** Entfernt die Reader-Erweiterungen und setzt geöffnete Reader sauber zurück. */
export function unpatch(): void {
  const zr = registry();
  if (handler) {
    zr.unregisterEventListener?.(EVENT, handler as never);
    handler = null;
  }
  if (headerHandler) {
    zr.unregisterEventListener?.(HEADER_EVENT, headerHandler as never);
    headerHandler = null;
  }
  if (notifierID) {
    Zotero.Notifier?.unregisterObserver?.(notifierID);
    notifierID = null;
  }
  printDialog.setAfterSave(null);
  setLabelPopupHooks(null);
  if (origOpen && Zotero.Reader) {
    assignChecked(Zotero.Reader, "open", origOpen);
    origOpen = null;
  }
  for (const obs of observers) {
    try {
      obs.disconnect();
    } catch (e) {
      defaultLogger("readerMenu", "disconnect", e);
    }
  }
  observers.clear();

  // Offene Reader zurücksetzen: UI-Elemente entfernen und Label auf Zotero-Standard zurücksetzen
  const defaultLabel = pageLabel();
  for (const reader of registry()._readers ?? []) {
    const doc = internals(reader)._iframeWindow?.document;
    if (doc) {
      try {
        doc
          .querySelectorAll(".flexannotate-locator-section")
          .forEach((el: Element) => el.remove());
        const pageElements = doc.querySelectorAll('.page[id^="page_"]');
        for (const pageEl of pageElements) {
          if (pageEl.firstElementChild) {
            pageEl.firstElementChild.textContent = defaultLabel;
          }
        }
      } catch (e) {
        defaultLogger("readerMenu", "unpatch", e);
      }
    }
  }
}

/** Feature-Registry: start richtet ein, stop räumt wieder auf. */
export const readerMenu: Feature = {
  name: "readerMenu",
  start: () => {
    patch();
  },
  stop: () => unpatch(),
};

//
// 1. Annotations-Kontextmenü
//

function onContextMenu(event: ReaderEvent): void {
  const { reader, params, append } = event;
  const itemID = internals(reader).itemID;
  const annotationIds = params?.ids || [];
  if (!itemID || !annotationIds.length) {
    return;
  }

  let hasComment = false;
  if (annotationIds.length === 1) {
    const a = internals(reader)._state?.annotations?.find(
      (x) => x.id === annotationIds[0],
    );
    hasComment = !!(a && a.comment && a.comment.trim());
  }

  const items: MenuItem[] = [];
  if (annotationIds.length === 1) {
    items.push({
      label: getString(
        hasComment ? "reader-comment-edit" : "reader-comment-add",
      ),
      persistent: true,
      onCommand: () => openDialog(reader, annotationIds, "comment"),
    });
  }
  items.push({
    label: getString("reader-locator-set"),
    persistent: true,
    onCommand: () => openDialog(reader, annotationIds, "locator"),
  });

  append(...items);
}

/**
 * Öffnet die Maske zur Bearbeitung von Kommentar oder Locator.
 *
 * @param view - 'comment' | 'locator'
 */
async function openDialog(
  reader: ReaderInstance,
  annotationKeys: string[],
  view: DialogView,
): Promise<void> {
  try {
    const itemID = internals(reader).itemID;
    const attachment = itemID ? Zotero.Items.get(itemID) : undefined;
    if (!attachment) {
      return;
    }
    let annotations = attachment
      .getAnnotations()
      .filter((a) => annotationKeys.includes(a.key));
    if (!annotations.length) {
      annotations = annotationKeys
        .map((key) =>
          Zotero.Items.getByLibraryAndKey(attachment.libraryID, key),
        )
        .filter((a): a is Zotero.Item => !!a);
    }
    if (!annotations.length) {
      return;
    }
    const win = (internals(reader)._window ||
      Zotero.getMainWindow()) as MainWin;
    await printDialog.openForEdit(win, annotations, { view });
  } catch (e) {
    defaultLogger("readerMenu", "openDialog", e);
  }
}

//
// 2. Reader-Überwachung (Popup-Hook und Locator-Aktualisierung)
//

/** Überwacht alle Reader-Instanzen (aktuelle und künftige). */
function watchAllReaders(): void {
  for (const reader of registry()._readers ?? []) {
    watchReader(reader);
  }

  const zr = registry();
  if (!origOpen && typeof zr.open === "function") {
    const original = zr.open;
    origOpen = original;
    const wrapper = async function (this: unknown, ...args: unknown[]) {
      const reader = await original.apply(this, args);
      if (reader) {
        watchReader(reader);
      }
      return reader;
    };
    // Ohne Rücklesen wäre ein wirkungsloser Patch nicht vom Erfolg zu unterscheiden
    if (!assignChecked(Zotero.Reader, "open", wrapper)) {
      origOpen = null;
      ztoolkit.log("FlexAnnotate: Zotero.Reader.open could not be patched");
    }
  }
}

function watchReader(reader: ReaderInstance | undefined): void {
  if (!reader || watchedReaders.has(reader)) {
    return;
  }
  watchedReaders.add(reader);

  const pollForIframe = (attempts = 0): void => {
    if (internals(reader)._isTabClosed || attempts > 60) {
      return;
    }
    const win = internals(reader)._iframeWindow;
    if (win && win.document && win.document.body) {
      attachObserver(reader, win);
    } else {
      setTimeout(() => pollForIframe(attempts + 1), 250);
    }
  };
  pollForIframe();
}

/** Hängt einen MutationObserver an das Dokument des Reader-iFrames. */
function attachObserver(reader: ReaderInstance, iframeWin: Window): void {
  const doc = iframeWin.document;
  const observer = new iframeWin.MutationObserver(
    (mutations: MutationRecord[]) => {
      if (updatingLocators) {
        return;
      }
      try {
        let hasPageOrCard = false;
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node?.nodeType === 1) {
              const el = node as Element;
              const popup = el.classList?.contains("label-popup")
                ? el
                : el.querySelector?.(".label-popup");
              if (popup) {
                enhanceLabelPopup(reader, popup);
              }
              if (
                el.classList?.contains("page") ||
                el.querySelector?.(".page") ||
                el.classList?.contains("preview") ||
                el.querySelector?.(".preview") ||
                el.classList?.contains("annotation") ||
                el.querySelector?.(".annotation")
              ) {
                hasPageOrCard = true;
              }
            }
          }
        }
        if (hasPageOrCard) {
          updateAllLocators(reader, doc);
        }
      } catch (e) {
        defaultLogger("readerMenu", "mutation", e);
      }
    },
  );

  observers.add(observer);
  if (doc.body) observer.observe(doc.body, { childList: true, subtree: true });

  // Initiale Lokalisierung bereits dargestellter Annotationen
  updateAllLocators(reader, doc);
}

//
// 3. Locator-Anzeige in Sidebar und Seite
//

function getAnnotationManager(
  reader: ReaderInstance,
): AnnotationManager | null {
  try {
    const r = internals(reader);
    return (
      r._internalReader?._annotationManager ||
      r._iframeWindow?.wrappedJSObject?._reader?._annotationManager ||
      r._iframeWindow?._reader?._annotationManager ||
      r._annotationManager ||
      null
    );
  } catch {
    return null;
  }
}

/** Ermittelt das Zotero.Item einer Annotation. */
function getAnnotationItem(
  reader: ReaderInstance,
  key: string | undefined,
): Zotero.Item | null {
  const itemID = internals(reader).itemID;
  if (!itemID || !key) {
    return null;
  }
  const attachment = Zotero.Items.get(itemID);
  if (!attachment) {
    return null;
  }
  const item =
    attachment.getAnnotations().find((a) => a.key === key) ||
    Zotero.Items.getByLibraryAndKey(attachment.libraryID, key);
  return item || null;
}

/**
 * Ermittelt den CSL-Locator einer Annotation (z. B. 'opus', 'paragraph', 'page').
 * Zuerst der Reader-Speicher, da er bei Änderungen sofort aktuell ist, bevor Zotero
 * asynchron in die Datenbank schreibt.
 */
function getAnnotationLocator(
  reader: ReaderInstance,
  keyOrAnnotation: string | ReaderAnnotation,
): string {
  const key =
    typeof keyOrAnnotation === "string"
      ? keyOrAnnotation
      : keyOrAnnotation?.id || keyOrAnnotation?.key;
  const r = internals(reader);
  const am = getAnnotationManager(reader);
  const readerAnn =
    (am && key ? am._getAnnotationByID(key) : null) ||
    (typeof keyOrAnnotation === "object" ? keyOrAnnotation : null) ||
    (r._state?.annotations && key
      ? r._state.annotations.find((a) => a.id === key)
      : null);

  const explicit = explicitLocatorFromTags(
    readerAnn?.tags || [],
    Zotero.Cite?.labels ?? [],
  );
  if (explicit) {
    return explicit;
  }

  const item = getAnnotationItem(reader, key);
  if (item) {
    return printAnnotations.getLocator(item);
  }

  const attachment = r.itemID ? Zotero.Items.get(r.itemID) || null : null;
  return printAnnotations.getDefaultLocator(attachment);
}

/** Benutzerfreundliche Beschriftung eines Locators (z. B. „Randnummer“, „Seite“). */
function getLocatorLabel(locator: string | undefined): string {
  return locatorLabelText(
    locator,
    (l) => Zotero.Cite?.getLocatorString?.(l) || undefined,
    labels(),
  );
}

/** Beschriftung „Seite“ für offene Reader beim Zurücksetzen. */
function pageLabel(): string {
  return getLocatorLabel(DEFAULT_LOCATOR);
}

/** Aktualisiert den Locator-Text im Header einer einzelnen Annotation. */
function onSidebarAnnotationHeader(event: HeaderEvent): void {
  const { reader, doc, params } = event;
  const annId = params?.annotation?.id;
  if (!reader || !doc || !annId) {
    return;
  }
  const labelText = getLocatorLabel(getAnnotationLocator(reader, annId));
  const pageEl = doc.getElementById("page_" + annId);
  if (pageEl && pageEl.firstElementChild) {
    if (pageEl.firstElementChild.textContent !== labelText) {
      pageEl.firstElementChild.textContent = labelText;
    }
  }
}

/** Aktualisiert alle sichtbaren Annotation-Header (Sidebar und In-Page-Popup). */
function updateAllLocators(reader: ReaderInstance, doc: Document): void {
  if (!reader || !doc) {
    return;
  }
  const setLabel = (el: Element, annId: string) => {
    const labelText = getLocatorLabel(getAnnotationLocator(reader, annId));
    if (el.textContent !== labelText) {
      el.textContent = labelText;
    }
  };

  updatingLocators = true;
  try {
    const pageElements = doc.querySelectorAll('.page[id^="page_"]');
    for (const pageEl of pageElements) {
      const annId = pageEl.id.slice(5);
      const labelText = getLocatorLabel(getAnnotationLocator(reader, annId));
      if (
        pageEl.firstElementChild &&
        pageEl.firstElementChild.textContent !== labelText
      ) {
        pageEl.firstElementChild.textContent = labelText;
      }
    }

    // Auch über .annotation-Karten suchen (falls pageEl ohne id="page_" existiert)
    const annCards = doc.querySelectorAll(
      ".annotation[data-id], .annotation[id]",
    );
    for (const card of annCards) {
      const annId = card.getAttribute("data-id") || card.id;
      const pageEl = card.querySelector(".page");
      if (pageEl && pageEl.firstElementChild) {
        setLabel(pageEl.firstElementChild, annId);
      }
    }

    // In-Page-Popup (.annotation-popup) ebenfalls aktualisieren
    const popup = doc.querySelector(".annotation-popup");
    if (popup) {
      const editorNode = popup.querySelector(".editor[id], [data-id]");
      const r = internals(reader);
      const annId =
        editorNode?.id ||
        editorNode?.getAttribute("data-id") ||
        r._state?.primaryViewAnnotationPopup?.annotation?.id ||
        r._state?.secondaryViewAnnotationPopup?.annotation?.id;
      const pageEl = popup.querySelector(".page");
      if (annId && pageEl && pageEl.firstElementChild) {
        setLabel(pageEl.firstElementChild, annId);
      }
    }
  } finally {
    updatingLocators = false;
  }
}

/** Aktualisiert alle geöffneten Reader. */
function updateAllReaders(): void {
  for (const reader of registry()._readers ?? []) {
    const doc = internals(reader)._iframeWindow?.document;
    if (doc) {
      updateAllLocators(reader, doc);
    }
  }
}
