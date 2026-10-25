/**
 * Dialog panel for print annotations: create, edit, and add comments or locators,
 * also for native annotations from PDF, EPUB, and snapshot.
 * Origin: pre-merge:src/dialog.js. Pure business rules live in core/printDialog.ts.
 *
 * Not an independent window: XUL elements are only parsed in privileged chrome documents,
 * a plugin cannot register a chrome:// URI in Zotero 10, and openDialog() with file:// or jar://
 * remains blank. The dialog is therefore a <panel> in the already privileged main window,
 * matching how Zotero itself builds its UI (MozXULElement.parseXULToFragment).
 */
import { config } from "../../../package.json";
import {
  buildLocatorEntries,
  buildSaveData,
  defaultCheckboxState,
  editView,
  initialFocus,
  isTypeHidden,
  nextFocusIndex,
  viewLayout,
  wantsDefault,
  type DialogInput,
  type DialogView,
} from "../../core/printDialog";
import { annotationColors, supportsText } from "./logic/printAnnotation";
import { getString } from "../../utils/locale";
import { defaultLogger } from "../../shared/feature";
import * as placeholder from "./placeholder";
import * as printAnnotations from "./printAnnotations";

type MainWin = _ZoteroTypes.MainWindow;

/** Dialog fields: only properties that are read or set. */
type Field = HTMLElement & {
  value: string;
  disabled: boolean;
  checked: boolean;
  select?: () => void;
};
type Panel = Field & {
  ownerDocument: Document;
  openPopupAtScreen(x: number, y: number, isContextMenu: boolean): void;
  hidePopup(): void;
};

const PANEL_ID = "flexannotate-print-annotation-panel";
const FTL = `${config.addonRef}-addon.ftl`;

interface PanelState {
  mode: "create" | "edit";
  view: DialogView;
  /** Top-level item; missing during edit if the annotation has no parent */
  item: Zotero.Item | null;
  annotation: Zotero.Item | null;
  annotations: Zotero.Item[];
  requirePage: boolean;
}

/**
 * State per panel. Modules are loaded once per session, but windows are not;
 * the state is therefore attached to the element.
 */
const states = new WeakMap<Element, PanelState>();

/**
 * Invoked after each save. The reader menu registers this callback to refresh open readers,
 * avoiding a circular import between both modules.
 */
let afterSave: (() => void) | null = null;

export function setAfterSave(fn: (() => void) | null): void {
  afterSave = fn;
}

/**
 * Opens the dialog panel to create a new print annotation.
 * @param win - Zotero main window
 * @param parentItem - Regular top-level item
 */
export async function open(
  win: MainWin,
  parentItem: Zotero.Item,
): Promise<void> {
  const doc = win.document;
  await ensureLocatorsReady();
  const panel = build(win);
  states.set(panel, {
    mode: "create",
    view: "full",
    item: parentItem,
    annotation: null,
    annotations: [],
    requirePage: true,
  });

  // An existing placeholder can carry a default locator
  fill(panel, {
    source: parentItem.getDisplayTitle(),
    locator: printAnnotations.getDefaultLocator(placeholder.find(parentItem)),
    pageLabel: "",
    type: "highlight",
    color: Zotero.Annotations.DEFAULT_COLOR,
    text: "",
    comment: "",
  });
  applyView(panel, "full", false);
  // The type determines whether Zotero permits a quote field — immutable once created
  byId(doc, "flexannotate-dialog-type").disabled = false;

  show(win, panel, "flexannotate-dialog-page");
}

/**
 * Opens the dialog for existing annotations, print annotations as well as native ones.
 * Multiple annotations only supported in 'locator' view.
 * @param win - Zotero main window or reader window
 * @param annotations - One annotation or multiple
 * @param options.view - 'full' (default) | 'comment' | 'locator'
 */
export async function openForEdit(
  win: MainWin,
  annotations: Zotero.Item | Zotero.Item[],
  options: { view?: DialogView } = {},
): Promise<void> {
  const list = ([] as Zotero.Item[])
    .concat(annotations)
    .filter((a) => a && a.isAnnotation());
  if (!list.length) {
    return;
  }
  const doc = win.document;
  await ensureLocatorsReady();
  const panel = build(win);
  const [annotation] = list;
  const item = annotation.topLevelItem;
  const multi = list.length > 1;
  const view = editView(list.length, options.view);
  // Print sources cite exclusively via page label; for native
  // annotations Zotero derives them from the document if necessary.
  const isPrint = placeholder.isPlaceholder(annotation.parentItem);
  states.set(panel, {
    mode: "edit",
    view,
    item,
    annotation,
    annotations: list,
    requirePage: isPrint,
  });

  fill(panel, {
    source: item ? item.getDisplayTitle() : "",
    locator: printAnnotations.getLocator(annotation),
    pageLabel: multi ? "" : annotation.annotationPageLabel || "",
    type: annotation.annotationType,
    color: annotation.annotationColor || Zotero.Annotations.DEFAULT_COLOR,
    text: annotation.annotationText || "",
    comment: annotation.annotationComment || "",
  });
  applyView(panel, view, multi);

  // Zotero only permits switching between highlight and underline (item.js:4494-4498),
  // so the type remains fixed during edit.
  byId(doc, "flexannotate-dialog-type").disabled = true;

  const focus = {
    comment: "flexannotate-dialog-comment",
    locator: "flexannotate-dialog-locator",
    page: "flexannotate-dialog-page",
  };
  show(win, panel, focus[initialFocus(view, isPrint)]);
}

interface FillValues {
  source: string;
  locator: string;
  pageLabel: string;
  type: DialogInput["type"];
  color: string;
  text: string;
  comment: string;
}

function fill(panel: Panel, values: FillValues): void {
  const doc = panel.ownerDocument;
  byId(doc, "flexannotate-dialog-source").textContent = values.source;
  byId(doc, "flexannotate-dialog-locator").value = values.locator;
  byId(doc, "flexannotate-dialog-page").value = values.pageLabel;

  syncDefaultCheckbox(panel, values.locator);
  updateTypeMenu(doc, values.type);
  byId(doc, "flexannotate-dialog-type").value = values.type;
  byId(doc, "flexannotate-dialog-color").value = values.color;
  byId(doc, "flexannotate-dialog-text").value = values.text;
  byId(doc, "flexannotate-dialog-comment").value = values.comment;
  updateTextFieldState(doc);
}

/**
 * Updates checked and disabled state of the default checkbox based on the selected locator.
 * The document is the annotation's attachment, or for creation the item's placeholder.
 */
function syncDefaultCheckbox(panel: Panel, locator: string): void {
  const checkbox = panel.ownerDocument.getElementById(
    "flexannotate-dialog-default",
  ) as Field | null;
  if (!checkbox) {
    return;
  }
  const state = stateOf(panel);
  const attachment =
    state.annotation?.parentItem ||
    (state.item ? placeholder.find(state.item) : null);
  const docDefault = printAnnotations.getDefaultLocator(attachment || null);
  const next = defaultCheckboxState(docDefault, locator);
  checkbox.checked = next.checked;
  checkbox.disabled = next.disabled;
}

/** Shows groups and fields for the view and adjusts container width. */
function applyView(panel: Panel, view: DialogView, multi: boolean): void {
  const doc = panel.ownerDocument;
  const layout = viewLayout(view);
  const container = doc.getElementById(
    "flexannotate-dialog-container",
  ) as HTMLElement | null;
  if (container) {
    container.style.width = `${layout.width}px`;
    container.style.minWidth = `${layout.minWidth}px`;
    container.style.maxWidth = `${layout.maxWidth}px`;
  }

  byId(doc, "flexannotate-dialog-group-locator").hidden = !layout.locator;
  byId(doc, "flexannotate-dialog-group-typecolor").hidden = !layout.typeColor;
  byId(doc, "flexannotate-dialog-group-text").hidden = !layout.text;
  byId(doc, "flexannotate-dialog-group-comment").hidden = !layout.comment;
  byId(doc, "flexannotate-dialog-page").hidden = multi;
}

/** Shows only selectable types plus the type of the annotation being edited. */
function updateTypeMenu(doc: Document, currentType: string): void {
  const popup = byId(doc, "flexannotate-dialog-type-popup");
  for (const menuitem of Array.from(popup.children) as Field[]) {
    const value = menuitem.getAttribute("value") ?? "";
    menuitem.hidden = isTypeHidden(value, currentType);
  }
}

/** Zotero only allows annotationText for highlight/underline; otherwise quote field is disabled. */
function updateTextFieldState(doc: Document): void {
  const type = byId(doc, "flexannotate-dialog-type").value;
  const textField = byId(doc, "flexannotate-dialog-text");
  const supported = supportsText(type);
  textField.disabled = !supported;
  textField.style.opacity = supported ? "1" : "0.5";
}

function show(win: MainWin, panel: Panel, focusID: string): void {
  const { width } = viewLayout(stateOf(panel).view);
  const x = win.screenX + Math.max(0, (win.outerWidth - width) / 2);
  const y = win.screenY + Math.max(0, (win.outerHeight - 320) / 3);
  panel.openPopupAtScreen(x, y, false);

  const target = win.document.getElementById(focusID) as Field | null;
  if (target) {
    setTimeout(() => {
      target.focus();
      target.select?.();
    }, 50);
  }
}

/** Creates the panel once and returns it on subsequent calls. */
function build(win: MainWin): Panel {
  const doc = win.document;
  const existing = doc.getElementById(PANEL_ID) as Panel | null;
  if (existing) {
    return existing;
  }

  // Reader windows also construct the panel themselves; they may lack our FTL initially
  try {
    win.MozXULElement.insertFTLIfNeeded(FTL);
  } catch (e) {
    defaultLogger("printDialog", "insertFTL", e);
  }

  const fragment = win.MozXULElement.parseXULToFragment(`
    <panel id="${PANEL_ID}" type="arrow" noautohide="true" align="stretch">
      <vbox id="flexannotate-dialog-container" style="padding: 12px; gap: 8px;">
        <description id="flexannotate-dialog-source"
          style="font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;"/>

        <vbox id="flexannotate-dialog-group-locator" style="gap: 6px;">
          <hbox align="center" style="gap: 8px;">
            <menulist id="flexannotate-dialog-locator" native="true" style="flex: 1;">
              <menupopup id="flexannotate-dialog-locator-popup"/>
            </menulist>
            <html:input id="flexannotate-dialog-page" type="text"
              style="width: 6em;"/>
          </hbox>
          <checkbox id="flexannotate-dialog-default" native="true"
            data-l10n-id="flexannotate-field-default-locator"/>
        </vbox>

        <hbox id="flexannotate-dialog-group-typecolor" align="center"
          style="gap: 8px;">
          <label data-l10n-id="flexannotate-field-type"
            control="flexannotate-dialog-type"/>
          <menulist id="flexannotate-dialog-type" native="true">
            <menupopup id="flexannotate-dialog-type-popup">
              <menuitem value="highlight"
                data-l10n-id="flexannotate-type-highlight"/>
              <menuitem value="underline"
                data-l10n-id="flexannotate-type-underline"/>
              <menuitem value="note"
                data-l10n-id="flexannotate-type-note"/>
              <menuitem value="text"
                data-l10n-id="flexannotate-type-text"/>
              <menuitem value="image"
                data-l10n-id="flexannotate-type-image"/>
              <menuitem value="ink"
                data-l10n-id="flexannotate-type-ink"/>
            </menupopup>
          </menulist>

          <label data-l10n-id="flexannotate-field-color"
            control="flexannotate-dialog-color"/>
          <menulist id="flexannotate-dialog-color" native="true">
            <menupopup id="flexannotate-dialog-color-popup"/>
          </menulist>
        </hbox>

        <vbox id="flexannotate-dialog-group-text" style="gap: 6px;">
          <label data-l10n-id="flexannotate-field-text"
            control="flexannotate-dialog-text"/>
          <html:textarea id="flexannotate-dialog-text" rows="5"/>
        </vbox>

        <vbox id="flexannotate-dialog-group-comment" style="gap: 6px;">
          <label data-l10n-id="flexannotate-field-comment"
            control="flexannotate-dialog-comment"/>
          <html:textarea id="flexannotate-dialog-comment" rows="3"/>
        </vbox>

        <hbox pack="end" style="gap: 8px; margin-top: 6px;">
          <button id="flexannotate-dialog-cancel"
            data-l10n-id="flexannotate-button-cancel" native="true"/>
          <button id="flexannotate-dialog-accept"
            data-l10n-id="flexannotate-button-save" native="true"
            default="true"/>
        </hbox>
      </vbox>
    </panel>
  `);

  (doc.documentElement as HTMLElement).appendChild(fragment);
  const panel = byId(doc, PANEL_ID) as Panel;

  buildLocatorMenu(doc);
  buildColorMenu(doc);

  byId(doc, "flexannotate-dialog-type").addEventListener("command", () =>
    updateTextFieldState(doc),
  );
  byId(doc, "flexannotate-dialog-cancel").addEventListener("command", () =>
    panel.hidePopup(),
  );
  byId(doc, "flexannotate-dialog-accept").addEventListener("command", () =>
    accept(win, panel).catch(logFailure),
  );
  byId(doc, "flexannotate-dialog-locator").addEventListener("command", () =>
    syncDefaultCheckbox(panel, byId(doc, "flexannotate-dialog-locator").value),
  );

  panel.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        panel.hidePopup();
        return;
      }

      if (event.key === "Tab") {
        const focusables = getFocusableElements(panel);
        if (!focusables.length) {
          return;
        }
        const activeEl = doc.activeElement;
        let currentIndex = focusables.indexOf(activeEl as Field);
        if (currentIndex === -1) {
          currentIndex = focusables.findIndex((el) => el.contains(activeEl));
        }

        event.preventDefault();
        event.stopPropagation();
        const target =
          focusables[
            nextFocusIndex(focusables.length, currentIndex, event.shiftKey)
          ];
        if (target) {
          target.focus();
          target.select?.();
        }
        return;
      }

      if (event.key === "Enter") {
        // Do not intercept menu selection in an open dropdown as save
        if ((event.target as Element | null)?.closest?.("menupopup")) {
          return;
        }

        const activeEl = doc.activeElement;
        const isTextarea = activeEl?.tagName
          ?.toLowerCase()
          .endsWith("textarea");

        // In multiline text fields Enter creates normal line breaks;
        // Ctrl+Enter / Cmd+Enter saves there as well.
        if (isTextarea && !event.ctrlKey && !event.metaKey) {
          return;
        }

        // If "Cancel" is focused, Enter closes the panel
        if (activeEl?.id === "flexannotate-dialog-cancel") {
          event.preventDefault();
          event.stopPropagation();
          panel.hidePopup();
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        accept(win, panel).catch(logFailure);
      }
    },
    true,
  );

  return panel;
}

/** Returns all visible and enabled focusable elements in DOM order. */
function getFocusableElements(panel: Panel): Field[] {
  const candidates = Array.from(
    panel.querySelectorAll(
      "menulist, input, html\\:input, textarea, html\\:textarea, checkbox, button",
    ),
  ) as Field[];
  return candidates.filter((el) => {
    if (el.disabled || el.hidden) {
      return false;
    }
    let cur: Element | null = el;
    while (cur && cur !== panel) {
      if (
        (cur as Field).hidden ||
        (cur as HTMLElement).style?.display === "none"
      ) {
        return false;
      }
      cur = cur.parentElement;
    }
    return true;
  });
}

/**
 * Must run before build(). getLocatorString() reads Object.keys(Zotero.Styles.locales):
 * before Zotero.Styles.init() completes, `locales` is undefined, and because build()
 * would already mount the panel, the locator list would stay empty until next restart.
 * init() returns an ongoing initialization promise and is safe to call repeatedly.
 */
async function ensureLocatorsReady(): Promise<void> {
  await Zotero.Styles.init();
}

/** Locator types from Zotero's list (Zotero.Cite.labels), labeled and alphabetically sorted. */
function buildLocatorMenu(doc: Document): void {
  const popup = byId(doc, "flexannotate-dialog-locator-popup");
  for (const { value, label } of buildLocatorEntries(
    Zotero.Cite.labels,
    (locator) => Zotero.Cite.getLocatorString(locator),
  )) {
    const menuitem = doc.createXULElement("menuitem");
    menuitem.setAttribute("value", value);
    menuitem.setAttribute("label", label);
    popup.appendChild(menuitem);
  }
}

/**
 * Color options from Zotero's palette. Names are retrieved via Zotero.getString(), not via
 * data-l10n-id: a XUL <menuitem> displays the label attribute, whereas Fluent sets textContent.
 */
function buildColorMenu(doc: Document): void {
  const popup = byId(doc, "flexannotate-dialog-color-popup");
  // Untyped in zotero-types; Zotero 7-9 does not have COLORS
  const colors = annotationColors(
    (Zotero.Annotations as unknown as { COLORS?: unknown }).COLORS,
  );
  for (const [nameKey, hex] of colors) {
    const menuitem = doc.createXULElement("menuitem");
    menuitem.setAttribute("value", hex);
    menuitem.setAttribute("label", colorLabel(nameKey));
    popup.appendChild(menuitem);
  }
}

/**
 * Name of a color. 8.x/9.x/10.x: general-*; 7.x: general.* (zotero.properties).
 * If a key is missing, Zotero throws in en-US and returns the key string in other locales.
 */
function colorLabel(nameKey: string): string {
  for (const key of [nameKey, nameKey.replace("-", ".")]) {
    try {
      const label = Zotero.getString(key);
      if (label && label !== key) return label;
    } catch {
      // Key unknown in this version
    }
  }
  return nameKey;
}

/**
 * Saves user input. If a required page label is missing, the panel remains open.
 * The document default is set before annotations because applyLocatorTag() checks
 * against it when setting tags.
 */
async function accept(win: MainWin, panel: Panel): Promise<void> {
  const doc = win.document;
  const state = stateOf(panel);
  const multi = state.annotations.length > 1;
  const checkbox = doc.getElementById(
    "flexannotate-dialog-default",
  ) as Field | null;

  const data = buildSaveData(
    {
      locator: byId(doc, "flexannotate-dialog-locator").value,
      page: byId(doc, "flexannotate-dialog-page").value,
      type: byId(doc, "flexannotate-dialog-type").value as DialogInput["type"],
      color: byId(doc, "flexannotate-dialog-color").value,
      text: byId(doc, "flexannotate-dialog-text").value,
      comment: byId(doc, "flexannotate-dialog-comment").value,
    },
    { view: state.view, multi, requirePage: state.requirePage },
  );
  if (!data) {
    byId(doc, "flexannotate-dialog-page").focus();
    return;
  }
  const makeDefault = wantsDefault(
    state.view,
    !!checkbox?.checked,
    !!checkbox?.disabled,
  );

  panel.hidePopup();

  try {
    if (state.mode === "edit") {
      if (makeDefault) {
        await printAnnotations.setDefaultLocator(
          state.annotation?.parentItem || null,
          data.locator as string,
        );
      }
      for (const annotation of state.annotations) {
        await printAnnotations.update(annotation, data);
      }
    } else {
      // In create mode the top-level item is always set
      const item = state.item as Zotero.Item;
      if (makeDefault) {
        const attachment = await placeholder.ensure(item);
        await printAnnotations.setDefaultLocator(
          attachment,
          data.locator as string,
        );
      }
      await printAnnotations.create(item, data);
    }
    afterSave?.();
  } catch (e) {
    defaultLogger("printDialog", "save", e);
    // The raw exception is already logged to debug output and is not helpful to users.
    Zotero.alert(win, config.addonName, getString("save-failed"));
  }
}

function logFailure(e: unknown): void {
  defaultLogger("printDialog", "accept", e);
}

function stateOf(panel: Element): PanelState {
  const state = states.get(panel);
  if (!state) {
    throw new Error("Print dialog panel has no state");
  }
  return state;
}

function byId(doc: Document, id: string): Field {
  return doc.getElementById(id) as Field;
}
