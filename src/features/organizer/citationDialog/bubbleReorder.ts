/**
 * Bubble drag-and-drop and manual reordering in the citation dialog.
 * Enables sortable on bubble-input in all modes, fixes child drag targeting,
 * styles drop indicators, and preserves manual citation order across additions.
 */

import { assignChecked } from "../../../shared/patch";
import { isFeatureEnabled } from "../../gates";
import { shouldSkipSort } from "../logic/bubbleOrder";

const STYLE_ID = "flexannotate-bubble-reorder-style";

interface BubbleReorderState {
  observer: MutationObserver;
  onDragStart: (e: DragEvent) => void;
  onMoveItem: (e: Event) => void;
  origSort?: (...args: any[]) => Promise<any>;
}

const states = new WeakMap<Window, BubbleReorderState>();

export function injectBubbleReorder(win: Window): void {
  if (states.has(win)) return;
  if (!isFeatureEnabled("bubbleReorder")) return;

  const doc = win.document;
  const bubbleInput = doc.getElementById("bubble-input") as any;
  if (!bubbleInput) return;

  // 1. Inject styles for drop indicators and child pointer events
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #bubble-input .bubble * {
        pointer-events: none !important;
      }
      #bubble-input .bubble.drop-before {
        box-shadow: -3px 0 0 0 #0070e0 !important;
        border-left: 2px solid #0070e0 !important;
      }
      #bubble-input .bubble.drop-after {
        box-shadow: 3px 0 0 0 #0070e0 !important;
        border-right: 2px solid #0070e0 !important;
      }
    `;
    doc.head?.appendChild(style);
  }

  // 2. Enable sortable on bubbleInput
  bubbleInput.sortable = true;
  bubbleInput.setAttribute("sortable", "true");

  const makeBubblesDraggable = () => {
    const bubbles = doc.querySelectorAll<HTMLElement>("#bubble-input .bubble");
    for (const b of bubbles) {
      if (b.getAttribute("draggable") !== "true") {
        b.setAttribute("draggable", "true");
      }
    }
  };
  makeBubblesDraggable();

  // 3. Observe changes to bubble-input to ensure new bubbles become draggable
  const observer = new win.MutationObserver(() => {
    bubbleInput.sortable = true;
    bubbleInput.setAttribute("sortable", "true");
    makeBubblesDraggable();
  });
  observer.observe(bubbleInput, { childList: true, subtree: true });

  // 4. Capture dragstart to guarantee the draggable target is the bubble
  const onDragStart = (e: DragEvent) => {
    const bubble = (e.target as HTMLElement | null)?.closest?.(
      ".bubble",
    ) as HTMLElement | null;
    if (bubble) {
      bubble.setAttribute("draggable", "true");
      bubbleInput.sortable = true;
      if (e.dataTransfer && !e.dataTransfer.getData("text/plain")) {
        e.dataTransfer.setData("text/plain", '<span id="zotero-drag"/>');
      }
    }
  };
  bubbleInput.addEventListener("dragstart", onDragStart, true);

  // 5. Track move-item to mark the citation as unsorted and uncheck keepSorted
  const onMoveItem = () => {
    const io = (win as any).io;
    if (io?.citation) {
      io.citation.properties = io.citation.properties || {};
      io.citation.properties.unsorted = true;
    }
    const keepSorted = doc.getElementById(
      "keepSorted",
    ) as HTMLInputElement | null;
    if (keepSorted) {
      keepSorted.checked = false;
    }
  };
  doc.addEventListener("move-item", onMoveItem);

  // 6. Patch CitationDataManager.sort so manual reordering is preserved
  const cdm = (win as any).CitationDataManager;
  let origSort: ((...args: any[]) => Promise<any>) | undefined;
  if (cdm && typeof cdm.sort === "function") {
    origSort = cdm.sort;
    const patchedSort = async function (this: any, ...args: any[]) {
      const io = (win as any).io;
      const keepSorted = doc.getElementById(
        "keepSorted",
      ) as HTMLInputElement | null;
      if (keepSorted?.checked && io?.citation?.properties) {
        io.citation.properties.unsorted = false;
      }
      if (
        shouldSkipSort(io?.citation?.properties?.unsorted, keepSorted?.checked)
      ) {
        return;
      }
      return origSort!.apply(this, args);
    };
    if (!assignChecked(cdm, "sort", patchedSort)) {
      ztoolkit.log(
        "FlexAnnotate: assignChecked for CitationDataManager.sort failed",
      );
    }
  }

  states.set(win, {
    observer,
    onDragStart,
    onMoveItem,
    origSort,
  });
}

export function removeBubbleReorder(win: Window): void {
  const st = states.get(win);
  if (!st) return;
  states.delete(win);

  st.observer.disconnect();
  const doc = win.document;
  const bubbleInput = doc.getElementById("bubble-input") as any;
  if (bubbleInput) {
    bubbleInput.removeEventListener("dragstart", st.onDragStart, true);
    bubbleInput.sortable = false;
    bubbleInput.removeAttribute("sortable");
  }
  doc.removeEventListener("move-item", st.onMoveItem);

  const style = doc.getElementById(STYLE_ID);
  style?.remove();

  const cdm = (win as any).CitationDataManager;
  if (cdm && st.origSort) {
    if (!assignChecked(cdm, "sort", st.origSort)) {
      ztoolkit.log("FlexAnnotate: failed to restore CitationDataManager.sort");
    }
  }
}
