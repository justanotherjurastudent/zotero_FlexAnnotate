/**
 * Reader integration (document view), Part 1: Annotation context menu, sidebar
 * header, and locator display updates. Origin: pre-merge:src/readerMenu.js
 * (lines 1-315 and 714-907). The page label popup lives in labelPopup.ts.
 *
 * Zotero source (10.0.5, chrome/content/zotero/xpcom/reader.js): registerEventListener
 * line 2771, unregisterEventListener 2780, Reader.open 2917, _readers 2680.
 */
import { config } from "../../../package.json";
import { assignChecked } from "../../shared/patch";
import { defaultLogger, type Feature } from "../../shared/feature";
import { getString } from "../../utils/locale";
import { DEFAULT_LOCATOR } from "../../core/locator";
import {
  explicitLocatorFromTags,
  locatorLabelText,
} from "./logic/readerLocator";
import type { DialogView } from "../../core/printDialog";
import * as printDialog from "../print/dialog";
import * as printAnnotations from "../print/printAnnotations";
import { enhanceLabelPopup, setLabelPopupHooks } from "./labelPopup";
import { isFeatureEnabled } from "../gates";

type MainWin = _ZoteroTypes.MainWindow;
type ReaderInstance = _ZoteroTypes.ReaderInstance;

const EVENT = "createAnnotationContextMenu";
const HEADER_EVENT = "renderSidebarAnnotationHeader";
const NOTIFIER_ID = "flexannotate-reader";

/** Internal fields of Reader object untyped in Zotero. */
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

/** Restricted view of Zotero's reader registry. */
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
let patchedOpen: ReaderRegistry["open"] | null = null;
let updatingLocators = false;

/** Fallback label for page locator when Zotero does not provide one. */
const labels = () => ({
  page: getString("reader-locator-page", "label"),
  margin: getString("reader-locator-margin", "label"),
  opus: getString("reader-locator-opus", "label"),
});

/** Checks if reader extension is installed. Replaces checking the handler directly. */
export function isPatched(): boolean {
  return handler !== null;
}

/**
 * Registers context menu, sidebar header, notifier, and watches reader popups.
 * Idempotent on repeated calls.
 *
 * @returns true if patched
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

  // 1. Context menu handler for annotations in reader
  handler = (event) => {
    try {
      onContextMenu(event);
    } catch (e) {
      defaultLogger("readerMenu", "contextMenu", e);
    }
  };
  zr.registerEventListener(EVENT, handler as never, config.addonID);

  // 2. Sidebar header handler: adapts "Page" to chosen locator (e.g. margin note / paragraph)
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

  // 3. Watch item changes to immediately update open readers
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

  // Refresh open readers after saving in the dialog (see print/dialog.ts)
  printDialog.setAfterSave(() => updateAllReaders());
  // Callbacks for page label popup (labelPopup.ts does not import this module)
  setLabelPopupHooks({
    updateLocators: updateAllLocators,
    updateReaders: updateAllReaders,
    getAnnotationManager,
  });

  // 4. Watch existing and future readers for the page label popup
  watchAllReaders();

  ztoolkit.log(
    "Registered reader context menu, sidebar header listener and label popup watcher",
  );
  return true;
}

/** Disconnects all MutationObservers; an error does not stop remaining ones. */
function disconnectObservers(): void {
  for (const obs of observers) {
    try {
      obs.disconnect();
    } catch (e) {
      defaultLogger("readerMenu", "disconnect", e);
    }
  }
  observers.clear();
}

/** Resets open readers: removes UI elements and resets labels to Zotero default. */
function resetOpenReaders(): void {
  const defaultLabel = pageLabel();
  for (const reader of registry()._readers ?? []) {
    const doc = internals(reader)._iframeWindow?.document;
    if (!doc) continue;
    try {
      doc
        .querySelectorAll(".flexannotate-locator-section")
        .forEach((el: Element) => el.remove());
      for (const pageEl of doc.querySelectorAll('.page[id^="page_"]')) {
        if (pageEl.firstElementChild) {
          pageEl.firstElementChild.textContent = defaultLabel;
        }
      }
    } catch (e) {
      defaultLogger("readerMenu", "unpatch", e);
    }
  }
}

/** Removes reader extensions and resets open readers cleanly. */
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
    if (Zotero.Reader.open === patchedOpen) {
      assignChecked(Zotero.Reader, "open", origOpen);
    } else {
      ztoolkit.log("FlexAnnotate: Zotero.Reader.open patched by others, kept");
    }
    origOpen = null;
    patchedOpen = null;
  }
  disconnectObservers();
  resetOpenReaders();
}

/** Feature registry entry: start sets up, stop tears down. */
export const readerMenu: Feature = {
  name: "readerMenu",
  start: () => {
    patch();
  },
  stop: () => unpatch(),
};

//
// 1. Annotation context menu
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
 * Opens dialog panel to edit comment or locator.
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
// 2. Reader observation (popup hook and locator updating)
//

/** Watches all reader instances (current and future). */
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
    // Without checking the return value, an ineffective patch cannot be distinguished from success
    if (!assignChecked(Zotero.Reader, "open", wrapper)) {
      origOpen = null;
      ztoolkit.log("FlexAnnotate: Zotero.Reader.open could not be patched");
    } else {
      patchedOpen = wrapper;
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

const WATCHED_CLASSES = ["page", "preview", "annotation"];

/** Enhances new label popups; returns true if a page or card was added. */
function scanAddedNode(reader: ReaderInstance, node: Node | null): boolean {
  if (node?.nodeType !== 1) return false;
  const el = node as Element;
  const popup = el.classList?.contains("label-popup")
    ? el
    : el.querySelector?.(".label-popup");
  if (popup && isFeatureEnabled("readerLabelPopup")) {
    enhanceLabelPopup(reader, popup);
  }
  return WATCHED_CLASSES.some(
    (c) => el.classList?.contains(c) || el.querySelector?.(`.${c}`),
  );
}

/** Attaches a MutationObserver to the reader iframe document. */
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
            if (scanAddedNode(reader, node)) hasPageOrCard = true;
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

  // Initial localization of already rendered annotations
  updateAllLocators(reader, doc);
}

//
// 3. Locator display in sidebar and page
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

/** Retrieves the Zotero.Item for an annotation. */
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

/** Looks up annotation in reader memory, then in passed annotation, then in state. */
function findReaderAnnotation(
  reader: ReaderInstance,
  key: string | undefined,
  given: string | ReaderAnnotation,
): ReaderAnnotation | null | undefined {
  const am = getAnnotationManager(reader);
  const fromManager = am && key ? am._getAnnotationByID(key) : null;
  if (fromManager) return fromManager;
  if (typeof given === "object" && given) return given;
  const annotations = internals(reader)._state?.annotations;
  return annotations && key ? annotations.find((a) => a.id === key) : null;
}

/**
 * Determines CSL locator of an annotation (e.g. 'opus', 'paragraph', 'page').
 * Checks reader memory first because it updates immediately on changes before
 * Zotero persists asynchronously to SQLite.
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
  const readerAnn = findReaderAnnotation(reader, key, keyOrAnnotation);

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

/** User-friendly label of a locator (e.g. "Margin note", "Page"). */
function getLocatorLabel(locator: string | undefined): string {
  return locatorLabelText(
    locator,
    (l) => Zotero.Cite?.getLocatorString?.(l) || undefined,
    labels(),
  );
}

/** Label "Page" used when resetting open readers. */
function pageLabel(): string {
  return getLocatorLabel(DEFAULT_LOCATOR);
}

/** Updates locator label text in the header of a single annotation. */
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

/** Sets locator text on an element if it changed. */
function setLocatorText(reader: ReaderInstance, el: Element, annId: string) {
  const labelText = getLocatorLabel(getAnnotationLocator(reader, annId));
  if (el.textContent !== labelText) {
    el.textContent = labelText;
  }
}

function updatePageElements(reader: ReaderInstance, doc: Document): void {
  for (const pageEl of doc.querySelectorAll('.page[id^="page_"]')) {
    if (pageEl.firstElementChild) {
      setLocatorText(reader, pageEl.firstElementChild, pageEl.id.slice(5));
    }
  }
}

/** Also scan .annotation cards (if pageEl exists without id="page_"). */
function updateAnnotationCards(reader: ReaderInstance, doc: Document): void {
  for (const card of doc.querySelectorAll(
    ".annotation[data-id], .annotation[id]",
  )) {
    const annId = card.getAttribute("data-id") || card.id;
    const pageEl = card.querySelector(".page");
    if (pageEl?.firstElementChild) {
      setLocatorText(reader, pageEl.firstElementChild, annId);
    }
  }
}

/** Update in-page popup (.annotation-popup) as well. */
function updatePopup(reader: ReaderInstance, doc: Document): void {
  const popup = doc.querySelector(".annotation-popup");
  if (!popup) return;
  const editorNode = popup.querySelector(".editor[id], [data-id]");
  const r = internals(reader);
  const annId =
    editorNode?.id ||
    editorNode?.getAttribute("data-id") ||
    r._state?.primaryViewAnnotationPopup?.annotation?.id ||
    r._state?.secondaryViewAnnotationPopup?.annotation?.id;
  const pageEl = popup.querySelector(".page");
  if (annId && pageEl?.firstElementChild) {
    setLocatorText(reader, pageEl.firstElementChild, annId);
  }
}

/** Updates all visible annotation headers (sidebar and in-page popup). */
function updateAllLocators(reader: ReaderInstance, doc: Document): void {
  if (!reader || !doc) {
    return;
  }
  updatingLocators = true;
  try {
    updatePageElements(reader, doc);
    updateAnnotationCards(reader, doc);
    updatePopup(reader, doc);
  } finally {
    updatingLocators = false;
  }
}

/** Updates all open readers. */
function updateAllReaders(): void {
  for (const reader of registry()._readers ?? []) {
    const doc = internals(reader)._iframeWindow?.document;
    if (doc) {
      updateAllLocators(reader, doc);
    }
  }
}
