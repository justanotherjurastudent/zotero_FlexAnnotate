/**
 * Layout building blocks of the outline view in the citation dialog: the
 * three-column layout that hides Zotero's native columns, and the narrow view
 * below 750 px (only in the persistent companion window). Also the native IDs
 * that get hidden.
 *
 * No import from `dialogOutline.ts`: only the render IDs, nothing else, so
 * this module stays independent.
 */

import { isFeatureEnabled } from "../../gates";
import { LIST_ID, NATIVE_ID, PREVIEW_ID, TREE_ID } from "./dialogOutlineRender";

export const STYLE_ID = "flexannotate-dialog-style";
/** Native elements hidden while our three columns are shown. */
export const NATIVE_HIDE = [
  "zotero-collections-tree",
  "zotero-items-tree",
  "annotations-list-wrapper",
  "annotations-sidebar-filter-wrapper",
  "annotations-message",
];
/** A min-width chain is what makes long one-line rows push the layout wider. */
const BASE_LAYOUT_CSS =
  "#library-trees{overflow:hidden !important;min-width:0 !important;}" +
  "#item-tree-container{flex:1 1 0 !important;min-width:0 !important;overflow:hidden !important;}" +
  "#flexannotate-list-pane,#flexannotate-list-pane *{min-width:0;}" +
  "#flexannotate-preview{min-width:0;overflow-x:hidden;overflow-wrap:anywhere;}" +
  ".flexannotate-citation-chip:hover{background:rgba(31,157,85,0.22) !important;}" +
  ".flexannotate-citation-chip:active{background:rgba(31,157,85,0.35) !important;}" +
  ".flexannotate-citation-chip:focus-visible{outline:2px solid #1f9d55 !important;outline-offset:1px !important;}";

// Below 750 px, only in the persistent companion window (attribute set by relaxDialogMinWidth):
// on a 9.0.6 test run two outline tests failed (cause not fully clarified);
// normal dialogs therefore stay unchanged. Tree on top as a strip, list fills the rest,
// details at the bottom. Column instead of wrapping: the list otherwise grew and pushed
// the details out of the window.
const NARROW_LAYOUT_CSS =
  "@media (max-width:750px){" +
  "#citation-dialog[flexannotate-persistent] #library-trees{flex-direction:column !important;align-items:stretch !important;}" +
  "#citation-dialog[flexannotate-persistent] #collections-tree-container{flex:0 0 auto !important;height:130px !important;width:auto !important;min-width:0 !important;min-height:0 !important;}" +
  "#citation-dialog[flexannotate-persistent] #collections-tree-divider{display:none;}" +
  "#citation-dialog[flexannotate-persistent] #item-tree-container{flex:1 1 0 !important;width:auto !important;min-width:0 !important;min-height:0 !important;}" +
  "#citation-dialog[flexannotate-persistent] #sidebar{flex:0 1 auto !important;width:auto !important;min-width:0 !important;max-height:30%;overflow-y:auto;}" +
  "}";

export const LAYOUT_CSS = BASE_LAYOUT_CSS + NARROW_LAYOUT_CSS;

/** Hide Zotero's native columns and add the containers for ours. */
export function applyLayout(win: Window): void {
  const doc = win.document;
  if (!doc.getElementById(STYLE_ID)) {
    const st = doc.createElement("style");
    st.id = STYLE_ID;
    const css = isFeatureEnabled("narrowDialogLayout")
      ? LAYOUT_CSS
      : BASE_LAYOUT_CSS;
    st.textContent =
      NATIVE_HIDE.map((id) => `#${id}`)
        .concat(["#annotations-list collapsible-section"])
        .join(",")
        .concat("{display:none !important;}") + css;
    doc.documentElement!.appendChild(st);
  }
  const mk = (parentId: string, id: string, css: string) => {
    const parent = doc.getElementById(parentId);
    if (!parent || doc.getElementById(id)) return;
    const d = doc.createElement("div");
    d.id = id;
    d.style.cssText = css;
    parent.appendChild(d);
  };
  const isCitation =
    (doc.documentElement?.getAttribute("dialog-type") ||
      (win as any).DIALOG_STATE?.type) === "citation";
  mk(
    "collections-tree-container",
    TREE_ID,
    "flex:1;display:flex;flex-direction:column;overflow-y:auto;min-height:0;padding:4px 0;",
  );
  mk(
    "item-tree-container",
    LIST_ID,
    "flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;",
  );
  if (isCitation) {
    doc.getElementById(PREVIEW_ID)?.remove();
  } else {
    mk(
      "annotations-sidebar",
      PREVIEW_ID,
      "flex:1;overflow-y:auto;min-height:0;padding:8px 10px;display:flex;flex-direction:column;gap:8px;",
    );
  }
}

/** Tears down our own layout (without listeners; the injector cleans those up). */
export function removeLayout(win: Window): void {
  const doc = win.document;
  for (const id of [TREE_ID, LIST_ID, PREVIEW_ID, NATIVE_ID, STYLE_ID])
    doc.getElementById(id)?.remove();
  try {
    const list = doc.getElementById("annotations-list") as any;
    if (list) {
      list.items = [];
      list.render?.();
    }
    // The virtualized collection tree was display:none: the browser resets
    // scrollTop while the list keeps its old scrollOffset (windowed-list.js:180,
    // 296-310) and draws the rows in the wrong place. update() re-reads
    // scrollTop, invalidate() redraws.
    const ct = (win as any).libraryLayout?.collectionsView;
    win.requestAnimationFrame(() => {
      try {
        ct?.tree?._jsWindow?.update();
        ct?.tree?.invalidate();
        const i = ct?.tree?.selection?.focused;
        if (typeof i === "number" && i >= 0) ct.ensureRowIsVisible(i);
      } catch (e) {
        ztoolkit.log("flexannotate dialog collection tree redraw failed:", e);
      }
    });
    // Let Zotero recompute its list from the current item selection.
    (win as any).libraryLayout?.itemsView?.selection?.clearSelection?.();
  } catch (e) {
    ztoolkit.log("flexannotate dialog restore failed:", e);
  }
}
