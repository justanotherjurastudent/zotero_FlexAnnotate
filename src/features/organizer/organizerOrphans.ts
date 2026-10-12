/**
 * Overlay für verwaiste Überschriften-Tags: Tags im Bereich des Baums, zu
 * denen keine Überschrift passt (z. B. nach einer Umbenennung auf einem
 * Rechner ohne Plugin). Zeigt nur Tags, keine Einträge; jedes Tag wird einer
 * Überschrift zugeordnet (Tag-Umbenennung im Bereich des Baums) oder entfernt.
 */

import {
  flatten,
  headingTag,
  numbering,
  OutlineNode,
} from "../../core/outline";
import { OutlineModel } from "./outlineModel";
import { treeWorkIDs } from "./organizerData";
import { button, el } from "./organizerDom";
import { Ctx, reload } from "./organizerState";
import { Palette } from "./theme";
import { tr } from "./strings";

export function orphanOverlay(ctx: Ctx, t: Palette): HTMLElement {
  const { doc, s } = ctx;
  const close = () => {
    s.orphanOpen = false;
    ctx.render();
  };
  const back = el(
    doc,
    "div",
    "position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.4);" +
      "display:flex;align-items:center;justify-content:center;",
  );
  back.id = "flexannotate-orphans";
  back.addEventListener("click", (e) => {
    if (e.target === back) close();
  });
  const panel = el(
    doc,
    "div",
    `background:${t.panel};color:${t.text};border:1px solid ${t.border};` +
      "border-radius:8px;padding:14px 16px;width:620px;max-width:92%;" +
      "max-height:80%;overflow-y:auto;display:flex;flex-direction:column;gap:10px;",
  );
  panel.append(
    el(doc, "div", "font-size:14px;font-weight:600;", tr("orphanTitle")),
    el(doc, "div", `font-size:12px;color:${t.sub};`, tr("orphanHint")),
  );

  const nums = numbering(s.roots);
  const heads = flatten(s.roots).map(({ node, depth }) => ({
    node,
    label: `${nums.get(node.id)}  ${node.title}`,
    depth,
  }));
  const scope = () => treeWorkIDs(s.libraryID, s.collectionKey);

  for (const o of s.orphans) {
    const row = el(doc, "div", "display:flex;gap:8px;align-items:center;");
    row.dataset.orphan = o.tag;
    let chosen: OutlineNode | null = null;
    const pick = button(doc, t, tr("orphanPick"), "", () => {
      menu.style.display = menu.style.display === "none" ? "block" : "none";
      const r = pick.getBoundingClientRect();
      menu.style.left = `${r.left}px`;
      menu.style.top = `${r.bottom + 2}px`;
    });
    pick.style.maxWidth = "220px";
    const assignBtn = button(doc, t, tr("orphanAssign"), "", () => {
      if (!chosen) return;
      const target = headingTag(chosen.title);
      void (async () => {
        await OutlineModel.renameTag(s.libraryID, o.tag, target, scope());
        await reload(ctx);
      })();
    });
    assignBtn.dataset.action = "assign";
    // a plain <select> does not open its popup in this window → custom menu
    const menu = el(
      doc,
      "div",
      `position:fixed;z-index:60;display:none;min-width:240px;max-height:260px;` +
        `overflow-y:auto;background:${t.panel};color:${t.text};` +
        `border:1px solid ${t.border};border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.25);`,
    );
    menu.dataset.menu = "1";
    for (const h of heads) {
      const item = el(
        doc,
        "div",
        `padding:5px 10px 5px ${10 + h.depth * 14}px;cursor:pointer;white-space:nowrap;`,
        h.label,
      );
      item.dataset.value = h.node.id;
      item.addEventListener(
        "mouseenter",
        () => (item.style.background = t.hover),
      );
      item.addEventListener(
        "mouseleave",
        () => (item.style.background = "transparent"),
      );
      item.addEventListener("click", () => {
        chosen = h.node;
        pick.textContent = h.node.title;
        menu.style.display = "none";
      });
      menu.appendChild(item);
    }
    const remove = button(doc, t, tr("orphanRemove"), "", () => {
      const ok = ctx.confirm(
        doc.defaultView,
        tr("orphanTitle"),
        tr("orphanRemoveConfirm")
          .replace("{tag}", o.tag)
          .replace("{n}", String(o.count)),
      );
      if (!ok) return;
      void (async () => {
        await OutlineModel.purgeTag(s.libraryID, o.tag, scope());
        await reload(ctx);
      })();
    });
    row.append(
      el(
        doc,
        "span",
        "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;",
        o.tag,
      ),
      el(doc, "span", `color:${t.sub};font-size:11px;`, `${o.count}×`),
      pick,
      menu,
      assignBtn,
      remove,
    );
    panel.appendChild(row);
  }
  panel.appendChild(button(doc, t, tr("orphanClose"), "", close));
  back.appendChild(panel);
  return back;
}
