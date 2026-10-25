/**
 * Script for the shared preferences pane. Zotero loads it via the pane's scripts
 * entry into a sandboxed scope of the window (preferences.js:313-320) — therefore only
 * Zotero.*, window, and document are available, without plugin globals like ztoolkit or addon.
 * Origin: pre-merge:src/preferences.js.
 */
import { buildLocatorOptions } from "../core/labelPopup.ts";
import { isFeatureEnabled } from "../features/gates.ts";

// Sandbox typings lack `document`; at runtime it resolves to window.document.
declare const document: Document;

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

function hideControlWithDescription(id: string): void {
  const el = document.getElementById(id) as HTMLElement | null;
  if (!el) return;
  const row = (el.closest("hbox") as HTMLElement | null) ?? el;
  row.hidden = true;
  const note = row.nextElementSibling as HTMLElement | null;
  if (note?.classList.contains("indented-pref")) note.hidden = true;
}

/**
 * Hides preference controls (and empty groupboxes) for features that are
 * disabled via `gates.ts` or unsupported by the running Zotero version (e.g.
 * persistent citation dialog on Zotero 7 and 8 without `addAnnotation`).
 */
function hideUnsupportedOrDisabledFeatures(): void {
  const integration = (Zotero as any).Integration;
  const persistentSupported =
    isFeatureEnabled("persistentDialogPatch") &&
    Boolean(!integration || integration.Interface?.prototype?.addAnnotation);
  const citeOnlyOn = isFeatureEnabled("citeOnlyPatch");

  if (!citeOnlyOn) {
    hideControlWithDescription("flexannotate-pref-citation-only");
  }
  if (!persistentSupported) {
    hideControlWithDescription("flexannotate-pref-persistent-citation-dialog");
  }
  if (!citeOnlyOn && !persistentSupported) {
    const group = document
      .getElementById("flexannotate-pref-citation-only")
      ?.closest("groupbox") as HTMLElement | null;
    if (group) group.hidden = true;
  }

  if (!isFeatureEnabled("printMenus")) {
    const group = document
      .getElementById("flexannotate-pref-keep-placeholders")
      ?.closest("groupbox") as HTMLElement | null;
    if (group) group.hidden = true;
  }

  const organizerUiOn =
    isFeatureEnabled("organizer") || isFeatureEnabled("outlineView");
  const tagSuggestOn = isFeatureEnabled("tagSuggest");
  if (!organizerUiOn) {
    hideControlWithDescription("zotero-prefpane-flexannotate-showworks");
    hideControlWithDescription("zotero-prefpane-flexannotate-show-comments");
  }
  if (!tagSuggestOn) {
    hideControlWithDescription("flexannotate-pref-tag-suggest");
  }
  if (!organizerUiOn && !tagSuggestOn) {
    const group = document
      .getElementById("flexannotate-pref-tag-suggest")
      ?.closest("groupbox") as HTMLElement | null;
    if (group) group.hidden = true;
  }

  const citaviQuotesOn = isFeatureEnabled("citaviPrintQuotes");
  const citaviLinksOn = isFeatureEnabled("citaviLinks");
  if (!citaviQuotesOn) {
    hideControlWithDescription("flexannotate-pref-citavi-import");
    hideControlWithDescription("flexannotate-pref-citavi-keep-notes");
    const grid = document
      .getElementById("flexannotate-pref-citavi-locator-page")
      ?.closest("div") as HTMLElement | null;
    if (grid) {
      const heading = grid.previousElementSibling as HTMLElement | null;
      const desc = grid.nextElementSibling as HTMLElement | null;
      if (heading) heading.hidden = true;
      grid.hidden = true;
      if (desc) desc.hidden = true;
    }
  }
  if (!citaviLinksOn) {
    hideControlWithDescription("flexannotate-pref-citavi-link-contributions");
  }
  if (
    !isFeatureEnabled("citaviImport") ||
    (!citaviQuotesOn && !citaviLinksOn)
  ) {
    const group = document
      .getElementById("flexannotate-pref-citavi-import")
      ?.closest("groupbox") as HTMLElement | null;
    if (group) group.hidden = true;
  }
}

// Every pane dispatches its `load` event, including third-party ones; our fields are only
// present in the document when our pane loads. The event does not bubble, so we listen in the
// capturing phase on document. Runs are sequenced through a queue to avoid races.
let queue: Promise<void> = Promise.resolve();
document.addEventListener(
  "load",
  () => {
    hideUnsupportedOrDisabledFeatures();
    queue = queue
      .then(fillLocatorMenus)
      .catch((e: unknown) => Zotero.logError(e as Error));
  },
  true,
);
