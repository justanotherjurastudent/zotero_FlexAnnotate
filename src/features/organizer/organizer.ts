/**
 * organizer — the three-column FlexAnnotate window.
 *
 *   column 1: outline tree with "(Alle)" and "(Ohne Kategorie)"
 *   column 2: one-line rows (annotations or works) with a permanent assign bar
 *   column 3: details of the selected row (editable), citation and categories
 *
 * Two tabs like Citavi: "Wissen" (annotations) and "Titel" (works). Rows are
 * filed under a heading by multi-select + assign bar, or by drag and drop onto
 * a tree node. A heading is a Zotero tag; the tree lives in the outline note.
 * The entries can be restricted to a collection (and its subcollections).
 *
 * This file only opens the window and loads its state. The panels live in
 * organizerView (layout), organizerTabs, organizerTree, organizerList,
 * organizerDetails, organizerEdit, organizerKeys, organizerFiling,
 * organizerExport, with the shared State and Ctx in organizerState and the
 * DOM helpers in organizerDom.
 *
 * Derived from Lattice's outlinePanel (birugit, AGPL-3.0-or-later).
 */

import { OutlineModel } from "./outlineModel";
import {
  defaultScope,
  loadAnnotationRows,
  readShowWorks,
} from "./organizerData";
import { emptySelection } from "../../core/selection";
import { applyScope, State } from "./organizerState";
import { onKey } from "./organizerKeys";
import { makeCtx, renderAll } from "./organizerView";
import { getTheme } from "./theme";
import { getString } from "../../utils/locale";
import { registerPluginMenu } from "../../utils/menu";
import { tr } from "./strings";

export class OrganizerFactory {
  /** State of the most recently opened window (for tests and debugging). */
  static lastState: State | null = null;

  /** Yes/no question to the user; replaceable so tests can answer it. */
  static confirm: (win: unknown, title: string, text: string) => boolean = (
    win,
    title,
    text,
  ) => (Services as any).prompt.confirm(win, title, text);

  static registerMenu() {
    registerPluginMenu({
      menuID: "zotero-tools-annotree-organizer",
      target: "main/menubar/tools",
      l10nID: "outline-menu-label",
      icon: `chrome://${addon.data.config.addonRef}/content/icons/organizer.svg`,
      onCommand: () => {
        OrganizerFactory.open().catch((e) =>
          ztoolkit.log("annotree organizer open failed:", e),
        );
      },
    });
  }

  static async open() {
    const dialog = new ztoolkit.Dialog(1, 1).addCell(0, 0, {
      tag: "div",
      id: "annotree-root",
      styles: {
        width: "calc(100vw - 24px)",
        height: "calc(100vh - 64px)",
        display: "flex",
        flexDirection: "column",
        fontSize: "13px",
      },
    });
    dialog.setDialogData({
      loadCallback: () => {
        try {
          const doc = dialog.window.document;
          const root = doc.getElementById("annotree-root") as HTMLElement;
          if (root) void this.mount(doc, root);
        } catch (e) {
          ztoolkit.log("annotree organizer build failed:", e);
        }
      },
    });
    dialog.open(getString("outline-window-title"), {
      width: 1240,
      height: 760,
      resizable: true,
    });
  }

  private static async mount(doc: Document, root: HTMLElement) {
    const t = getTheme(doc);
    (root.style as any).colorScheme = t.colorScheme;
    root.style.background = t.bg;
    root.style.color = t.text;
    root.textContent = tr("loading");
    try {
      await Zotero.Styles.init(); // locator labels need the CSL locales
    } catch (e) {
      ztoolkit.log("annotree styles init failed:", e);
    }
    const { libraryID, scope } = defaultScope();
    const loaded = await OutlineModel.load(libraryID);
    const state: State = {
      libraryID,
      noteID: loaded.noteID,
      roots: loaded.roots,
      tab: "wissen",
      allRows: await loadAnnotationRows(libraryID),
      rows: [],
      scope,
      scopeWorks: null,
      sel: emptySelection(),
      node: "all",
      query: "",
      goto: "",
      sections: false,
      showWorks: readShowWorks(),
      renaming: null,
      saveChain: Promise.resolve(),
      endRename: null,
      editing: null,
      focusCol: "list",
      lastTreeClick: null,
      focusSearch: false,
    };
    applyScope(state);
    this.lastState = state;
    // The confirm is looked up on each call, so tests can replace it later.
    const ctx = makeCtx(doc, root, state, (w, t, x) =>
      OrganizerFactory.confirm(w, t, x),
    );
    // Keyboard and focus tracking live on the document, so they survive the
    // re-renders that rebuild all columns.
    doc.addEventListener("keydown", (e) => onKey(ctx, e as KeyboardEvent));
    doc.addEventListener(
      "mousedown",
      (e: Event) => {
        const target = e.target as HTMLElement | null;
        const c = target?.closest?.("[data-col]");
        const col = c?.getAttribute("data-col");
        if (col === "tree" || col === "list") state.focusCol = col;
        // close open drop-down menus when pressing elsewhere
        doc.querySelectorAll("[data-menu]").forEach((m: Element) => {
          if (!m.parentElement?.contains(target))
            (m as HTMLElement).style.display = "none";
        });
        // A blur alone is not reliable in this window: end an open rename as
        // soon as the mouse is pressed anywhere but in the field.
        if (
          state.renaming &&
          state.endRename &&
          !target?.closest?.("[data-rename]")
        )
          state.endRename();
      },
      true,
    );
    renderAll(ctx);
  }
}
