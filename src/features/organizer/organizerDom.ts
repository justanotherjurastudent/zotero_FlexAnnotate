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

export interface ToastOptions {
  type?: string;
  closeTime?: number;
  actionLabel?: string;
  onAction?: () => void;
  window?: Window;
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

  const pw = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime,
    window: opts.window,
  });
  pw.createLine({ text, type, progress: 100 }).show();

  if (hasAction && opts.onAction) {
    const onAction = opts.onAction;
    const actionLabel = opts.actionLabel;
    let handled = false;
    const trigger = () => {
      if (handled) return;
      handled = true;
      try {
        pw.win.close();
      } catch {
        // window may already be closed
      }
      try {
        onAction();
      } catch (e) {
        ztoolkit.log("flexannotate toast action failed:", e);
      }
    };

    let retries = 20;
    const checkLine = () => {
      const line = (pw as any).lines?.[0];
      const hbox = line?._hbox as HTMLElement | undefined;
      if (hbox && hbox.ownerDocument) {
        const doc = hbox.ownerDocument;
        const win = doc.defaultView as
          (Window & { sizeToContent?: () => void }) | null;

        // Nachrichtenzeile selbst ebenfalls klickbar machen
        hbox.style.cursor = "pointer";
        hbox.addEventListener("mouseup", (e) => e.stopPropagation());
        hbox.addEventListener("click", (e) => {
          e.stopPropagation();
          trigger();
        });

        if (actionLabel) {
          const actionRow = doc.createElement("div");
          actionRow.style.display = "flex";
          actionRow.style.marginTop = "6px";
          actionRow.style.marginLeft = "22px";

          const btn = doc.createElement("button");
          btn.textContent = actionLabel;
          btn.setAttribute("type", "button");
          btn.style.padding = "2px 8px";
          btn.style.fontSize = "11px";
          btn.style.lineHeight = "16px";
          btn.style.cursor = "pointer";
          btn.style.borderRadius = "3px";
          btn.style.border = "1px solid var(--color-border, #ccc)";
          btn.style.background = "var(--material-button, #f0f0f0)";
          btn.style.color = "var(--fill-primary, inherit)";
          btn.addEventListener("mouseup", (e) => e.stopPropagation());
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            trigger();
          });
          actionRow.appendChild(btn);

          if (hbox.nextSibling) {
            hbox.parentElement?.insertBefore(actionRow, hbox.nextSibling);
          } else {
            hbox.parentElement?.appendChild(actionRow);
          }
        }

        if (win) {
          try {
            win.sizeToContent?.();
          } catch {
            // sizeToContent may not be available on all window types
          }
          try {
            (Zotero as any).ProgressWindowSet?.tile(win);
          } catch {
            // tile may fail if not registered
          }
          try {
            const margin = 24;
            const availLeft = win.screen.availLeft ?? 0;
            const availTop = win.screen.availTop ?? 0;
            const maxRight = availLeft + win.screen.availWidth - margin;
            const maxBottom = availTop + win.screen.availHeight - margin;
            let targetX = win.screenX;
            let targetY = win.screenY;
            if (targetX + win.outerWidth > maxRight) {
              targetX = maxRight - win.outerWidth;
            }
            if (targetY + win.outerHeight > maxBottom) {
              targetY = maxBottom - win.outerHeight;
            }
            if (targetX !== win.screenX || targetY !== win.screenY) {
              win.moveTo(
                Math.max(availLeft + margin, targetX),
                Math.max(availTop + margin, targetY),
              );
            }
          } catch {
            // best effort position clamping
          }
        }
      } else if (retries-- > 0) {
        setTimeout(checkLine, 50);
      }
    };
    checkLine();
  }
}
