/**
 * citationDialogPatch — "arrange like in the plugin" for the citation dialog
 * that Zotero opens from Word (and LibreOffice / the note editor).
 *
 * Zotero's own views (works / annotations / notes) stay untouched. In the
 * annotations view we add one checkbox; when it is on, the annotation list is
 * grouped by the Annotree outline (numbered headings in outline order). The
 * rows are Zotero's own <annotation-row> elements inside #annotations-list, so
 * the "+" button, keyboard handling and the filter box keep working natively.
 *
 * Anchors (Zotero 10.0.5, see docs/anchors.md):
 *  - citationDialog.xhtml:76-107  layout ids (#library-trees, #sidebar, ...)
 *  - citationDialog.js:812-826    "+" click handled by bubbling on #annotations-list
 *  - annotationItemsPane.js:33-38 `items` setter; :75-125 render() keeps rows
 *    whose annotation is in `items` and hides rows that fail the filter
 */

import { buildDialogSections } from "../core/dialogView";
import { OutlineModel } from "./outlineModel";
import {
  loadAnnotationRows,
  loadWorkRows,
  readShowWorks,
} from "./organizerData";
import { tr } from "../utils/strings";

const DIALOG_URL = "chrome://zotero/content/integration/citationDialog.xhtml";
const PREF = "dialogOutlineView";
const STYLE_ID = "annotree-dialog-style";
const ROW_ID = "annotree-toggle-row";
const VIEW_ID = "annotree-outline";
const HIDE_IDS = [
  "collections-tree-container",
  "collections-tree-divider",
  "item-tree-container",
];

interface Attached {
  observer: MutationObserver | null;
  enabled: boolean;
}

function prefKey(): string {
  return `${addon.data.config.prefsPrefix}.${PREF}`;
}

function readPref(): boolean {
  try {
    return Zotero.Prefs.get(prefKey(), true) === true;
  } catch {
    return false;
  }
}

function writePref(v: boolean) {
  try {
    Zotero.Prefs.set(prefKey(), v, true);
  } catch (e) {
    ztoolkit.log("annotree dialog pref write failed:", e);
  }
}

export class CitationDialogPatch {
  private static listener: any = null;
  private static attached = new Map<Window, Attached>();

  static start() {
    if (this.listener) return;
    this.listener = {
      onOpenWindow: (xulWin: any) => {
        try {
          const win = xulWin.docShell.domWindow as Window;
          this.watch(win);
        } catch (e) {
          ztoolkit.log("annotree dialog watch failed:", e);
        }
      },
      onCloseWindow: () => {},
    };
    Services.wm.addListener(this.listener);
    const en = Services.wm.getEnumerator("");
    while (en.hasMoreElements()) this.watch(en.getNext() as Window);
  }

  static stop() {
    if (this.listener) Services.wm.removeListener(this.listener);
    this.listener = null;
    for (const win of [...this.attached.keys()]) this.detach(win);
  }

  private static watch(win: Window) {
    const check = () => {
      if (win.location?.href !== DIALOG_URL || this.attached.has(win)) return;
      this.attached.set(win, { observer: null, enabled: false });
      win.addEventListener("unload", () => this.attached.delete(win), {
        once: true,
      });
      this.whenLoaded(win);
    };
    if (win.document?.readyState === "complete") check();
    win.addEventListener("load", check);
  }

  /** Wait until the dialog finished its own initialisation, then inject. */
  private static whenLoaded(win: Window, tries = 0) {
    const state = (win as any).DIALOG_STATE;
    if (state?.loaded) {
      this.inject(win);
      return;
    }
    if (tries > 150) return;
    win.setTimeout(() => this.whenLoaded(win, tries + 1), 200);
  }

  // ── injection ──────────────────────────────────────────────────────────────

  private static inject(win: Window) {
    const doc = win.document;
    const sidebar = doc.getElementById("annotations-sidebar");
    const info = this.attached.get(win);
    if (!sidebar || !info || doc.getElementById(ROW_ID)) return;

    const row = doc.createElement("div");
    row.id = ROW_ID;
    row.style.cssText =
      "display:flex;gap:6px;align-items:center;padding:6px 8px;flex:none;";
    const cb = doc.createElement("input");
    cb.type = "checkbox";
    cb.id = "annotree-toggle";
    const label = doc.createElement("label");
    label.htmlFor = "annotree-toggle";
    label.textContent = tr("dialogOutline");
    row.append(cb, label);
    sidebar.insertBefore(row, sidebar.firstChild);

    const syncVisibility = () => {
      const isAnn =
        (doc.documentElement as Element).getAttribute("dialog-type") ===
        "annotations";
      row.hidden = !isAnn;
      if (!isAnn && info.enabled) void this.disable(win, cb);
    };
    const root = doc.documentElement as Element;
    const observer = new win.MutationObserver(syncVisibility);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["dialog-type"],
    });
    info.observer = observer;
    syncVisibility();

    cb.addEventListener("change", () => {
      writePref(cb.checked);
      if (cb.checked) void this.enable(win, cb);
      else void this.disable(win, cb);
    });
    // The filter input is handled natively; afterwards we hide empty headings.
    doc
      .getElementById("annotations-sidebar-filter")
      ?.addEventListener("input", () => this.hideEmptyHeadings(win));

    if (readPref() && root.getAttribute("dialog-type") === "annotations") {
      cb.checked = true;
      void this.enable(win, cb);
    }
  }

  private static detach(win: Window) {
    const info = this.attached.get(win);
    try {
      info?.observer?.disconnect();
      const doc = win.document;
      if (info?.enabled)
        this.restoreLayout(win, doc.getElementById("annotations-list"));
      doc.getElementById(ROW_ID)?.remove();
      doc.getElementById(STYLE_ID)?.remove();
      doc.getElementById(VIEW_ID)?.remove();
    } catch (e) {
      ztoolkit.log("annotree dialog detach failed:", e);
    }
    this.attached.delete(win);
  }

  // ── outline view ───────────────────────────────────────────────────────────

  private static async enable(win: Window, cb: HTMLInputElement) {
    const doc = win.document;
    const info = this.attached.get(win);
    const list = doc.getElementById("annotations-list") as any;
    if (!info || !list) return;
    try {
      const libraryID = Zotero.Libraries.userLibraryID;
      const { roots } = await OutlineModel.load(libraryID);
      const showWorks = readShowWorks();
      const rows = await loadAnnotationRows(libraryID);
      const works = showWorks ? await loadWorkRows(libraryID) : [];
      const sections = buildDialogSections(
        roots,
        rows.map((r) => ({ id: r.id, tags: r.tags, workID: r.workID })),
        new Map(works.map((w) => [w.id, w.tags])),
        showWorks,
      );

      info.enabled = true;
      this.applyLayout(doc);
      (doc.getElementById("annotations-list-wrapper") as HTMLElement).hidden =
        false;
      (
        doc.getElementById("annotations-sidebar-filter-wrapper") as HTMLElement
      ).hidden = false;
      (doc.getElementById("annotations-message") as HTMLElement).hidden =
        sections.length > 0;
      if (!sections.length) {
        const msg = doc.getElementById("annotations-message-text");
        if (msg) msg.textContent = tr("dialogEmpty");
      }

      const body: HTMLElement | null =
        list._body ?? list.querySelector(".body");
      if (!body) return;
      doc.getElementById(VIEW_ID)?.remove();
      const view = doc.createElement("div");
      view.id = VIEW_ID;
      body.appendChild(view);

      const seen = new Map<number, Zotero.Item>();
      for (const sec of sections) {
        const head = doc.createElement("div");
        head.className = "annotree-heading";
        head.style.cssText =
          `font-weight:600;padding:6px 8px 6px ${8 + sec.depth * 14}px;margin-top:4px;cursor:pointer;` +
          "border-bottom:1px solid var(--fill-quinary, #ddd);";
        head.textContent = `${sec.number}  ${sec.node!.title}`;
        const group = doc.createElement("div");
        group.className = "annotree-group";
        head.addEventListener("click", () => (group.hidden = !group.hidden));
        view.append(head, group);
        for (const ann of sec.items) {
          const item = Zotero.Items.get(ann.id) as Zotero.Item | false;
          if (!item) continue;
          seen.set(item.id, item);
          const el = (doc as any).createXULElement("annotation-row");
          el.annotation = item;
          el.setAttribute("action", "plus");
          group.appendChild(el);
        }
      }
      // Keep the pane's own render() from removing our rows.
      list.items = [...seen.values()];
      cb.checked = true;
    } catch (e) {
      ztoolkit.log("annotree dialog enable failed:", e);
      info.enabled = false;
      this.restoreLayout(win, list);
    }
  }

  private static async disable(win: Window, cb: HTMLInputElement) {
    const info = this.attached.get(win);
    const doc = win.document;
    if (!info) return;
    info.enabled = false;
    cb.checked = false;
    this.restoreLayout(win, doc.getElementById("annotations-list"));
  }

  private static applyLayout(doc: Document) {
    if (!doc.getElementById(STYLE_ID)) {
      const st = doc.createElement("style");
      st.id = STYLE_ID;
      st.textContent =
        "#annotations-list collapsible-section{display:none !important;}";
      doc.documentElement!.appendChild(st);
    }
    for (const id of HIDE_IDS) {
      const e = doc.getElementById(id) as HTMLElement | null;
      if (e) e.style.display = "none";
    }
    const sidebar = doc.getElementById("sidebar") as HTMLElement | null;
    if (sidebar) sidebar.style.cssText += ";flex:1;width:auto;max-width:none;";
  }

  private static restoreLayout(win: Window, list: any) {
    const doc = win.document;
    doc.getElementById(VIEW_ID)?.remove();
    doc.getElementById(STYLE_ID)?.remove();
    for (const id of HIDE_IDS) {
      const e = doc.getElementById(id) as HTMLElement | null;
      if (e) e.style.display = "";
    }
    const sidebar = doc.getElementById("sidebar") as HTMLElement | null;
    if (sidebar) {
      sidebar.style.flex = "";
      sidebar.style.width = "";
      sidebar.style.maxWidth = "";
    }
    try {
      if (list) {
        list.items = [];
        list.render?.();
      }
      // Let Zotero recompute the list from the current item selection.
      (win as any).libraryLayout?.itemsView?.selection?.clearSelection?.();
    } catch (e) {
      ztoolkit.log("annotree dialog restore failed:", e);
    }
  }

  private static hideEmptyHeadings(win: Window) {
    const doc = win.document;
    for (const group of doc.querySelectorAll(
      `#${VIEW_ID} .annotree-group`,
    ) as NodeListOf<HTMLElement>) {
      const visible = group.querySelector("annotation-row:not([hidden])");
      const head = group.previousElementSibling as HTMLElement | null;
      if (head) head.hidden = !visible;
      group.style.display = visible ? "" : "none";
    }
  }
}
