/**
 * Seitenzahl-Popup (.label-popup) im Reader: Locator-Auswahl und Standard-Checkbox.
 * Herkunft: legacy/readerMenu.js enhanceLabelPopup (Zeilen 316-706), verkürzt. Die
 * reinen Entscheidungen stehen in core/labelPopup.ts.
 *
 * Zotero-Quelle (10.0.5, resource/reader/reader.js): Komponente LabelPopup ab Zeile
 * ~35630 (Markup: .modal-popup.label-popup > .row.label > .column.first input.toolbarField,
 * .column.second #renumber-auto-detect; fieldset.radio.row mit input[name=renumber];
 * .row.buttons > button.form-button.primary), Zustand _handleOpenPageLabelPopup ~Zeile 85620.
 * Die Selektoren des Legacy-Codes treffen 10.0.5 zu.
 */
import { defaultLogger } from "../../shared/feature";
import { getString } from "../../utils/locale";
import {
  DEFAULT_LOCATOR,
  FALLBACK_LOCATORS,
  LOCATOR_PREFIX,
} from "../../core/locator";
import {
  buildLocatorOptions,
  defaultCheckboxState,
  isPageLocator,
  planApply,
  preferredRadio,
  type Ref,
  selectTargets,
  shouldSetPageLabel,
} from "../../core/labelPopup";
import * as printAnnotations from "../print/printAnnotations";

type ReaderInstance = _ZoteroTypes.ReaderInstance;

/** Ausschnitt der Reader-Interna, den das Popup braucht (nicht typisiert von Zotero). */
interface PopupReader {
  itemID?: number;
  _state?: {
    labelPopup?: {
      currentAnnotation?: { id?: string; position?: { pageIndex?: number } };
      selectedIDs?: string[];
    };
  };
}

/** Annotation-Manager des Readers, wie ihn readerMenu nutzt. */
export interface PopupAnnotationManager {
  _getAnnotationByID(id: string): { id: string; tags?: unknown[] } | undefined;
  updateAnnotations(updates: unknown[]): void;
}

/** Callbacks aus readerMenu. Gesetzt statt importiert, da readerMenu dieses Modul importiert. */
export interface LabelPopupHooks {
  updateLocators(reader: ReaderInstance, doc: Document): void;
  updateReaders(): void;
  getAnnotationManager(reader: ReaderInstance): PopupAnnotationManager | null;
}

let hooks: LabelPopupHooks | null = null;

export function setLabelPopupHooks(next: LabelPopupHooks | null): void {
  hooks = next;
}

const popupReader = (reader: ReaderInstance) =>
  reader as unknown as PopupReader;

function findAnnotation(
  attachment: Zotero.Item,
  key: string | undefined,
): Zotero.Item | null {
  if (!key) return null;
  return (
    attachment.getAnnotations().find((a) => a.key === key) ||
    Zotero.Items.getByLibraryAndKey(attachment.libraryID, key) ||
    null
  );
}

/** Seitenindex aus der JSON-Position; null, wenn sie nicht lesbar ist. */
function pageIndexOf(item: Zotero.Item): number | null | undefined {
  try {
    const pos = JSON.parse(item.annotationPosition);
    return pos?.pageIndex;
  } catch {
    return null;
  }
}

function toRef(item: Zotero.Item): Ref<Zotero.Item> {
  return { key: item.key, pageIndex: pageIndexOf(item), item };
}

/** Schreibt die Radio-Auswahl eines Modus frei oder sperrt sie (mit Abdunkelung). */
function setRadioEnabled(radio: HTMLInputElement | null, enabled: boolean) {
  if (!radio) return;
  radio.disabled = !enabled;
  const parent = (radio.closest("label") ||
    radio.parentElement) as HTMLElement | null;
  if (parent) {
    parent.style.opacity = enabled ? "" : "0.4";
    parent.style.pointerEvents = enabled ? "" : "none";
  }
}

/**
 * Hängt den Locator-Abschnitt in das Popup ein und verdrahtet Auswahl, Checkbox,
 * Radio-Vorgabe und Anwenden (Klick und Enter). Mehrfacher Aufruf ist unschädlich.
 */
export function enhanceLabelPopup(
  reader: ReaderInstance,
  popup: Element,
): void {
  if (popup.querySelector(".flexannotate-locator-section")) {
    return;
  }
  const r = popupReader(reader);
  const attachment = r.itemID ? Zotero.Items.get(r.itemID) : null;
  if (!attachment) {
    return;
  }

  const currentKey = r._state?.labelPopup?.currentAnnotation?.id;
  const currentAnnotation = findAnnotation(attachment, currentKey);
  const currentLocator = currentAnnotation
    ? printAnnotations.getLocator(currentAnnotation)
    : printAnnotations.getDefaultLocator(attachment);
  const docDefault = printAnnotations.getDefaultLocator(attachment);
  const known = Zotero.Cite?.labels ?? FALLBACK_LOCATORS;

  const doc = popup.ownerDocument as Document;

  // Abschnitt: Zeile 1 Locator-Auswahl, Zeile 2 Standard-Checkbox
  const container = doc.createElement("div");
  container.className = "row flexannotate-locator-section";
  container.style.cssText =
    "margin: 8px 0; display: flex; flex-direction: column; gap: 6px;";

  const rowTop = doc.createElement("div");
  rowTop.style.cssText = "display: flex; align-items: center; gap: 8px;";

  const label = doc.createElement("label");
  label.textContent = getString("reader-popup-locator-label");
  label.style.cssText = "font-weight: bold; font-size: 12px; min-width: 50px;";

  const select = doc.createElement("select");
  select.className = "toolbarField flexannotate-locator-select";
  select.style.cssText =
    "flex: 1; padding: 2px 6px; font-size: 12px; border-radius: 4px; border: 1px solid var(--material-panedivider, #ccc); background: var(--material-background, #fff); color: inherit;";

  const options = buildLocatorOptions(known, (loc) =>
    Zotero.Cite.getLocatorString(loc),
  );
  for (const { value, label: optLabel } of options) {
    const opt = doc.createElement("option");
    opt.value = value;
    opt.textContent = optLabel;
    if (value === currentLocator) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }
  rowTop.appendChild(label);
  rowTop.appendChild(select);

  const rowBottom = doc.createElement("div");
  rowBottom.style.cssText =
    "display: flex; align-items: center; gap: 6px; margin-top: 2px;";

  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  checkbox.id = "flexannotate-default-locator-check";
  checkbox.style.cssText = "margin: 0;";

  const checkLabel = doc.createElement("label");
  checkLabel.htmlFor = "flexannotate-default-locator-check";
  checkLabel.style.cssText =
    "font-size: 11px; cursor: pointer; user-select: none;";

  const updateCheckboxState = () => {
    const state = defaultCheckboxState(select.value, docDefault);
    checkbox.checked = state.checked;
    checkbox.disabled = state.disabled;
    checkLabel.textContent = state.alreadyDefault
      ? getString("reader-popup-already-default")
      : getString("field-default-locator", "label");
  };

  rowBottom.appendChild(checkbox);
  rowBottom.appendChild(checkLabel);
  container.appendChild(rowTop);
  container.appendChild(rowBottom);

  // Vor den Radio-Buttons, sonst vor den Buttons
  const fieldset = popup.querySelector("fieldset.radio");
  if (fieldset) {
    fieldset.before(container);
    const legend = fieldset.querySelector("legend");
    if (legend) {
      legend.textContent = getString("reader-popup-legend");
    }
  } else {
    const buttons = popup.querySelector(".row.buttons");
    if (buttons) {
      buttons.before(container);
    } else {
      popup.appendChild(container);
    }
  }

  // Zoteros "diese Seite und folgende" ist die falsche Vorgabe, daher 'single' bzw. 'selected'
  const selectPreferredRadio = () => {
    const values = [
      ...popup.querySelectorAll<HTMLInputElement>('input[name="renumber"]'),
    ].map((el) => el.value);
    const pick = preferredRadio(values);
    const radio =
      pick &&
      popup.querySelector<HTMLInputElement>(
        `input[name="renumber"][value="${pick}"]`,
      );
    if (radio && !radio.checked) {
      radio.click();
    }
  };

  const autoDetectCol = (popup.querySelector<HTMLElement>(
    ".row.label .column.second",
  ) ||
    popup.querySelector<HTMLElement>("#renumber-auto-detect")
      ?.parentElement) as HTMLElement | null | undefined;

  // Bei Locator ungleich 'page' (z. B. Randnummer) sind lineare Seitenfolgen sinnlos
  // und Zoteros "Automatisch erkennen" zerstört dort die Zählung.
  const updateRadioVisibility = () => {
    const linear = isPageLocator(select.value);
    const fromRadio = popup.querySelector<HTMLInputElement>(
      'input[name="renumber"][value="from"]',
    );
    const allRadio = popup.querySelector<HTMLInputElement>(
      'input[name="renumber"][value="all"]',
    );

    if (autoDetectCol) {
      autoDetectCol.style.display = linear ? "" : "none";
    }
    const autoCheck = popup.querySelector<HTMLInputElement>(
      "#renumber-auto-detect",
    );
    if (!linear && autoCheck?.checked) {
      autoCheck.click();
    }

    setRadioEnabled(fromRadio, linear);
    setRadioEnabled(allRadio, linear);
    if (!linear) {
      const checked = popup.querySelector<HTMLInputElement>(
        'input[name="renumber"]:checked',
      );
      if (checked && (checked.value === "from" || checked.value === "all")) {
        selectPreferredRadio();
      }
    }
  };

  select.addEventListener("change", () => {
    updateCheckboxState();
    updateRadioVisibility();
  });

  updateCheckboxState();
  selectPreferredRadio();
  updateRadioVisibility();

  // Zoteros Popup rendert nach; die Vorgabe deshalb nach einem Tick und nach 50 ms erneut setzen
  setTimeout(() => {
    selectPreferredRadio();
    updateRadioVisibility();
  }, 0);
  setTimeout(() => {
    selectPreferredRadio();
    updateRadioVisibility();
  }, 50);

  // Anwenden bei Klick auf "Aktualisieren" oder Enter. 'applied' verhindert Doppelausführung,
  // weil der Enter-Handler und der Klick beide auslösen können.
  let applied = false;
  const onApply = async () => {
    if (applied) {
      return;
    }
    try {
      const chosen = select.value;
      const makeDefault = checkbox.checked && !checkbox.disabled;

      const key = r._state?.labelPopup?.currentAnnotation?.id || currentKey;
      const currentAnn = key
        ? findAnnotation(attachment, key)
        : currentAnnotation;
      const plan = planApply(
        chosen,
        currentAnn ? printAnnotations.getLocator(currentAnn) : null,
        makeDefault,
        printAnnotations.getDefaultLocator(attachment),
        known,
      );
      // Ohne Änderung greifen Zoteros native Handler ungestört (keine SQLite-Rennbedingung)
      if (!plan.apply) {
        return;
      }
      applied = true;

      if (plan.setDefault) {
        await printAnnotations.setDefaultLocator(
          attachment,
          chosen,
          currentAnn?.key,
        );
      }

      const checkedRadio =
        popup.querySelector<HTMLInputElement>('input[name="renumber"]:checked')
          ?.value || "single";
      const state = r._state?.labelPopup;
      const all = attachment.getAnnotations().map(toRef);
      const targets = selectTargets(
        checkedRadio,
        chosen,
        currentAnn ? toRef(currentAnn) : null,
        all,
        state?.selectedIDs || [],
        state?.currentAnnotation?.position?.pageIndex,
      );

      const pageInput = popup.querySelector<HTMLInputElement>(
        'input.toolbarField, input[type="text"]',
      );
      const newPageLabel = pageInput?.value?.trim();
      const setLabel = shouldSetPageLabel(
        newPageLabel,
        targets.length,
        checkedRadio,
      );
      const docDefaultNow = plan.setDefault
        ? chosen
        : printAnnotations.getDefaultLocator(attachment);

      const am = hooks?.getAnnotationManager(reader) ?? null;
      if (am) {
        // Primär: über den AnnotationManager des Readers, damit Zotero Tags und
        // Seitenzahl atomar über onSaveAnnotations speichert.
        const amUpdates: unknown[] = [];
        for (const target of targets) {
          const existing = am._getAnnotationByID(target.key);
          if (existing) {
            const newTags = (existing.tags || []).filter((t) => {
              const obj = t as { name?: string; tag?: string } | null;
              const name =
                typeof t === "string" ? t : obj?.name || obj?.tag || "";
              return !name.startsWith(LOCATOR_PREFIX);
            });
            if (
              chosen !== DEFAULT_LOCATOR ||
              docDefaultNow !== DEFAULT_LOCATOR
            ) {
              newTags.push({ name: LOCATOR_PREFIX + chosen });
            }
            const update: { id: string; tags: unknown[]; pageLabel?: string } =
              { id: existing.id, tags: newTags };
            if (setLabel && newPageLabel) {
              update.pageLabel = newPageLabel;
            }
            amUpdates.push(update);
          }
          // Zusätzlich das Zotero.Item des Hauptprozesses taggen
          printAnnotations.applyLocatorTag(target, chosen);
        }
        if (amUpdates.length) {
          am.updateAnnotations(amUpdates);
        }
      } else {
        // Fallback: direkt auf dem Zotero.Item speichern
        for (const ann of targets) {
          printAnnotations.applyLocatorTag(ann, chosen);
          if (setLabel && newPageLabel) {
            (
              ann as unknown as { annotationPageLabel: string }
            ).annotationPageLabel = newPageLabel;
          }
          await ann.saveTx();
        }
      }

      hooks?.updateLocators(reader, doc);
      hooks?.updateReaders();
    } catch (e) {
      defaultLogger("labelPopup", "apply", e);
    }
  };

  // Klick auf "Aktualisieren" (Delegation, damit sie nach Re-Renders wirkt)
  popup.addEventListener(
    "click",
    (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.(".row.buttons button")) {
        void onApply();
      }
    },
    true,
  );

  // Enter: Im Textfeld übernimmt Zoteros React-Handler das Aktualisieren und Schließen,
  // daher kein preventDefault. Sonst (Select, Checkbox) den Button auslösen.
  popup.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key !== "Enter") {
        return;
      }
      const pageInput = popup.querySelector<HTMLInputElement>(
        'input.toolbarField, input[type="text"]',
      );
      void onApply();
      if (event.target !== pageInput) {
        event.preventDefault();
        event.stopPropagation();
        const btn = popup.querySelector<HTMLButtonElement>(
          ".row.buttons button.primary, .row.buttons button",
        );
        if (btn && !btn.disabled) {
          btn.click();
        }
      }
    },
    true,
  );
}
