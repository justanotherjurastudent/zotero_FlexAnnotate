/**
 * Skript des gemeinsamen Einstellungsfensters. Zotero lädt es über den scripts-Eintrag
 * der Pane in einen Sandbox-Scope des Fensters (preferences.js:313-320) — daher nur
 * Zotero.*, window und document, keine Plugin-Globals wie ztoolkit oder addon.
 * Herkunft: pre-merge:src/preferences.js.
 */
import { buildLocatorOptions } from "../core/labelPopup.ts";

// Die Sandbox-Typings kennen kein document; zur Laufzeit ist es das Fenster-Dokument.
declare const document: Document;

// Ein Auswahlfeld je Citavi-Seitentyp; das <menupopup> darin wird hier gefüllt
const LOCATOR_MENULISTS = [
  "flexannotate-pref-citavi-locator-page",
  "flexannotate-pref-citavi-locator-column",
  "flexannotate-pref-citavi-locator-paragraph",
  "flexannotate-pref-citavi-locator-margin",
  "flexannotate-pref-citavi-locator-other",
];

/**
 * Füllt alle noch leeren Auswahlfelder. getLocatorString() liest
 * Zotero.Styles.locales, das erst nach Styles.init() existiert; init() liefert eine
 * laufende Initialisierung als Promise zurück und ist beliebig oft aufrufbar.
 * Die Auswahl setzen wir selbst: Zoteros MutationObserver greift nur, wenn die
 * Bindung beim Einfügen schon steht, und ein gesetzter value löst kein command aus,
 * schreibt also nichts zurück.
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
    // Ein zweiter Durchgang könnte während des Wartens zugeschlagen haben
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
      // Ein ungesetzter Pref liefert undefined statt zu werfen
      menulist.value = (Zotero.Prefs.get(pref, true) as string) || "page";
    }
  }
}

// Jedes Panel meldet sein `load`-Ereignis, auch fremde; unsere Felder stehen erst beim
// eigenen Panel im Dokument. Das Ereignis blubbert nicht, daher Capture-Phase am
// Dokument. Die Durchgänge laufen nacheinander, damit sie sich nicht überholen.
let queue: Promise<void> = Promise.resolve();
document.addEventListener(
  "load",
  () => {
    queue = queue
      .then(fillLocatorMenus)
      .catch((e: unknown) => Zotero.logError(e as Error));
  },
  true,
);
