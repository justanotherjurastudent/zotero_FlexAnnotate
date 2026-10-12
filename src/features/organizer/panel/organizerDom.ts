/**
 * DOM helpers shared by all organizer panels: element and button builders,
 * the text input style and the progress toast.
 */

import { makeIcon, IconName } from "../icons";
import { Palette, getTheme } from "../theme";

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

export interface ToastOptions {
  type?: string;
  closeTime?: number;
  actionLabel?: string;
  onAction?: () => void;
  window?: Window;
  doc?: Document;
}

function findOrganizerWindow(): Window | null {
  try {
    const en = (Services as any)?.wm?.getEnumerator?.("");
    if (en) {
      while (en.hasMoreElements()) {
        const w = en.getNext() as Window;
        if (!w.closed && w.document?.getElementById("flexannotate-root")) {
          return w;
        }
      }
    }
  } catch {
    // Services.wm may not be available in all contexts
  }
  return null;
}

export function toast(
  text: string,
  typeOrOptions: string | ToastOptions = "success",
) {
  const opts: ToastOptions =
    typeof typeOrOptions === "string"
      ? { type: typeOrOptions }
      : typeOrOptions || {};
  const type = opts.type ?? "success";
  const hasAction = typeof opts.onAction === "function";
  const closeTime = opts.closeTime ?? (hasAction ? 8000 : 2500);

  const doc = opts.doc ?? (opts.window ?? findOrganizerWindow())?.document;

  if (!doc) {
    try {
      const pw = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
        closeOnClick: true,
        closeTime,
      });
      pw.createLine({ text, type, progress: 100 }).show();
    } catch (e) {
      ztoolkit.log("flexannotate toast fallback failed:", e);
    }
    return;
  }

  const t = getTheme(doc);
  let container = doc.getElementById(
    "flexannotate-toast-container",
  ) as HTMLElement | null;
  if (!container) {
    container = el(
      doc,
      "div",
      "position:fixed;bottom:20px;right:24px;z-index:99999;display:flex;" +
        "flex-direction:column;gap:8px;pointer-events:none;max-width:420px;",
    );
    container.id = "flexannotate-toast-container";
    const root =
      (doc.getElementById("flexannotate-root") as HTMLElement | null) ??
      doc.body ??
      doc.documentElement;
    if (root) root.appendChild(container);
  }

  const toastEl = el(
    doc,
    "div",
    `pointer-events:auto;background:${t.panel};color:${t.text};border:1px solid ${t.border};` +
      `border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,0.2);padding:8px 12px;` +
      "font-size:12px;line-height:1.4;display:flex;align-items:center;gap:10px;" +
      "transition:opacity 0.2s ease, transform 0.2s ease;opacity:0;transform:translateY(6px);cursor:default;",
  );

  const indicator = el(
    doc,
    "span",
    `flex:none;width:8px;height:8px;border-radius:50%;background:${
      type === "error" ? "#e03131" : type === "warning" ? "#f59f00" : "#2f9e44"
    };`,
  );
  toastEl.appendChild(indicator);

  const msg = el(
    doc,
    "span",
    "flex:1;min-width:0;word-break:break-word;",
    text,
  );
  toastEl.appendChild(msg);

  let timer: any = null;
  const dismiss = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    toastEl.style.opacity = "0";
    toastEl.style.transform = "translateY(6px)";
    setTimeout(() => {
      try {
        toastEl.remove();
        if (container && !container.hasChildNodes()) {
          container.remove();
        }
      } catch {
        // already removed
      }
    }, 200);
  };

  if (hasAction && opts.onAction) {
    const onAction = opts.onAction;
    const btn = button(doc, t, opts.actionLabel ?? "Open", "", () => {
      dismiss();
      try {
        onAction();
      } catch (e) {
        ztoolkit.log("flexannotate toast action failed:", e);
      }
    });
    btn.style.padding = "2px 8px";
    btn.style.fontSize = "11px";
    toastEl.appendChild(btn);
  }

  toastEl.addEventListener("click", () => dismiss());

  container.appendChild(toastEl);
  setTimeout(() => {
    toastEl.style.opacity = "1";
    toastEl.style.transform = "translateY(0)";
  }, 10);

  if (closeTime > 0) {
    timer = setTimeout(dismiss, closeTime);
  }
}
