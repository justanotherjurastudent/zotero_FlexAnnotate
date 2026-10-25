/**
 * "arrange like in the plugin" for the citation dialog that Zotero opens from
 * Word (and LibreOffice / the note editor).
 *
 * Zotero's own views (works / annotations / notes) stay untouched. In the
 * annotations view we add one checkbox; when it is on, the three columns of
 * the dialog show the FlexAnnotate outline instead:
 *   left   the headings with their number of annotations
 *   middle the annotations of the chosen heading (green check = already cited)
 *   right  the quote, comment and source of the clicked annotation
 * Inserting goes through Zotero's own "+" handler: for each annotation to add
 * we create a hidden native <annotation-row> inside #annotations-list and click
 * its plus icon, so Zotero's citation logic stays untouched.
 *
 * Anchors (Zotero 10.0.5, see docs/anchors.md):
 *  - citationDialog.xhtml:83-107  columns (#collections-tree-container,
 *    #item-tree-container, #sidebar) and the native annotation list
 *  - citationDialog.js:812-818    "+" click handled by bubbling on #annotations-list
 *  - citationDialog.js:155-185    accept() ends in io.accept(), which we wrap
 *  - integration.js:1564, 2701    session.citationsByItemID and the document's
 *    session id are loaded by Zotero anyway
 *
 * Injected by shared/citationDialog.ts; the rendering is in dialogOutlineRender.ts.
 */

import {
  buildDialogSections,
  buildWorkDialogSections,
  nodeCounts,
} from "../logic/dialogView";
import { applyClick, emptySelection } from "../logic/selection";
import type { DialogInjector } from "../../../shared/citationDialog";
import { locate, type OutlineNode } from "../logic/outline";
import { topmostCollection } from "../logic/collections";
import { OutlineModel } from "../outlineModel";
import {
  collectionKeyOf,
  collectionChoices,
  listCollections,
  loadAnnotationRows,
  loadScopeWorkIDs,
  loadWorkRows,
  readShowCommentsInRows,
  readShowWorks,
} from "../panel/organizerData";
import { citedWorksOf, getActiveCitedIDs, hookAccept } from "./dialogCited";
import {
  activatePersistentOnOpenDialog,
  persistentSupported,
  readPersistentPref,
  relaxDialogMinWidth,
  writePersistentPref,
} from "./dialogPersistent";
import {
  LIST_ID,
  PREVIEW_ID,
  TREE_ID,
  insert,
  refreshCitedInView,
  renderAll,
  renderList,
  renderPreview,
  visibleSections,
} from "./dialogOutlineRender";
import type { View } from "./dialogOutlineRender";
import { applyLayout, removeLayout } from "./dialogOutlineLayout";
import { tr } from "../strings";

const PREF = "dialogOutlineView";
const ROW_ID = "flexannotate-toggle-row";
const MENU_ID = "flexannotate-menu-items";
/** Schalter so gross wie Zoteros eigene Checkboxen im Einstellungsmenue (includeComments, 14 CSS-px). */
const SWITCH_CSS = "width:16px;height:16px;margin:2px 4px;flex:none;";
const PICKER_ID = "flexannotate-dialog-scope-picker";
const HINT_ID = "flexannotate-dialog-no-tree";

interface Attached {
  observer: MutationObserver | null;
  enabled: boolean;
  view: View | null;
  keyHandler: ((e: Event) => void) | null;
  searchHandler: ((e: Event) => void) | null;
  focusHandler: (() => void) | null;
  /** Schmal: die Schalter stehen im Einstellungsmenue statt in der Zeile. */
  narrow: boolean;
  mq: MediaQueryList | null;
  onMq: (() => void) | null;
  settings: Element | null;
  onPopup: (() => void) | null;
  lastDialogType?: string;
  /** enable() läuft noch (await): ein Moduswechsel dazwischen darf es nicht ein zweites Mal starten. */
  enabling?: boolean;
}

const attached = new Map<Window, Attached>();

function prefKey(name: string): string {
  return `${addon.data.config.prefsPrefix}.${name}`;
}

function readPref(): boolean {
  try {
    return Zotero.Prefs.get(prefKey(PREF), true) === true;
  } catch {
    return false;
  }
}

/**
 * Zitierdialog: Sammlung, aus der die Gliederung kommt (0 = gesamte
 * Bibliothek). Letzte Wahl wird als Pref gemerkt, damit das nächste Zitieren
 * dort weitermacht.
 */
const PREF_COLLECTION = "dialogOutlineCollection";

function readCollectionID(): number {
  try {
    const v = Zotero.Prefs.get(prefKey(PREF_COLLECTION), true);
    // gelöschte Sammlung → zurück auf "Gesamte Bibliothek"
    return typeof v === "number" && v && collectionKeyOf(v) ? v : 0;
  } catch {
    return 0;
  }
}

function writeCollectionID(id: number) {
  try {
    Zotero.Prefs.set(prefKey(PREF_COLLECTION), id, true);
  } catch (e) {
    ztoolkit.log("flexannotate dialog collection pref write failed:", e);
  }
}

function writePref(v: boolean) {
  try {
    Zotero.Prefs.set(prefKey(PREF), v, true);
  } catch (e) {
    ztoolkit.log("flexannotate dialog pref write failed:", e);
  }
}

function inject(win: Window) {
  const doc = win.document;
  const sidebar = doc.getElementById("annotations-sidebar");
  if (!sidebar || doc.getElementById(ROW_ID)) return;
  const info: Attached = {
    observer: null,
    enabled: false,
    view: null,
    keyHandler: null,
    searchHandler: null,
    focusHandler: null,
    narrow: false,
    mq: null,
    onMq: null,
    settings: null,
    onPopup: null,
  };
  attached.set(win, info);

  hookAccept(win);
  const supported = persistentSupported(win);
  if (supported && readPersistentPref()) relaxDialogMinWidth(win);

  const row = doc.createElement("div");
  row.id = ROW_ID;
  row.style.cssText =
    "display:flex;gap:6px;align-items:center;padding:6px 8px;flex:none;";
  const cb = doc.createElement("input");
  cb.type = "checkbox";
  cb.id = "flexannotate-toggle";
  cb.style.cssText = SWITCH_CSS;
  const label = doc.createElement("label");
  label.htmlFor = "flexannotate-toggle";
  label.textContent = tr("dialogOutline");
  const pcb = doc.createElement("input");
  pcb.type = "checkbox";
  pcb.id = "flexannotate-persistent-toggle";
  pcb.style.cssText = SWITCH_CSS;
  pcb.checked = readPersistentPref();
  const plabel = doc.createElement("label");
  plabel.htmlFor = pcb.id;
  plabel.textContent = tr("dialogPersistent");
  plabel.title = tr("dialogPersistentHint");
  // ohne Befehl addAnnotation (Zotero 7 und 8) oder auf nicht unterstützten Plattformen (z. B. Google Docs/http): Schalter aus
  pcb.hidden = plabel.hidden = !supported;
  pcb.addEventListener("change", () => {
    writePersistentPref(pcb.checked);
    // Wird die Checkbox nachträglich (auf einem bereits geöffneten, nativen Dialog)
    // aktiviert, installiere den Wiederöffnen-Wrapper auf dem laufenden Fenster, damit
    // es nach dem nächsten Einfügen direkt als Blätterfenster wieder aufgeht.
    if (pcb.checked) activatePersistentOnOpenDialog();
  });
  sidebar.insertBefore(row, sidebar.firstChild);

  // Schmal (matchMedia wie die Layout-Regel): die Schalter wandern in das Einstellungsmenue
  // (Zahnrad unten rechts, #settings-popup). Dieselben Elemente und Listener, nur verschoben.
  const settings = doc.getElementById("settings-popup");
  const popupBox = settings?.querySelector(".popup") ?? null;
  const menu = doc.createElement("div");
  menu.id = MENU_ID;
  menu.setAttribute("data-dialog-type", "citation,annotations");
  const wrapA = doc.createElement("div");
  wrapA.className = "hbox";
  const wrapB = doc.createElement("div");
  wrapB.className = "hbox";
  wrapB.hidden = !supported;
  menu.append(wrapA, wrapB);

  const root = doc.documentElement as Element;
  // Eine Quelle der Wahrheit: Zeile bzw. Menue, Sichtbarkeit je Dialogtyp
  const refresh = () => {
    const type =
      root.getAttribute("dialog-type") || (win as any).DIALOG_STATE?.type;
    const isAnn = type === "annotations";
    const isSupported = isAnn || type === "citation";

    row.hidden = !isAnn || info.narrow;
    menu.hidden = false;

    // Menue-Button (#settings-button) sichtbar halten, wenn unser Menue im Popup liegt
    const settingsBtn = doc.getElementById(
      "settings-button",
    ) as HTMLElement | null;
    if (settingsBtn && popupBox?.contains(menu)) {
      settingsBtn.hidden = false;
    }

    if (isSupported) {
      if (readPref()) {
        cb.checked = true;
        if (!info.enabled) {
          if (!info.enabling) void enable(win, cb);
        } else if (info.lastDialogType !== type) {
          void rebuildView(win, info);
        }
      } else {
        cb.checked = false;
        if (info.enabled) {
          void disable(win, cb);
        }
      }
    } else if (info.enabled) {
      void disable(win, cb);
    }
    info.lastDialogType = type;
  };
  const place = (narrow: boolean) => {
    info.narrow = narrow && !!popupBox;
    const type =
      root.getAttribute("dialog-type") || (win as any).DIALOG_STATE?.type;
    const isAnn = type === "annotations";
    const inPopup = !isAnn || info.narrow;
    if (inPopup && popupBox) {
      wrapA.append(cb, label);
      wrapB.append(pcb, plabel);
      if (!menu.parentElement) popupBox.appendChild(menu);
      row.hidden = true;
      menu.hidden = false;
    } else {
      row.append(cb, label, pcb, plabel);
      menu.remove();
      row.hidden = !isAnn;
    }
    refresh();
  };
  const observer = new win.MutationObserver(() => {
    place(info.mq?.matches ?? false);
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["dialog-type"],
  });
  info.observer = observer;

  const mq = win.matchMedia("(max-width: 750px)") as MediaQueryList;
  info.mq = mq;
  info.onMq = () => place(mq.matches);
  mq.addEventListener("change", info.onMq);
  place(mq.matches);

  // Beim Oeffnen den Stand der Schalter zeigen (ein Weg zum Umschalten: die Schalter selbst)
  info.settings = settings;
  info.onPopup = () => {
    cb.checked = readPref();
    pcb.checked = readPersistentPref();
  };
  settings?.addEventListener("popupshowing", info.onPopup);

  cb.addEventListener("change", () => {
    writePref(cb.checked);
    if (cb.checked) void enable(win, cb);
    else void disable(win, cb);
  });
}

function detach(win: Window) {
  const info = attached.get(win);
  try {
    info?.observer?.disconnect();
    if (info?.mq && info.onMq) info.mq.removeEventListener("change", info.onMq);
    if (info?.settings && info.onPopup)
      info.settings.removeEventListener("popupshowing", info.onPopup);
    const doc = win.document;
    if (info?.enabled) restoreLayout(win);
    doc.getElementById(MENU_ID)?.remove();
    doc.getElementById(ROW_ID)?.remove();
    doc.getElementById(PICKER_ID)?.remove();
    doc.getElementById(HINT_ID)?.remove();
  } catch (e) {
    ztoolkit.log("flexannotate dialog detach failed:", e);
  }
  attached.delete(win);
}

async function enable(win: Window, cb: HTMLInputElement) {
  const info = attached.get(win);
  if (!info || info.enabling) return;
  info.enabling = true;
  try {
    const w = win as any;
    if (w.currentLayout?.type === "list" && w.IOManager?.toggleDialogMode) {
      await w.IOManager.toggleDialogMode("library");
    }
    const view = await buildView(win, info);
    info.view = view;
    info.enabled = true;
    applyLayout(win);
    renderAll(win, view);
    addKeys(win, info);
    addSearchSync(win, info);
    addFocusSync(win, info);
    addPicker(win, info);
    updateHint(win, view);
    cb.checked = true;
  } catch (e) {
    ztoolkit.log("flexannotate dialog enable failed:", e);
    info.enabled = false;
    restoreLayout(win);
  } finally {
    info.enabling = false;
  }
}

/**
 * Kategorienbaum der gewählten Sammlung (Untersammlung → Baum der
 * Hauptsammlung, via topmostCollection); 0/null = Bibliotheksbaum.
 */
async function loadRoots(
  libraryID: number,
  collectionID: number,
): Promise<OutlineNode[]> {
  if (!collectionID) {
    return (await OutlineModel.load(libraryID)).roots;
  }
  const top = topmostCollection(listCollections(libraryID), collectionID);
  const key = top ? collectionKeyOf(top.id) : null;
  return (await OutlineModel.load(libraryID, key)).roots;
}

/**
 * Sammlungs-Auswahl über dem Kategorienbaum: macht klar, aus welcher
 * Sammlung die Kategorien kommen. Ein plain <select> öffnet in diesem
 * Dialogfenster kein Popup, deshalb das Custom-Drop-down wie im
 * Organizer-Fenster (organizerTabs).
 */
function addPicker(win: Window, info: Attached) {
  const doc = win.document;
  const host = doc.getElementById("collections-tree-container");
  if (!host || doc.getElementById(PICKER_ID)) return;
  const libraryID = Zotero.Libraries.userLibraryID;
  const wrap = doc.createElement("div");
  wrap.id = PICKER_ID;
  wrap.style.cssText =
    "flex:none;display:flex;gap:6px;align-items:center;box-sizing:border-box;height:34px;padding:0 8px;border-bottom:1px solid var(--fill-quinary, rgba(128,128,128,0.25));";
  const label = doc.createElement("span");
  label.style.cssText = "font-size:12px;color:var(--fill-secondary,#777);";
  label.textContent = tr("scope");
  const choices = [
    { id: 0, name: tr("scopeAll"), depth: 0 },
    ...collectionChoices(libraryID),
  ];
  const current = readCollectionID();
  const still = choices.find((c) => c.id === current) ?? choices[0];
  const relPos = doc.createElement("div");
  relPos.style.cssText = "position:relative;flex:1;min-width:0;";
  const sel = doc.createElement("button");
  sel.id = "flexannotate-dialog-scope";
  sel.style.cssText =
    "appearance:none;-moz-appearance:none;cursor:pointer;width:100%;max-width:100%;overflow:hidden;" +
    "text-overflow:ellipsis;white-space:nowrap;text-align:start;box-sizing:border-box;height:24px;padding:0 8px;font-size:12px;";
  sel.textContent = `${still.name}  ▾`;
  const menu = doc.createElement("div");
  menu.style.cssText =
    // fixed statt absolute: der Container des Dialogs schneidet (overflow:hidden)
    "position:fixed;z-index:1000;display:none;min-width:220px;max-height:300px;overflow-y:auto;" +
    "background:var(--material-background,#fff);border:1px solid var(--fill-quinary, rgba(128,128,128,0.35));border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.25);";
  const options: HTMLElement[] = [];
  // Aktive Auswahl im Dropdown sichtbar machen und den Button-Text nachziehen,
  // wenn die Sammlung geändert wird.
  const select = (c: { id: number; name: string }) => {
    sel.textContent = `${c.name}  ▾`;
    for (const o of options) {
      const active = o.getAttribute("data-id") === String(c.id);
      o.style.fontWeight = active ? "600" : "";
    }
  };
  for (const c of choices) {
    const o = doc.createElement("div");
    o.dataset.id = String(c.id);
    o.style.cssText =
      `padding:5px 10px 5px ${10 + c.depth * 14}px;cursor:pointer;white-space:nowrap;` +
      (c.id === current ? "font-weight:600;" : "");
    o.textContent = c.name;
    o.addEventListener("mouseenter", () => {
      o.style.background = "var(--material-states, rgba(128,128,128,0.12))";
    });
    o.addEventListener("mouseleave", () => {
      o.style.background = "transparent";
    });
    o.addEventListener("click", () => {
      menu.style.display = "none";
      writeCollectionID(c.id);
      select(c);
      void rebuildView(win, info);
    });
    options.push(o);
    menu.appendChild(o);
  }
  sel.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.style.display === "block") {
      menu.style.display = "none";
      return;
    }
    const r = sel.getBoundingClientRect();
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 2}px`;
    menu.style.display = "block";
  });
  doc.addEventListener("click", () => {
    menu.style.display = "none";
  });
  relPos.append(sel, menu);
  wrap.append(label, relPos);
  host.insertBefore(wrap, host.firstChild);
}

/** Ansicht nach Sammlungs-Wechsel neu bauen; Knoten-Auswahl geht auf "all". */
async function rebuildView(win: Window, info: Attached) {
  if (!info.enabled) return;
  try {
    applyLayout(win);
    info.view = await buildView(win, info);
    renderAll(win, info.view);
    updateHint(win, info.view);
  } catch (e) {
    ztoolkit.log("flexannotate dialog rebuild failed:", e);
  }
}

/** Hinweis unter der Auswahl, solange die gewählte Sammlung keinen Baum hat. */
function updateHint(win: Window, view: View) {
  const doc = win.document;
  doc.getElementById(HINT_ID)?.remove();
  const picker = doc.getElementById(PICKER_ID);
  if (!picker || !readCollectionID() || view.roots.length) return;
  const hint = doc.createElement("div");
  hint.id = HINT_ID;
  hint.style.cssText =
    "flex:none;padding:6px 8px;font-size:12px;color:var(--fill-secondary,#777);";
  hint.textContent = tr("dialogNoTree");
  picker.after(hint);
}

/** Baum, Zeilen und Zähler für die gewählte Sammlung; Auswahl steht auf "all". */
async function buildView(win: Window, info: Attached): Promise<View> {
  const doc = win.document;
  const isCitation =
    (doc.documentElement?.getAttribute("dialog-type") ||
      (win as any).DIALOG_STATE?.type) === "citation";
  const libraryID = Zotero.Libraries.userLibraryID;
  const collectionID = readCollectionID();
  const roots = await loadRoots(libraryID, collectionID);
  const scopeWorks = loadScopeWorkIDs(libraryID, {
    collectionID: collectionID || null,
    includeSub: true,
  });
  const inScope = (workID: number) => !scopeWorks || scopeWorks.has(workID);
  const validNode = (n: string | null | undefined): string => {
    if (!n || n === "all" || n === "none") return n ?? "all";
    return locate(roots, n) ? n : "all";
  };
  const selectedNode = validNode(info.view?.node);

  if (isCitation) {
    const allWorks = await loadWorkRows(libraryID);
    const works = allWorks.filter((w) => inScope(w.workID));
    const sections = buildWorkDialogSections(roots, works);
    const citedWorks = await citedWorksOf(win);
    return {
      roots,
      sections,
      counts: nodeCounts(roots, sections),
      rows: new Map(works.map((w) => [w.id, w])),
      showCommentsInRows: false,
      cited: citedWorks ?? new Set<number>(),
      node: selectedNode,
      query: info.view?.query ?? bubbleText(win.document),
      sel: emptySelection(),
    };
  }

  const showWorks = readShowWorks();
  const rows = (await loadAnnotationRows(libraryID)).filter((r) =>
    inScope(r.workID),
  );
  const showCommentsInRows = readShowCommentsInRows();
  const works = showWorks
    ? (await loadWorkRows(libraryID)).filter((w) => inScope(w.workID))
    : [];
  const sections = buildDialogSections(
    roots,
    rows.map((r) => ({ id: r.id, tags: r.tags, workID: r.workID })),
    new Map(works.map((w) => [w.id, w.tags])),
    showWorks,
  );
  const citedWorks = await citedWorksOf(win);
  return {
    roots,
    sections,
    counts: nodeCounts(roots, sections),
    rows: new Map(rows.map((r) => [r.id, r])),
    showCommentsInRows,
    cited: getActiveCitedIDs(rows, citedWorks),
    node: selectedNode,
    query: info.view?.query ?? bubbleText(win.document),
    sel: emptySelection(),
  };
}

async function disable(win: Window, cb: HTMLInputElement) {
  const info = attached.get(win);
  if (!info) return;
  info.enabled = false;
  info.view = null;
  cb.checked = false;
  restoreLayout(win);
  win.document.getElementById(PICKER_ID)?.remove();
  win.document.getElementById(HINT_ID)?.remove();
}

/**
 * Keyboard in the outline view. Enter adds the selected annotations to the
 * citation (and clears the selection, so a second Enter confirms the dialog
 * as usual); the arrow keys move the selection through the list.
 */
function addKeys(win: Window, info: Attached) {
  const doc = win.document;
  if (info.keyHandler) return;
  const handler = (e: Event) => {
    const k = e as KeyboardEvent;
    const v = info.view;
    if (!v || !info.enabled) return;
    const target = k.target as HTMLElement | null;
    if (target?.tagName === "BUTTON") return;
    if (k.key === "Enter" && v.sel.selected.size) {
      k.preventDefault();
      k.stopPropagation();
      const ids = [...v.sel.selected];
      v.sel = emptySelection();
      renderList(win, v);
      renderPreview(win, v);
      void insert(win, ids);
      return;
    }
    const inListArea =
      !target ||
      target === (doc.body as unknown) ||
      target === (doc.documentElement as unknown) ||
      !!target.closest?.(`#${LIST_ID}, #${TREE_ID}, #${PREVIEW_ID}`);
    if ((k.key === "ArrowDown" || k.key === "ArrowUp") && inListArea) {
      const order = [
        ...new Set(
          visibleSections(v).flatMap((sec) => sec.items.map((i) => i.id)),
        ),
      ];
      if (!order.length) return;
      const cur = v.sel.anchor !== null ? order.indexOf(v.sel.anchor) : -1;
      const step = k.key === "ArrowDown" ? 1 : -1;
      const next = order[Math.max(0, Math.min(order.length - 1, cur + step))];
      k.preventDefault();
      k.stopPropagation();
      v.sel = applyClick(v.sel, order, next, { shift: k.shiftKey });
      renderList(win, v);
      renderPreview(win, v);
      doc
        .querySelector<HTMLElement>(`[data-ann-id="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  };
  info.keyHandler = handler;
  doc.addEventListener("keydown", handler, true);
}

/** Text in Zotero's own search bar (bubble-input's current input). */
function bubbleText(doc: Document): string {
  const bubble = doc.getElementById("bubble-input") as any;
  return bubble?.getCurrentInput?.()?.value ?? "";
}

/**
 * Mirror Zotero's search bar into the outline list: bubble-input dispatches
 * "handle-input" (detail.query) on every keystroke, see
 * citationDialog.js:1261 and elements/bubbleInput.js:333. The filter field
 * is only written to, never the other way round.
 */
function addSearchSync(win: Window, info: Attached) {
  if (info.searchHandler) return;
  const handler = (e: Event) => {
    const v = info.view;
    if (!v || !info.enabled) return;
    const query = (e as CustomEvent<{ query?: string }>).detail?.query ?? "";
    if (query === v.query) return;
    v.query = query;
    renderList(win, v, false);
  };
  info.searchHandler = handler;
  win.document.addEventListener("handle-input", handler);
}

/**
 * Aktualisiert Zitatmarkierungen und Fußnotennummern im Hintergrund, sobald
 * das Begleitfenster nach Bearbeitung im Textdokument wieder fokussiert wird.
 * Gedrosselt (mind. 2 s Abstand), um wiederholte IPC-Scans bei schnellem Fensterwechsel zu vermeiden.
 */
function addFocusSync(win: Window, info: Attached) {
  if (info.focusHandler) return;
  let lastSync = 0;
  const handler = () => {
    const v = info.view;
    if (!v || !info.enabled) return;
    const now = Date.now();
    if (now - lastSync < 2000) return;
    lastSync = now;
    void refreshCitedInView(win, v);
  };
  info.focusHandler = handler;
  win.addEventListener("focus", handler);
}

/** Hide Zotero's native columns and add the containers for ours. */
// Der eigentliche Auf-/Abbau des Layouts liegt in dialogOutlineLayout.ts
// (applyLayout/removeLayout); hier bleibt nur das Listener-Aufräumen.

function restoreLayout(win: Window) {
  const doc = win.document;
  const info = attached.get(win);
  if (info?.keyHandler) {
    doc.removeEventListener("keydown", info.keyHandler, true);
    info.keyHandler = null;
  }
  if (info?.searchHandler) {
    doc.removeEventListener("handle-input", info.searchHandler);
    info.searchHandler = null;
  }
  if (info?.focusHandler) {
    win.removeEventListener("focus", info.focusHandler);
    info.focusHandler = null;
  }
  removeLayout(win);
}

/** The current outline view of a dialog window (for tests and debugging). */
function viewOf(win: Window): View | null {
  return attached.get(win)?.view ?? null;
}

export const outlineView: DialogInjector & {
  viewOf(win: Window): View | null;
} = {
  name: "outlineView",
  inject,
  detach,
  viewOf,
};
