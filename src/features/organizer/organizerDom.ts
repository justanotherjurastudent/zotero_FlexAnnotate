/**
 * DOM helpers shared by all organizer panels: element and button builders,
 * the text input style and the progress toast.
 */

import { makeIcon, IconName } from "./icons";
import { Palette } from "./theme";

export const HTML_NS = "http://www.w3.org/1999/xhtml";
/** Drag and drop payload: JSON array of row ids. */
export const DND_TYPE = "text/x-flexannotate-ids";

export function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  css = "",
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = doc.createElementNS(HTML_NS, tag) as HTMLElementTagNameMap[K];
  if (css) e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function button(
  doc: Document,
  t: Palette,
  label: string,
  title: string,
  onClick: () => void,
  icon?: IconName,
): HTMLButtonElement {
  const b = el(
    doc,
    "button",
    `appearance:none;-moz-appearance:none;color:${t.text};cursor:pointer;` +
      `border:1px solid ${t.border};border-radius:5px;background:${t.btnBg};` +
      "font-size:12px;line-height:1;padding:5px 9px;" +
      "display:inline-flex;align-items:center;gap:6px;",
  );
  if (icon) b.appendChild(makeIcon(doc, icon, 15));
  if (label) b.appendChild(doc.createTextNode(label));
  b.title = title;
  b.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** Square toolbar button that only shows a colored icon. */
export function iconButton(
  doc: Document,
  t: Palette,
  icon: IconName,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = el(
    doc,
    "button",
    `appearance:none;-moz-appearance:none;cursor:pointer;width:29px;height:28px;` +
      `padding:0;display:inline-flex;align-items:center;justify-content:center;` +
      `border:1px solid ${t.border};border-radius:5px;background:${t.btnBg};`,
  );
  b.appendChild(makeIcon(doc, icon, 18));
  b.title = title;
  b.setAttribute("aria-label", title);
  b.addEventListener("click", (e: Event) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

export function input(
  doc: Document,
  t: Palette,
  placeholder: string,
): HTMLInputElement {
  const i = el(
    doc,
    "input",
    `color:${t.text};background:${t.inputBg};border:1px solid ${t.border};` +
      "border-radius:4px;padding:4px 7px;font-size:12px;min-width:0;",
  );
  i.type = "text";
  i.placeholder = placeholder;
  return i;
}

export function toast(text: string, type = "success") {
  new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: 2500,
  })
    .createLine({ text, type, progress: 100 })
    .show();
}
