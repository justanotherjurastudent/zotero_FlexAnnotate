/**
 * Eingabemaske für Print-Annotationen: anlegen, bearbeiten und Kommentar bzw. Locator
 * nachtragen, auch bei nativen Annotationen aus PDF, EPUB und Snapshot.
 * Herkunft: legacy/dialog.js. Die reinen Regeln stehen in core/printDialog.ts.
 *
 * Kein eigenes Fenster: XUL-Elemente werden nur in privilegierten chrome-Dokumenten
 * geparst, eine chrome://-URI kann ein Plugin in Zotero 10 nicht registrieren, und
 * openDialog() mit file:// oder jar:// bleibt leer. Die Maske ist deshalb ein <panel>
 * im bereits privilegierten Hauptfenster, wie Zotero selbst seine Oberfläche baut
 * (MozXULElement.parseXULToFragment).
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
import { supportsText } from "../../core/printAnnotation";
import { getString } from "../../utils/locale";
import { defaultLogger } from "../../shared/feature";
import * as placeholder from "./placeholder";
import * as printAnnotations from "./printAnnotations";

type MainWin = _ZoteroTypes.MainWindow;

/** Felder der Maske: nur die Eigenschaften, die gelesen oder gesetzt werden. */
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
  /** Titel-Item; beim Bearbeiten fehlt es, wenn die Annotation keinen Parent hat */
  item: Zotero.Item | null;
  annotation: Zotero.Item | null;
  annotations: Zotero.Item[];
  requirePage: boolean;
}

/**
 * Zustand je Panel. Module sind je Sitzung einmal geladen, die Fenster aber nicht;
 * der Zustand gehört daher ans Element.
 */
const states = new WeakMap<Element, PanelState>();

/**
 * Wird nach jedem Speichern aufgerufen. Das Reader-Menü setzt es, um offene Reader
 * zu aktualisieren; so entsteht kein Zirkelimport zwischen beiden Modulen.
 */
let afterSave: (() => void) | null = null;

export function setAfterSave(fn: (() => void) | null): void {
  afterSave = fn;
}

/**
 * Öffnet die Maske zum Anlegen einer neuen Print-Annotation.
 * @param win - Zotero-Hauptfenster
 * @param parentItem - Reguläres Titel-Item
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

  // Ein vorhandener Platzhalter kann einen Standard-Locator tragen
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
  // Der Typ bestimmt, ob Zotero ein Zitatfeld erlaubt — nachträglich nicht mehr änderbar
  byId(doc, "flexannotate-dialog-type").disabled = false;

  show(win, panel, "flexannotate-dialog-page");
}

/**
 * Öffnet die Maske für bestehende Annotationen, Print-Annotationen ebenso wie native.
 * Mehrere Annotationen nur in der Ansicht 'locator'.
 * @param win - Zotero-Hauptfenster oder Reader-Fenster
 * @param annotations - Eine Annotation oder mehrere
 * @param options.view - 'full' (Standard) | 'comment' | 'locator'
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
  // Print-Quellen zitieren ausschließlich über die Seitenzahl; bei nativen
  // Annotationen leitet Zotero sie notfalls aus dem Dokument ab.
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

  // Zotero erlaubt nur den Wechsel zwischen highlight und underline (item.js:4494-4498),
  // deshalb bleibt der Typ beim Bearbeiten fest.
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
 * Setzt Haken und Sperre der Standard-Option anhand des gewählten Locators.
 * Das Dokument ist der Anhang der Annotation, bei Anlage der Platzhalter des Titels.
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

/** Blendet Gruppen und Felder der Ansicht ein und passt die Breite des Fensters an. */
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

/** Zeigt außer den wählbaren Typen nur den der bearbeiteten Annotation. */
function updateTypeMenu(doc: Document, currentType: string): void {
  const popup = byId(doc, "flexannotate-dialog-type-popup");
  for (const menuitem of Array.from(popup.children) as Field[]) {
    const value = menuitem.getAttribute("value") ?? "";
    menuitem.hidden = isTypeHidden(value, currentType);
  }
}

/** Zotero erlaubt annotationText nur bei highlight/underline; sonst ist das Zitatfeld gesperrt. */
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

/** Legt das Panel einmalig an und liefert es bei weiteren Aufrufen wieder. */
function build(win: MainWin): Panel {
  const doc = win.document;
  const existing = doc.getElementById(PANEL_ID) as Panel | null;
  if (existing) {
    return existing;
  }

  // Auch Reader-Fenster bauen die Maske selbst; ihnen fehlt unsere FTL noch
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
        // Menüauswahl in geöffnetem Dropdown nicht vorzeitig als Speichern abfangen
        if ((event.target as Element | null)?.closest?.("menupopup")) {
          return;
        }

        const activeEl = doc.activeElement;
        const isTextarea = activeEl?.tagName
          ?.toLowerCase()
          .endsWith("textarea");

        // In mehrzeiligen Textfeldern erzeugt Enter normale Zeilenumbrüche;
        // Strg+Enter / Cmd+Enter speichert auch dort.
        if (isTextarea && !event.ctrlKey && !event.metaKey) {
          return;
        }

        // Wenn "Abbrechen" fokussiert ist, schließt Enter das Fenster
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

/** Liefert alle sichtbaren und aktivierten fokussierbaren Elemente in DOM-Reihenfolge. */
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
 * Muss vor build() laufen. getLocatorString() liest Object.keys(Zotero.Styles.locales):
 * vor dem Ende von Zotero.Styles.init() ist `locales` undefined, und weil build() das
 * Panel dann schon eingehängt hat, bliebe die Locator-Liste bis zum nächsten Start leer.
 * init() liefert eine laufende Initialisierung als Promise und ist beliebig oft aufrufbar.
 */
async function ensureLocatorsReady(): Promise<void> {
  await Zotero.Styles.init();
}

/** Locator-Typen aus Zoteros Liste (Zotero.Cite.labels), beschriftet und alphabetisch sortiert. */
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
 * Farbauswahl aus Zoteros Palette. Die Namen kommen über Zotero.getString(), nicht über
 * data-l10n-id: ein XUL-<menuitem> zeigt das label-Attribut, Fluent setzt aber textContent.
 */
function buildColorMenu(doc: Document): void {
  const popup = byId(doc, "flexannotate-dialog-color-popup");
  // In zotero-types nicht typisiert
  const colors = (
    Zotero.Annotations as unknown as { COLORS: [string, string][] }
  ).COLORS;
  for (const [nameKey, hex] of colors) {
    const menuitem = doc.createXULElement("menuitem");
    menuitem.setAttribute("value", hex);
    menuitem.setAttribute("label", Zotero.getString(nameKey));
    popup.appendChild(menuitem);
  }
}

/**
 * Speichert die Eingaben. Bei fehlender Pflichtseite bleibt die Maske offen.
 * Der Dokument-Standard wird vor den Annotationen gesetzt, weil applyLocatorTag() beim
 * Setzen des Tags gegen ihn prüft.
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
      // Im Anlegemodus ist das Titel-Item immer gesetzt
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
    // Der Rohtext der Ausnahme steht bereits im Debug-Log und ist für Lesende nutzlos.
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
