/**
 * Darstellung der Fußnoten-Anzeige im Zitierdialog: der Tooltip-Popover am
 * grünen Haken (alle Fundstellen) und die klickbaren Fußnoten-Badges in der
 * Vorschau. Ein Klick springt zur Fußnote (jumpToCitation); schlägt das
 * fehl, wird über den `refresh`-Callback neu gezeichnet.
 *
 * Kein Import aus `dialogOutlineRender.ts` (nur den View-Typ), damit dieses
 * Modul zyklenfrei bleibt — das Neuzeichnen übernimmt der Aufrufer.
 */

import type { View } from "./dialogOutlineRender";
import {
  formatCitationLocationList,
  type CitationLocation,
  type FormatLocationOptions,
} from "../logic/cited";
import { tr } from "../strings";
import { jumpToCitation } from "./dialogCited";
import { GREEN } from "./citedToggle";

function getLocationOptions(): FormatLocationOptions {
  return {
    textLabel: tr("dialogLocationText"),
    footnotePattern: tr("dialogLocationFootnote"),
    endnotePattern: tr("dialogLocationEndnote"),
  };
}

function attachFootnotePopover(
  win: Window,
  v: View,
  check: HTMLElement,
  locs: CitationLocation[],
  refresh: () => void,
): void {
  const doc = win.document;
  let closeTimer: any = null;

  const removeActivePopover = () => {
    const existing = doc.getElementById("flexannotate-footnote-popover");
    if (existing) existing.remove();
  };

  const scheduleClose = () => {
    if (closeTimer) win.clearTimeout(closeTimer);
    closeTimer = win.setTimeout(() => {
      removeActivePopover();
      closeTimer = null;
    }, 200);
  };

  const cancelClose = () => {
    if (closeTimer) {
      win.clearTimeout(closeTimer);
      closeTimer = null;
    }
  };

  const show = () => {
    cancelClose();
    removeActivePopover();

    const rect = check.getBoundingClientRect();
    const popover = doc.createElement("div");
    popover.id = "flexannotate-footnote-popover";
    popover.style.cssText =
      "position:fixed;z-index:99999;background:var(--material-background,#ffffff);" +
      "color:var(--material-color,#222222);border:1px solid rgba(128,128,128,0.28);" +
      "border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,0.22);padding:6px 8px;" +
      "display:flex;flex-direction:column;gap:5px;font-size:11px;min-width:90px;max-width:260px;" +
      "box-sizing:border-box;pointer-events:auto;";

    const header = doc.createElement("div");
    header.style.cssText =
      `color:var(--fill-secondary,#777);font-size:10px;font-weight:600;text-transform:uppercase;` +
      "letter-spacing:0.4px;user-select:none;";
    header.textContent =
      locs.length > 1
        ? `${tr("dialogCitedIn")} (${locs.length})`
        : tr("dialogCitedIn");
    popover.appendChild(header);

    const chips = doc.createElement("div");
    chips.style.cssText =
      "display:flex;gap:4px;flex-wrap:wrap;max-height:180px;overflow-y:auto;padding-right:2px;" +
      "scrollbar-width:thin;scrollbar-color:rgba(128,128,128,0.4) transparent;";

    const items = formatCitationLocationList(locs, getLocationOptions());
    for (const { loc: l, label } of items) {
      const chip = doc.createElement("button");
      chip.className = "flexannotate-loc-chip";
      chip.style.cssText =
        `background:rgba(31,157,85,0.12);color:${GREEN};border:1px solid rgba(31,157,85,0.4);` +
        "border-radius:4px;padding:2px 6px;font-size:11px;font-weight:600;cursor:pointer;" +
        "display:inline-flex;align-items:center;line-height:1.2;outline:none;";
      chip.textContent = label;
      const hint = l.plainCitation ? `${label}: ${l.plainCitation}` : label;
      chip.title = `${hint} (${tr("dialogJumpToFootnote")})`;
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        removeActivePopover();
        void jumpToCitation(l.citation || l).then((ok) => {
          if (!ok) refresh();
        });
      });
      chips.appendChild(chip);
    }
    popover.appendChild(chips);

    popover.addEventListener("mouseenter", cancelClose);
    popover.addEventListener("mouseleave", scheduleClose);

    (doc.body || doc.documentElement)?.appendChild(popover);

    const popWidth = popover.offsetWidth || 140;
    const popHeight = popover.offsetHeight || 100;
    const winWidth = win.innerWidth || 400;
    const winHeight = win.innerHeight || 500;
    const left = Math.max(8, Math.min(rect.left, winWidth - popWidth - 10));
    const fitsBelow = rect.bottom + popHeight + 8 <= winHeight;
    const top =
      fitsBelow || rect.top - popHeight - 4 < 0
        ? rect.bottom + 4
        : rect.top - popHeight - 4;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  };

  check.addEventListener("mouseenter", show);
  check.addEventListener("mouseleave", scheduleClose);
}

/** Klickbarer Fußnoten-Badge für die Vorschau-Spalte. */
function makeCitationChip(
  doc: Document,
  label: string,
  hint: string,
  onClick: () => void,
): HTMLButtonElement {
  const chip = doc.createElement("button");
  chip.type = "button";
  chip.className = "flexannotate-citation-chip";
  chip.textContent = label;
  chip.title = `${hint} (${tr("dialogJumpToFootnote")})`;
  chip.style.cssText =
    "cursor:pointer;padding:2px 8px;font-size:11px;line-height:normal;" +
    "font-family:inherit;margin:0;border-radius:10px;" +
    "border:1px solid var(--fill-quinary, rgba(128,128,128,0.3));" +
    "background:rgba(31,157,85,0.1);color:" +
    GREEN +
    ";font-weight:600;";
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return chip;
}

export { attachFootnotePopover, makeCitationChip };
export type { CitationLocation };
