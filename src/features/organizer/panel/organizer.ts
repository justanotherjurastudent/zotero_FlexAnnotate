/**
 * organizer — the three-column FlexAnnotate window.
 *
 *   column 1: outline tree with "(Alle)" and "(Ohne Kategorie)"
 *   column 2: one-line rows (annotations or works) with a permanent assign bar
 *   column 3: details of the selected row (editable), citation and categories
 *
 * Two tabs: "Wissen" (annotations) and "Titel" (works). Rows are
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

import { OutlineModel } from "../outlineModel";
import {
  defaultScope,
  loadAnnotationRows,
  readShowCommentsInRows,
  readShowWorks,
} from "./organizerData";
import { emptySelection } from "../logic/selection";
import {
  applyScope,
  Ctx,
  State,
  loadScope,
  refreshOrphans,
} from "./organizerState";
import { onKey } from "./organizerKeys";
import { makeCtx, renderAll } from "./organizerView";
import { getTheme } from "../theme";
import { getString } from "../../../utils/locale";
import { registerPluginMenu } from "../../../utils/menu";
import { tr } from "../strings";

export class OrganizerFactory {
  /** State of the most recently opened window (for tests and debugging). */
  static lastState: State | null = null;

  /**
   * Ctx of each open organizer window (per-window via WeakMap, not on the
   * module object — docs/architecture.md, pitfall 11), so that "open for collection X"
   * can switch the running window.
   */
  private static readonly windowCtx = new WeakMap<Window, Ctx>();

  /** Collection that the next-opened window should load at start. */
  private static pendingCollectionID: number | null | undefined;

  /** Yes/no question to the user; replaceable so tests can answer it. */
  static confirm: (win: unknown, title: string, text: string) => boolean = (
    win,
    title,
    text,
  ) => (Services as any).prompt.confirm(win, title, text);

  static registerMenu() {
    registerPluginMenu({
      menuID: "zotero-tools-flexannotate-organizer",
      target: "main/menubar/tools",
      l10nID: "outline-menu-label",
      icon: `chrome://${addon.data.config.addonRef}/content/icons/organizer.svg`,
      onCommand: () => {
        OrganizerFactory.open().catch((e) =>
          ztoolkit.log("flexannotate organizer open failed:", e),
        );
      },
    });
  }

  /** Currently open Organizer window, if any. */
  private static currentWindow: Window | null = null;

  /**
   * Returns the currently open Organizer window, or null if none is open.
   */
  static getOpenWindow(): Window | null {
    if (
      this.currentWindow &&
      !this.currentWindow.closed &&
      this.currentWindow.document?.getElementById("flexannotate-root")
    ) {
      return this.currentWindow;
    }
    const en = (Services as any).wm.getEnumerator("");
    while (en.hasMoreElements()) {
      const w = en.getNext() as Window;
      if (!w.closed && w.document?.getElementById("flexannotate-root")) {
        this.currentWindow = w;
        return w;
      }
    }
    this.currentWindow = null;
    return null;
  }

  /**
   * Closes the open Organizer window, if any.
   */
  static close(): void {
    const win = this.getOpenWindow();
    if (win) {
      try {
        win.close();
      } catch (e) {
        ztoolkit.log("flexannotate organizer close failed:", e);
      }
      this.currentWindow = null;
    }
  }

  static async open(
    opts: { collectionID?: number | null } = {},
  ): Promise<Window> {
    const existing = this.getOpenWindow();
    if (existing) {
      try {
        const anyWin = existing as any;
        if (
          anyWin.windowState === anyWin.STATE_MINIMIZED ||
          anyWin.windowState === 2
        ) {
          anyWin.restore?.();
        }
      } catch {
        // best-effort un-minimize
      }
      try {
        existing.focus();
      } catch (e) {
        ztoolkit.log("flexannotate organizer focus failed:", e);
      }
      // Window is already running: switch to the desired collection instead of
      // opening a second window.
      if (opts.collectionID !== undefined) {
        const ctx = this.windowCtx.get(existing);
        if (ctx) {
          void loadScope(
            ctx,
            opts.collectionID ?? null,
            this.confirmOpts(existing),
          );
        }
      }
      return existing;
    }
    this.pendingCollectionID = opts.collectionID;

    const dialog = new ztoolkit.Dialog(1, 1).addCell(0, 0, {
      tag: "div",
      id: "flexannotate-root",
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
          const root = doc.getElementById("flexannotate-root") as HTMLElement;
          if (root) void this.mount(doc, root);
        } catch (e) {
          ztoolkit.log("flexannotate organizer build failed:", e);
        }
      },
      unloadCallback: () => {
        if (this.currentWindow === dialog.window) {
          this.currentWindow = null;
        }
      },
    });
    dialog.open(getString("outline-window-title"), {
      width: 1240,
      height: 760,
      resizable: true,
    });
    this.currentWindow = dialog.window;
    return dialog.window;
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
      ztoolkit.log("flexannotate styles init failed:", e);
    }
    const { libraryID, scope } = defaultScope();
    const loaded = await OutlineModel.load(libraryID);
    const state: State = {
      libraryID,
      noteID: loaded.noteID,
      roots: loaded.roots,
      collectionKey: null,
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
      showCommentsInRows: readShowCommentsInRows(),
      renaming: null,
      saveChain: Promise.resolve(),
      saveLog: [],
      endRename: null,
      editing: null,
      focusCol: "list",
      lastTreeClick: null,
      focusSearch: false,
      orphans: [],
      orphanOpen: false,
      otherTrees: null,
    };
    applyScope(state);
    this.lastState = state;
    // The confirm is looked up on each call, so tests can replace it later.
    const ctx = makeCtx(doc, root, state, (w, t, x) =>
      OrganizerFactory.confirm(w, t, x),
    );
    // Wire per window so openForCollection can switch the window.
    const win = doc.defaultView;
    if (win) this.windowCtx.set(win, ctx);
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
    // Start scope: collection from context menu/toolbar, otherwise the one marked
    // in the main window. Same logic as the scope drop-down (tree of the top-level collection).
    const collectionID =
      this.pendingCollectionID !== undefined
        ? this.pendingCollectionID
        : scope.collectionID;
    this.pendingCollectionID = undefined;
    if (collectionID !== null) {
      await loadScope(ctx, collectionID, this.confirmOpts(win));
    } else void refreshOrphans(ctx);
  }

  /** Opens the organizer for a collection (context menu in the Zotero window). */
  static openForCollection(collectionID: number): void {
    void this.open({ collectionID }).catch((e) =>
      ztoolkit.log("flexannotate organizer openForCollection failed:", e),
    );
  }

  /** Confirm wiring for loadScope per window (tests replace the composite). */
  private static confirmOpts(win: Window | null): {
    confirm: (title: string, text: string) => boolean;
  } {
    return {
      confirm: (title, text) => OrganizerFactory.confirm(win, title, text),
    };
  }
}
