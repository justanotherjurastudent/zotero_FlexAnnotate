/**
 * "Full citation / Citation only" selection in the Word and LibreOffice citation dialog.
 *
 * The dialog is its own window (citationDialog.xhtml). The selection appears at two
 * places: in the settings popup (gear, next to "Include comments") and in the
 * popup of an entry, before the button bar. Both show the same setting.
 *
 * Verified against Zotero 10.0.1:
 *  - citationDialog.js shows/hides [data-dialog-type] elements itself depending on mode.
 *    Since we hook in afterwards, we set the initial state ourselves and follow
 *    changes via a MutationObserver on dialog-type.
 *  - citationDialog.js fills includeComments the same way from a pref.
 */
import { getPref, setPref } from "../../utils/prefs";

const ROW_CLASS = "flexannotate-citation-mode-row";
const SELECT_CLASS = "flexannotate-citation-mode";
const STYLE_ID = "flexannotate-citation-dialog-style";
/** Name of the plugin FTL; Zotero registers it for all plugins (plugins.js). */
const FTL_RESOURCE = "flexannotate-addon.ftl";

const observers = new WeakMap<Window, MutationObserver>();

/**
 * Builds the selection at all existing injection points of the dialog.
 * @param win - Citation dialog, loaded
 */
export function injectModeSelector(win: Window): void {
  const doc = win.document;
  if (doc.querySelector(`.${ROW_CLASS}`)) {
    return;
  }
  // Zotero 8 does not know the annotation mode in the citation dialog (since 9.x)
  if (!doc.getElementById("annotations-sidebar")) {
    return;
  }

  const rows: HTMLElement[] = [];

  const settingsPopup = doc.querySelector("#settings-popup .popup");
  if (settingsPopup) {
    const row = createRow(doc, "settings");
    settingsPopup.appendChild(row);
    rows.push(row);
  }

  // Before the button bar, so that "Remove / Show in Library / Done" stay at the bottom
  const detailsPopup = doc.querySelector("#itemDetails .popup");
  const buttons = detailsPopup?.querySelector(".buttons");
  if (detailsPopup && buttons) {
    const row = createRow(doc, "details");
    detailsPopup.insertBefore(row, buttons);
    rows.push(row);
  }

  if (!rows.length) {
    ztoolkit.log(
      "No injection point found in citation dialog; skipping mode selector",
    );
    return;
  }

  injectStyles(doc);
  localize(doc, rows);
  trackDialogType(win, rows);
  ztoolkit.log(
    `Added citation mode selector to citation dialog (${rows.length} location(s))`,
  );
}

/**
 * Removes selection, style and observer of a dialog.
 * @param win - Citation dialog
 */
export function removeModeSelector(win: Window): void {
  try {
    observers.get(win)?.disconnect();
    observers.delete(win);
    const doc = win.document;
    for (const row of doc.querySelectorAll<HTMLElement>(`.${ROW_CLASS}`)) {
      row.remove();
    }
    doc.getElementById(STYLE_ID)?.remove();
  } catch (e) {
    ztoolkit.log("citation mode selector removal failed:", e);
  }
}

/**
 * Style modeled on Zotero's own controls in the dialog (.details-data: 5px radius,
 * soft border). Colors come from Zotero's design tokens so light and dark fit.
 * appearance:none because the native Windows widget ignores the radius. The arrow is
 * drawn by Zotero further; the right padding only holds its place free.
 */
function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) {
    return;
  }

  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${ROW_CLASS} {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-block: 8px;
    }

    .${ROW_CLASS} > label {
      flex: 0 0 auto;
      margin: 0;
    }

    .${SELECT_CLASS} {
      flex: 0 0 auto;
      width: auto;
      appearance: none;
      font: inherit;
      color: var(--fill-primary);
      background-color: var(--material-button);
      border: var(--material-border);
      border-radius: 5px;
      padding: 4px 26px 4px 8px;
    }

    .${SELECT_CLASS}:hover {
      background-color: var(--fill-quinary);
    }

    .${SELECT_CLASS}:focus-visible {
      outline: var(--color-focus-outer-border) solid var(--width-focus-outer-border);
      outline-offset: var(--width-focus-border);
      box-shadow: 0 0 0 var(--width-focus-border) var(--color-focus-border);
    }
  `;
  doc.head!.appendChild(style);
}

function createRow(doc: Document, suffix: string): HTMLElement {
  const selectID = `${SELECT_CLASS}-${suffix}`;

  const row = doc.createElement("div");
  row.className = `hbox ${ROW_CLASS}`;
  // Zotero shows and hides rows based on this attribute depending on the dialog mode
  row.setAttribute("data-dialog-type", "annotations");

  const label = doc.createElement("label");
  label.setAttribute("for", selectID);
  label.setAttribute("data-l10n-id", "flexannotate-dialog-mode-label");

  const select = doc.createElement("select");
  select.id = selectID;
  select.className = SELECT_CLASS;

  for (const [value, l10nID] of [
    ["full", "flexannotate-dialog-mode-full"],
    ["citation", "flexannotate-dialog-mode-citation"],
  ]) {
    const option = doc.createElement("option");
    option.value = value;
    option.setAttribute("data-l10n-id", l10nID);
    select.appendChild(option);
  }

  select.value = getPref("citationOnly") ? "citation" : "full";
  select.addEventListener("change", () => {
    setPref("citationOnly", select.value === "citation");
    syncSelects(doc, select.value);
    ztoolkit.log(`Citation mode set to '${select.value}'`);
  });

  row.append(label, select);
  return row;
}

/** Keeps the selects of both injection points on the same state. */
function syncSelects(doc: Document, value: string): void {
  for (const select of doc.querySelectorAll<HTMLSelectElement>(
    `.${SELECT_CLASS}`,
  )) {
    if (select.value !== value) {
      select.value = value;
    }
  }
}

/**
 * Attaches the plugin FTL to the dialog document and translates the rows. The document
 * does not know the plugins' FTLs by itself, the resource name must be passed afterwards.
 */
function localize(doc: Document, rows: HTMLElement[]): void {
  try {
    const l10n = doc.l10n!;
    l10n.addResourceIds([FTL_RESOURCE]);
    for (const row of rows) {
      l10n.translateFragment(row);
    }
  } catch (e) {
    ztoolkit.log("citation mode selector localization failed:", e);
    // Fallback so the selection does not stand there without labels
    const german = (Zotero.locale || "").startsWith("de");
    for (const row of rows) {
      row.querySelector("label")!.textContent = german
        ? "Einfügen als"
        : "Insert as";
      const options = row.querySelector("select")!.options;
      options[0].textContent = german ? "Vollnachweis" : "Full annotation";
      options[1].textContent = german ? "Nur Nachweis" : "Citation only";
    }
  }
}

/**
 * Sets visibility according to the dialog mode and follows later switches.
 * Needed because citationDialog.js only goes through the [data-dialog-type] elements on a
 * mode switch, but our rows are only attached afterwards.
 */
function trackDialogType(win: Window, rows: HTMLElement[]): void {
  const doc = win.document;
  const apply = () => {
    const isAnnotations =
      doc.documentElement!.getAttribute("dialog-type") === "annotations";
    for (const row of rows) {
      row.hidden = !isAnnotations;
    }
  };
  apply();

  const observer = new win.MutationObserver(apply);
  observer.observe(doc.documentElement!, {
    attributes: true,
    attributeFilter: ["dialog-type"],
  });
  observers.set(win, observer);
}
