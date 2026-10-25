/**
 * Page label popup (.label-popup) in the reader: locator selection and default checkbox.
 * Origin: pre-merge:src/readerMenu.js enhanceLabelPopup (lines 316-706), shortened.
 * Pure business rules live in core/labelPopup.ts.
 *
 * Zotero source (10.0.5, resource/reader/reader.js): LabelPopup component starting around line
 * ~35630 (markup: .modal-popup.label-popup > .row.label > .column.first input.toolbarField,
 * .column.second #renumber-auto-detect; fieldset.radio.row with input[name=renumber];
 * .row.buttons > button.form-button.primary), state in _handleOpenPageLabelPopup ~line 85620.
 * The legacy selectors match 10.0.5 accurately.
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

/** Reader internal subset needed by the popup (untyped in Zotero). */
interface PopupReader {
  itemID?: number;
  _state?: {
    labelPopup?: {
      currentAnnotation?: { id?: string; position?: { pageIndex?: number } };
      selectedIDs?: string[];
    };
  };
}

/** Reader annotation manager, as used by readerMenu. */
export interface PopupAnnotationManager {
  _getAnnotationByID(id: string): { id: string; tags?: unknown[] } | undefined;
  updateAnnotations(updates: unknown[]): void;
}

/** Callbacks provided by readerMenu. Injected via setter to avoid circular imports. */
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

/** Page index from JSON position; null if unreadable. */
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

/** Enables or disables a radio choice (with visual dimming). */
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
 * Injects the locator section into the popup and binds selection, checkbox,
 * radio defaults, and application logic (click and Enter). Idempotent on repeated calls.
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

  // Section: row 1 locator selection, row 2 default checkbox
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

  // Before radio buttons, otherwise before action buttons
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

  // Zotero's "this page and following" default is inappropriate here, so prefer 'single' or 'selected'
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

  // For non-page locators (e.g. margin note / paragraph) linear sequences are meaningless
  // and Zotero's "Auto-detect" breaks numbering there.
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

  // Zotero's popup re-renders asynchronously; reapply defaults after a tick and after 50ms
  setTimeout(() => {
    selectPreferredRadio();
    updateRadioVisibility();
  }, 0);
  setTimeout(() => {
    selectPreferredRadio();
    updateRadioVisibility();
  }, 50);

  // Apply on clicking "Update" or pressing Enter. 'applied' prevents duplicate runs
  // when both Enter handler and button click fire in succession.
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
      // When nothing changed, Zotero's native handlers run untouched (no SQLite race)
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
        // Primary: via reader AnnotationManager so Zotero persists tags and
        // page label atomically through onSaveAnnotations.
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
          // Also tag the main-process Zotero.Item
          printAnnotations.applyLocatorTag(target, chosen);
        }
        if (amUpdates.length) {
          am.updateAnnotations(amUpdates);
        }
      } else {
        // Fallback: save directly to Zotero.Item
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

  // Click on "Update" (delegation to survive re-renders)
  popup.addEventListener(
    "click",
    (event: Event) => {
      const target = event.target as Element | null;
      if (target?.closest?.(".row.buttons button")) {
        void onApply();
      }
    },
    true,
  );

  // Enter: inside text input Zotero's React handler handles submit & close,
  // so avoid preventDefault. Otherwise (select, checkbox) trigger the button.
  popup.addEventListener(
    "keydown",
    (event: Event) => {
      const kbEvent = event as KeyboardEvent;
      if (kbEvent.key !== "Enter") {
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
