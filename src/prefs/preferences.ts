/**
 * Script for the shared preferences pane. Zotero loads it via the pane's scripts
 * entry into a sandboxed scope of the window (preferences.js:313-320) — therefore only
 * Zotero.*, window, and document are available, without plugin globals like ztoolkit or addon.
 * Origin: pre-merge:src/preferences.js.
 */
import { buildLocatorOptions } from "../core/labelPopup.ts";

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

/**
 * Without the addAnnotation command (Zotero 7 and 8, integration.js lacking Interface.prototype.addAnnotation)
 * the persistent dialog is unavailable: hide the preference option. If Zotero.Integration is not accessible,
 * keep it visible.
 */
function hidePersistentWhenUnsupported(): void {
  const integration = (Zotero as any).Integration;
  if (!integration || integration.Interface?.prototype?.addAnnotation) return;
  const box = document.getElementById(
    "flexannotate-pref-persistent-citation-dialog",
  );
  if (!box) return;
  (box as HTMLElement).hidden = true;
  // Also hide the explanatory description directly underneath
  const note = box.nextElementSibling as HTMLElement | null;
  if (note) note.hidden = true;
}

// Every pane dispatches its `load` event, including third-party ones; our fields are only
// present in the document when our pane loads. The event does not bubble, so we listen in the
// capturing phase on document. Runs are sequenced through a queue to avoid races.
let queue: Promise<void> = Promise.resolve();
document.addEventListener(
  "load",
  () => {
    hidePersistentWhenUnsupported();
    queue = queue
      .then(fillLocatorMenus)
      .catch((e: unknown) => Zotero.logError(e as Error));
  },
  true,
);
