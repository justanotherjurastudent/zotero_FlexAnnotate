/**
 * Auswahl „Vollnachweis / Nur Nachweis" im Zitationsdialog von Word und LibreOffice.
 *
 * Der Dialog ist ein eigenes Fenster (citationDialog.xhtml). Die Auswahl erscheint an
 * zwei Stellen: im Einstellungs-Popup (Zahnrad, neben „Kommentare einbeziehen") und im
 * Popup eines Eintrags, vor der Knopfleiste. Beide zeigen dieselbe Einstellung.
 *
 * Verifiziert gegen Zotero 10.0.1:
 *  - citationDialog.js blendet [data-dialog-type]-Elemente je nach Modus selbst ein und
 *    aus. Da wir danach einhängen, setzen wir den Anfangszustand selbst und folgen
 *    Wechseln über einen MutationObserver auf dialog-type.
 *  - citationDialog.js füllt includeComments genauso aus einem Pref.
 */
import { getPref, setPref } from "../../utils/prefs";

const ROW_CLASS = "flexannotate-citation-mode-row";
const SELECT_CLASS = "flexannotate-citation-mode";
const STYLE_ID = "flexannotate-citation-dialog-style";
/** Name der Plugin-FTL; Zotero registriert sie für alle Plugins (plugins.js). */
const FTL_RESOURCE = "flexannotate-addon.ftl";

const observers = new WeakMap<Window, MutationObserver>();

/**
 * Baut die Auswahl an allen vorhandenen Einbauorten des Dialogs ein.
 * @param win - Zitationsdialog, geladen
 */
export function injectModeSelector(win: Window): void {
  const doc = win.document;
  if (doc.querySelector(`.${ROW_CLASS}`)) {
    return;
  }
  // Zotero 8 kennt den Annotationsmodus im Zitierdialog nicht (ab 9.x)
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

  // Vor die Knopfleiste, damit „Entfernen / In Bibliothek anzeigen / Erledigt" unten bleiben
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
 * Entfernt Auswahl, Stil und Beobachter eines Dialogs.
 * @param win - Zitationsdialog
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
 * Stil angelehnt an Zoteros eigene Bedienelemente im Dialog (.details-data: 5px Radius,
 * weicher Rand). Farben kommen aus Zoteros Design-Tokens, damit hell und dunkel passen.
 * appearance:none, weil das native Windows-Widget den Radius ignoriert. Den Pfeil
 * zeichnet Zotero weiter; das rechte Padding hält nur seinen Platz frei.
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
  // Zotero blendet Zeilen anhand dieses Attributs je nach Dialogmodus ein und aus
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

/** Hält die Auswahlfelder beider Einbauorte auf demselben Stand. */
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
 * Hängt die Plugin-FTL an das Dialogdokument und übersetzt die Zeilen. Das Dokument
 * kennt die FTLs der Plugins nicht von selbst, der Ressourcenname muss nachgereicht werden.
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
    // Notnagel, damit die Auswahl nicht unbeschriftet dasteht
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
 * Setzt die Sichtbarkeit passend zum Dialogmodus und folgt späteren Wechseln.
 * Nötig, weil citationDialog.js die [data-dialog-type]-Elemente nur beim Moduswechsel
 * durchgeht, unsere Zeilen aber erst danach eingehängt werden.
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
