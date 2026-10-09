/**
 * Top bar of the organizer: the two tabs ("Wissen" and "Titel") and the
 * collection scope drop-down with its "subcollections" option.
 */

import { emptySelection } from "../../core/selection";
import { collectionChoices } from "./organizerData";
import { el } from "./organizerDom";
import { applyScope, Ctx, reload, Tab } from "./organizerState";
import { Palette } from "./theme";
import { tr } from "./strings";

export function tabBar(ctx: Ctx, t: Palette): HTMLElement {
  const { doc, s } = ctx;
  const bar = el(
    doc,
    "div",
    `display:flex;gap:4px;align-items:flex-end;border-bottom:2px solid ${t.border};` +
      "flex:0 0 auto;padding:10px 4px 0;",
  );
  const mk = (tab: Tab, label: string) => {
    const on = s.tab === tab;
    const d = el(
      doc,
      "div",
      `padding:7px 16px;cursor:pointer;font-size:13px;margin-bottom:-2px;` +
        `border:1px solid ${on ? t.border : "transparent"};border-bottom:none;` +
        `border-radius:6px 6px 0 0;background:${on ? t.panel : "transparent"};` +
        `font-weight:${on ? 600 : 400};color:${on ? t.text : t.sub};`,
      label,
    );
    d.addEventListener("click", () => {
      if (s.tab === tab) return;
      s.tab = tab;
      s.node = "all";
      s.query = "";
      void reload(ctx);
    });
    bar.appendChild(d);
  };
  mk("wissen", tr("tabKnowledge"));
  mk("titel", tr("tabTitles"));

  // collection scope: which collection (and subcollections) to take from
  const scope = el(
    doc,
    "div",
    `margin-left:auto;display:flex;gap:8px;align-items:center;padding:0 8px 6px;` +
      `font-size:12px;color:${t.sub};`,
  );
  scope.appendChild(el(doc, "span", "", tr("scope")));
  // A plain HTML <select> does not open its popup in this dialog window, so
  // the collection list is a small custom drop-down.
  const choices = [
    { id: 0, name: tr("scopeAll"), depth: 0 },
    ...collectionChoices(s.libraryID),
  ];
  const current =
    choices.find((c) => c.id === (s.scope.collectionID ?? 0)) ?? choices[0];
  const wrap = el(doc, "div", "position:relative;");
  const sel = el(
    doc,
    "button",
    `appearance:none;-moz-appearance:none;cursor:pointer;max-width:320px;overflow:hidden;` +
      `text-overflow:ellipsis;white-space:nowrap;color:${t.text};background:${t.inputBg};` +
      `border:1px solid ${t.border};border-radius:4px;padding:3px 8px;font-size:12px;`,
    `${current.name}  ▾`,
  );
  sel.id = "flexannotate-scope";
  sel.dataset.value = String(current.id);
  const menu = el(
    doc,
    "div",
    `position:absolute;right:0;top:100%;margin-top:2px;z-index:30;display:none;min-width:240px;` +
      `max-height:320px;overflow-y:auto;background:${t.panel};color:${t.text};` +
      `border:1px solid ${t.border};border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.25);`,
  );
  menu.id = "flexannotate-scope-menu";
  menu.dataset.menu = "1";
  for (const c of choices) {
    const o = el(
      doc,
      "div",
      `padding:5px 10px 5px ${10 + c.depth * 14}px;cursor:pointer;white-space:nowrap;` +
        (c.id === current.id ? "font-weight:600;" : ""),
      c.name,
    );
    o.dataset.value = String(c.id);
    o.addEventListener("mouseenter", () => (o.style.background = t.hover));
    o.addEventListener(
      "mouseleave",
      () => (o.style.background = "transparent"),
    );
    o.addEventListener("click", () => {
      s.scope = { ...s.scope, collectionID: c.id || null };
      applyScope(s);
      s.sel = emptySelection();
      ctx.render();
    });
    menu.appendChild(o);
  }
  sel.addEventListener("click", () => {
    menu.style.display = menu.style.display === "none" ? "block" : "none";
  });
  wrap.append(sel, menu);
  const sub = el(
    doc,
    "label",
    "display:flex;gap:4px;align-items:center;cursor:pointer;",
  );
  const cb = el(doc, "input");
  cb.type = "checkbox";
  cb.id = "flexannotate-scope-sub";
  cb.checked = s.scope.includeSub;
  cb.disabled = s.scope.collectionID === null;
  cb.addEventListener("change", () => {
    s.scope = { ...s.scope, includeSub: cb.checked };
    applyScope(s);
    ctx.render();
  });
  sub.append(cb, el(doc, "span", "", tr("scopeSub")));
  scope.append(wrap, sub);
  bar.appendChild(scope);
  return bar;
}
