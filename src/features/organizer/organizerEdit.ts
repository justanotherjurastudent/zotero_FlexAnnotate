/**
 * Edit form of an annotation in the detail column: quote text, comment, place
 * and place type. Only this annotation is changed.
 */

import {
  locatorLabel,
  locatorTypes,
  Row,
  saveAnnotation,
} from "./organizerData";
import { button, el, input, toast } from "./organizerDom";
import { Ctx } from "./organizerState";
import { Palette } from "./theme";
import { tr } from "./strings";

/** Edit quote text, comment, citation place and place type of an annotation. */
export function renderEditForm(ctx: Ctx, box: HTMLElement, t: Palette, r: Row) {
  const { doc, s } = ctx;
  const field = (label: string, control: HTMLElement) => {
    const w = el(doc, "div", "display:flex;flex-direction:column;gap:3px;");
    w.append(el(doc, "span", `color:${t.sub};font-size:11px;`, label), control);
    box.appendChild(w);
  };
  const area = (value: string, rows: number) => {
    const a = el(
      doc,
      "textarea",
      `color:${t.text};background:${t.inputBg};border:1px solid ${t.border};` +
        "border-radius:4px;padding:5px 7px;font-size:12px;resize:vertical;" +
        "font-family:inherit;",
    );
    a.rows = rows;
    a.value = value;
    return a;
  };
  const canEditText = r.type === "highlight" || r.type === "underline";
  const quote = area(r.text, 5);
  quote.id = "flexannotate-edit-quote";
  if (canEditText) field(tr("fQuote"), quote);
  const comment = area(r.comment, 3);
  comment.id = "flexannotate-edit-comment";
  field(tr("fComment"), comment);
  const place = input(doc, t, "");
  place.id = "flexannotate-edit-place";
  place.value = r.pageLabel;
  field(tr("fPlace"), place);
  // The list of locator types, like in FlexAnnotate sorted by its label. It
  // only sets this annotation's type; no other annotation is touched.
  const types = [...locatorTypes()];
  if (!types.includes(r.locator)) types.push(r.locator);
  const labelOf = (ty: string) => locatorLabel(ty, null);
  types.sort((x, y) => labelOf(x).localeCompare(labelOf(y)));
  const locWrap = el(doc, "div", "position:relative;");
  const loc = el(
    doc,
    "button",
    `appearance:none;-moz-appearance:none;cursor:pointer;text-align:left;color:${t.text};` +
      `background:${t.inputBg};border:1px solid ${t.border};border-radius:4px;` +
      "padding:5px 8px;font-size:12px;display:flex;justify-content:space-between;",
  );
  loc.id = "flexannotate-edit-locator";
  loc.dataset.value = r.locator;
  const locText = el(doc, "span", "", labelOf(r.locator));
  loc.append(locText, el(doc, "span", "", "▾"));
  const locMenu = el(
    doc,
    "div",
    `position:absolute;left:0;right:0;top:100%;margin-top:2px;z-index:30;display:none;` +
      `max-height:240px;overflow-y:auto;background:${t.panel};color:${t.text};` +
      `border:1px solid ${t.border};border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.25);`,
  );
  locMenu.id = "flexannotate-edit-locator-menu";
  locMenu.dataset.menu = "1";
  for (const ty of types) {
    const o = el(
      doc,
      "div",
      "padding:5px 10px;cursor:pointer;" +
        (ty === r.locator ? "font-weight:600;" : ""),
      labelOf(ty),
    );
    o.dataset.value = ty;
    o.addEventListener("mouseenter", () => (o.style.background = t.hover));
    o.addEventListener(
      "mouseleave",
      () => (o.style.background = "transparent"),
    );
    o.addEventListener("click", () => {
      loc.dataset.value = ty;
      locText.textContent = labelOf(ty);
      locMenu.style.display = "none";
    });
    locMenu.appendChild(o);
  }
  loc.addEventListener("click", () => {
    locMenu.style.display = locMenu.style.display === "none" ? "block" : "none";
  });
  locWrap.append(loc, locMenu);
  field(tr("fLocator"), locWrap);

  const actions = el(doc, "div", "display:flex;gap:6px;margin-top:4px;");
  const saveBtn = button(doc, t, tr("save"), "", () => {
    void (async () => {
      const patch = {
        ...(canEditText ? { text: quote.value } : {}),
        comment: comment.value,
        pageLabel: place.value.trim(),
        locator: loc.dataset.value ?? r.locator,
      };
      const ok = await saveAnnotation(r.id, patch);
      if (!ok) {
        toast(tr("saveFailed"), "error");
        return;
      }
      for (const row of s.allRows) {
        if (row.id !== r.id) continue;
        if (canEditText) row.text = patch.text!;
        row.comment = patch.comment;
        row.pageLabel = patch.pageLabel;
        row.locator = patch.locator;
      }
      s.editing = null;
      toast(tr("saved"));
      ctx.render();
    })();
  });
  saveBtn.id = "flexannotate-edit-save";
  actions.append(
    saveBtn,
    button(doc, t, tr("cancel"), "", () => {
      s.editing = null;
      ctx.render();
    }),
  );
  box.appendChild(actions);
}
