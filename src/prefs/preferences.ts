/**
 * Script for the shared preferences pane. Zotero loads it via the pane's scripts
 * entry into a sandboxed scope of the window (preferences.js:313-320) — therefore only
 * Zotero.*, window, and document are available, without plugin globals like ztoolkit or addon.
 * Origin: pre-merge:src/preferences.js.
 *
 * The pane has two tabs: "Options" (the settings, markup in preferences.xhtml) and
 * "Features" (one checkbox per gate, built here from `gates.ts`).
 */
import { config } from "../../package.json";
import { buildLocatorOptions } from "../core/labelPopup.ts";
import {
  GATE_PREF_PREFIX,
  RESTART_GATES,
  gates,
  isFeatureEnabled,
  type GateName,
} from "../features/gates.ts";
import { FEATURE_GROUPS, gateMessageId } from "./featureGroups.ts";

// Sandbox typings lack `document`; at runtime it resolves to window.document.
declare const document: Document;

/** The build prefixes every Fluent message id with the add-on ref (see the built .ftl files). */
const L10N_PREFIX = `${config.addonRef}-`;

// One select field per Citavi page type; the inner <menupopup> is populated here
const LOCATOR_MENULISTS = [
  "flexannotate-pref-citavi-locator-page",
  "flexannotate-pref-citavi-locator-column",
  "flexannotate-pref-citavi-locator-paragraph",
  "flexannotate-pref-citavi-locator-margin",
  "flexannotate-pref-citavi-locator-other",
];

/**
 * Populates any empty select menus. getLocatorString() reads
 * Zotero.Styles.locales, which only exists after Styles.init(); init() returns an
 * in-progress initialization as a Promise and can be called repeatedly.
 * We set the selection manually: Zotero's MutationObserver only attaches if the
 * binding is established upon insertion, and setting `.value` does not fire a command event,
 * avoiding accidental preference rewrites.
 */
async function fillLocatorMenus(): Promise<void> {
  const open = LOCATOR_MENULISTS.map((id) =>
    document.getElementById(id)?.querySelector("menupopup"),
  ).filter((popup) => popup && !popup.childElementCount);
  if (!open.length) return;

  await Zotero.Styles.init();
  const options = buildLocatorOptions(Zotero.Cite.labels, (locator) =>
    Zotero.Cite.getLocatorString(locator),
  );

  for (const popup of open) {
    // A concurrent run may have completed while awaiting Styles.init()
    if (!popup || popup.childElementCount) continue;
    for (const { value, label } of options) {
      const item = document.createXULElement("menuitem");
      item.setAttribute("value", value);
      item.setAttribute("label", label);
      popup.appendChild(item);
    }
    const menulist = popup.closest("menulist") as XULMenuListElement | null;
    const pref = menulist?.getAttribute("preference");
    if (menulist && pref) {
      // An unset preference returns undefined instead of throwing
      menulist.value = (Zotero.Prefs.get(pref, true) as string) || "page";
    }
  }
}

/** Shows or hides a control together with the description that follows it. */
function setControlHidden(id: string, hidden: boolean): void {
  const el = document.getElementById(id) as HTMLElement | null;
  if (!el) return;
  const row = (el.closest("hbox") as HTMLElement | null) ?? el;
  row.hidden = hidden;
  const note = row.nextElementSibling as HTMLElement | null;
  if (note?.classList.contains("indented-pref")) note.hidden = hidden;
}

/** Shows or hides the group box that contains the given control. */
function setGroupHidden(id: string, hidden: boolean): void {
  const group = document
    .getElementById(id)
    ?.closest("groupbox") as HTMLElement | null;
  if (group) group.hidden = hidden;
}

/**
 * Shows only the controls of the "Options" tab whose feature is switched on
 * (see `gates.ts` and the "Features" tab) and supported by the running Zotero
 * version (e.g. the persistent citation dialog needs `addAnnotation`, missing in
 * Zotero 7 and 8). Idempotent: runs on load and after every change of a gate.
 */
function applyFeatureVisibility(): void {
  const integration = (Zotero as any).Integration;
  const persistentSupported =
    isFeatureEnabled("persistentDialogPatch") &&
    Boolean(!integration || integration.Interface?.prototype?.addAnnotation);
  const citeOnlyOn = isFeatureEnabled("citeOnlyPatch");

  setControlHidden("flexannotate-pref-citation-only", !citeOnlyOn);
  setControlHidden(
    "flexannotate-pref-persistent-citation-dialog",
    !persistentSupported,
  );
  setGroupHidden(
    "flexannotate-pref-citation-only",
    !citeOnlyOn && !persistentSupported,
  );

  setGroupHidden(
    "flexannotate-pref-keep-placeholders",
    !isFeatureEnabled("printMenus"),
  );

  const organizerUiOn =
    isFeatureEnabled("organizer") || isFeatureEnabled("outlineView");
  const tagSuggestOn = isFeatureEnabled("tagSuggest");
  setControlHidden("zotero-prefpane-flexannotate-showworks", !organizerUiOn);
  setControlHidden(
    "zotero-prefpane-flexannotate-show-comments",
    !organizerUiOn,
  );
  setControlHidden("flexannotate-pref-tag-suggest", !tagSuggestOn);
  setGroupHidden(
    "flexannotate-pref-tag-suggest",
    !organizerUiOn && !tagSuggestOn,
  );

  const citaviQuotesOn = isFeatureEnabled("citaviPrintQuotes");
  const citaviLinksOn = isFeatureEnabled("citaviLinks");
  setControlHidden("flexannotate-pref-citavi-import", !citaviQuotesOn);
  setControlHidden("flexannotate-pref-citavi-keep-notes", !citaviQuotesOn);
  const grid = document
    .getElementById("flexannotate-pref-citavi-locator-page")
    ?.closest("div") as HTMLElement | null;
  if (grid) {
    const heading = grid.previousElementSibling as HTMLElement | null;
    const desc = grid.nextElementSibling as HTMLElement | null;
    if (heading) heading.hidden = !citaviQuotesOn;
    grid.hidden = !citaviQuotesOn;
    if (desc) desc.hidden = !citaviQuotesOn;
  }
  setControlHidden(
    "flexannotate-pref-citavi-link-contributions",
    !citaviLinksOn,
  );
  setGroupHidden(
    "flexannotate-pref-citavi-import",
    !isFeatureEnabled("citaviImport") || (!citaviQuotesOn && !citaviLinksOn),
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

type TabId = "options" | "features";
const TABS: readonly TabId[] = ["options", "features"];

function styleTab(tab: HTMLElement, selected: boolean): void {
  tab.style.cssText =
    "padding: 6px 14px; margin: 0; border: 0; background: transparent; " +
    "color: inherit; font: inherit; cursor: pointer; " +
    `border-bottom: 2px solid ${selected ? "AccentColor" : "transparent"}; ` +
    `font-weight: ${selected ? "600" : "400"};`;
}

function selectTab(selected: TabId, focus = false): void {
  for (const id of TABS) {
    const on = id === selected;
    const tab = document.getElementById(
      `flexannotate-tab-${id}`,
    ) as HTMLElement | null;
    const panel = document.getElementById(
      `flexannotate-panel-${id}`,
    ) as HTMLElement | null;
    if (!tab || !panel) continue;
    tab.setAttribute("aria-selected", String(on));
    tab.tabIndex = on ? 0 : -1;
    styleTab(tab, on);
    panel.hidden = !on;
    if (on && focus) tab.focus();
  }
}

/** Wires the tab buttons once (click and left/right arrow keys). */
function setupTabs(): void {
  const bar = document.getElementById(
    "flexannotate-tabs",
  ) as HTMLElement | null;
  if (!bar || bar.dataset.wired) return;
  bar.dataset.wired = "true";
  for (const id of TABS) {
    document
      .getElementById(`flexannotate-tab-${id}`)
      ?.addEventListener("click", () => selectTab(id));
  }
  bar.addEventListener("keydown", (e) => {
    const event = e as KeyboardEvent;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const current = TABS.find(
      (id) =>
        document
          .getElementById(`flexannotate-tab-${id}`)
          ?.getAttribute("aria-selected") === "true",
    );
    if (!current) return;
    event.preventDefault();
    selectTab(current === "options" ? "features" : "options", true);
  });
  selectTab("options");
}

// ── Features tab ─────────────────────────────────────────────────────────────

const featureBoxId = (name: GateName) => `flexannotate-feature-${name}`;
const featureNoteId = (name: GateName) => `flexannotate-feature-note-${name}`;

function l10nId(suffix: string): string {
  return L10N_PREFIX + suffix;
}

/** Translated label of a gate (the `.label` attribute of its Fluent message). */
async function labelOf(name: GateName): Promise<string> {
  try {
    const l10n = (document as any).l10n;
    const [msg] = await l10n.formatMessages([
      { id: l10nId(gateMessageId(name)) },
    ]);
    const label = msg?.attributes?.find((a: any) => a.name === "label");
    return label?.value ?? name;
  } catch {
    return name;
  }
}

/** Builds the group boxes and checkboxes of the "Features" tab once. */
function buildFeatureRows(): void {
  const host = document.getElementById("flexannotate-features");
  if (!host || host.childElementCount) return;

  for (const group of FEATURE_GROUPS) {
    const box = document.createXULElement("groupbox");
    const heading = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "h2",
    );
    heading.setAttribute(
      "data-l10n-id",
      l10nId(`prefs-features-group-${group.id}`),
    );
    box.appendChild(heading);

    group.gates.forEach((name, index) => {
      // The first gate is the group's main switch (bold); the others sit indented below it.
      const row = document.createXULElement("vbox") as HTMLElement;
      if (index > 0) row.style.marginInlineStart = "24px";
      const checkbox = document.createXULElement("checkbox");
      if (index === 0) (checkbox as HTMLElement).style.fontWeight = "600";
      checkbox.id = featureBoxId(name);
      checkbox.setAttribute("data-l10n-id", l10nId(gateMessageId(name)));
      checkbox.addEventListener("command", () => {
        const key = GATE_PREF_PREFIX + name;
        // Back to the default (on) by clearing, so only real switch-offs stay stored.
        if ((checkbox as unknown as XULCheckboxElement).checked) {
          Zotero.Prefs.clear(key, true);
        } else {
          Zotero.Prefs.set(key, false, true);
        }
        void refreshFeatureRows();
      });
      row.appendChild(checkbox);

      const description = document.createXULElement("description");
      description.className = "indented-pref";
      description.setAttribute(
        "data-l10n-id",
        l10nId(`${gateMessageId(name)}-description`),
      );
      row.appendChild(description);

      const note = document.createXULElement("description") as HTMLElement;
      note.id = featureNoteId(name);
      note.className = "indented-pref";
      note.style.cssText = "color: GrayText; font-size: 0.9em;";
      note.hidden = true;
      row.appendChild(note);
      box.appendChild(row);
    });
    host.appendChild(box);
  }
  (document as any).l10n?.translateFragment(host);
}

/**
 * Brings every checkbox in line with the stored switches: checked = on, greyed
 * out while a required feature is off, with a note why (or that a restart is needed).
 */
function refreshFeatureRows(): Promise<void> {
  syncFeatureRows();
  return refreshFeatureNotes();
}

/**
 * Sets checked/greyed-out of every checkbox from the stored switches. Synchronous
 * on purpose: the boxes must be right the moment the tab is shown, not after
 * something asynchronous (such as Zotero.Styles.init for the Options tab) is done.
 */
function syncFeatureRows(): void {
  for (const gate of gates) {
    const checkbox = document.getElementById(
      featureBoxId(gate.name),
    ) as unknown as XULCheckboxElement | null;
    if (!checkbox) continue;
    const stored = Zotero.Prefs.get(GATE_PREF_PREFIX + gate.name, true);
    checkbox.checked = gate.enabled && stored !== false;
    const missing = (gate.requires ?? []).filter((r) => !isFeatureEnabled(r));
    checkbox.disabled = !gate.enabled || missing.length > 0;
  }
  applyFeatureVisibility();
}

let noteRun = 0;

/** Fills the note under each row: why it is greyed out, or that it needs a restart. */
async function refreshFeatureNotes(): Promise<void> {
  const run = ++noteRun;
  for (const gate of gates) {
    const note = document.getElementById(
      featureNoteId(gate.name),
    ) as HTMLElement | null;
    if (!note) continue;

    const missing = (gate.requires ?? []).filter((r) => !isFeatureEnabled(r));
    if (missing.length) {
      const names = (await Promise.all(missing.map(labelOf))).join(", ");
      if (run !== noteRun) return; // a newer refresh took over
      note.setAttribute("data-l10n-id", l10nId("prefs-features-needs"));
      note.setAttribute("data-l10n-args", JSON.stringify({ names }));
      note.hidden = false;
    } else if (RESTART_GATES.includes(gate.name)) {
      note.setAttribute("data-l10n-id", l10nId("prefs-features-restart"));
      note.removeAttribute("data-l10n-args");
      note.hidden = false;
    } else {
      note.hidden = true;
    }
  }
}

// Every pane dispatches its `load` event, including third-party ones; our fields are only
// present in the document when our pane loads. The event does not bubble, so we listen in the
// capturing phase on document. Runs are sequenced through a queue to avoid races.
let queue: Promise<void> = Promise.resolve();
document.addEventListener(
  "load",
  () => {
    setupTabs();
    buildFeatureRows();
    syncFeatureRows();
    refreshFeatureNotes().catch((e: unknown) => Zotero.logError(e as Error));
    queue = queue
      .then(fillLocatorMenus)
      .catch((e: unknown) => Zotero.logError(e as Error));
  },
  true,
);
