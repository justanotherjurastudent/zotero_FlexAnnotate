/**
 * Column 2 of the organizer: the row list with search, the permanent assign
 * bar (quick filing under a heading), sections and multi-selection.
 */

import {
  flatten,
  groupByOutline,
  locate,
  numbering,
  OutlineNode,
} from "../../core/outline";
import { applyClick, dragIds } from "../../core/selection";
import { openRow } from "./openTarget";
import { Row } from "./organizerData";
import { button, DND_TYPE, el, input } from "./organizerDom";
import { assign, unassign } from "./organizerFiling";
import { Ctx, placeOf, State } from "./organizerState";
import { Palette } from "./theme";
import { tr } from "./strings";

// column 2 -------------------------------------------------------------------

export function renderList(
  ctx: Ctx,
  c: HTMLElement,
  t: Palette,
  visible: Row[],
) {
  const { doc, s } = ctx;
  // Permanent top area: search + assign bar. Nothing here scrolls away, so
  // adding more rows to a heading never needs a trip to the bottom.
  const top = el(
    doc,
    "div",
    `display:flex;flex-direction:column;gap:6px;padding:6px;` +
      `border-bottom:1px solid ${t.border};flex:0 0 auto;`,
  );
  const search = input(doc, t, tr("search"));
  search.style.width = "100%";
  search.style.boxSizing = "border-box";
  search.value = s.query;
  search.addEventListener("input", () => {
    s.query = search.value;
    s.focusSearch = true;
    ctx.render();
  });
  top.appendChild(search);
  if (s.focusSearch) {
    s.focusSearch = false;
    setTimeout(() => {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }, 0);
  }

  top.appendChild(assignBar(ctx, t));

  const opts = el(
    doc,
    "div",
    `display:flex;gap:12px;align-items:center;color:${t.sub};font-size:12px;`,
  );
  const cb = el(doc, "input");
  cb.type = "checkbox";
  cb.checked = s.sections;
  cb.addEventListener("change", () => {
    s.sections = cb.checked;
    ctx.render();
  });
  const lab = el(
    doc,
    "label",
    "display:flex;gap:4px;align-items:center;cursor:pointer;",
  );
  lab.append(cb, el(doc, "span", "", tr("sections")));
  opts.append(
    lab,
    el(doc, "span", "", tr("shown").replace("{n}", String(visible.length))),
  );
  top.appendChild(opts);
  c.appendChild(top);

  const list = el(doc, "div", "flex:1;overflow-y:auto;min-height:0;");
  list.dataset.scroll = "list";
  c.appendChild(list);
  if (!visible.length) {
    list.appendChild(
      el(
        doc,
        "div",
        `padding:20px;color:${t.sub};text-align:center;`,
        tr("empty"),
      ),
    );
    return;
  }

  const order = [...new Set(visible.map((r) => r.id))];
  const byId = new Map(visible.map((r) => [r.id, r]));
  const addRows = (rows: Row[]) => {
    let lastWork = -1;
    for (const r of sortForWorks(s, rows)) {
      if (s.tab === "wissen" && s.showWorks && r.workID !== lastWork) {
        lastWork = r.workID;
        list.appendChild(
          el(
            doc,
            "div",
            `padding:5px 8px 2px 8px;font-size:11px;color:${t.sub};font-weight:600;` +
              "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
            `${r.workTitle}${r.byline ? " — " + r.byline : ""}`,
          ),
        );
      }
      list.appendChild(rowEl(ctx, t, r, order, byId));
    }
  };
  if (s.sections && s.node !== "none") {
    const nodeSel = s.node === "all" ? null : locate(s.roots, s.node)?.node;
    const allowed = nodeSel
      ? new Set(flatten([nodeSel]).map((f) => f.node.id))
      : null;
    const secs = groupByOutline(s.roots, visible).filter((sec) =>
      sec.node === null ? !allowed : !allowed || allowed.has(sec.node.id),
    );
    for (const sec of secs) {
      list.appendChild(
        el(
          doc,
          "div",
          `padding:6px 8px;background:${t.btnBg};font-weight:600;font-size:12px;` +
            `border-top:1px solid ${t.border};border-bottom:1px solid ${t.border};`,
          sec.node ? `${sec.number}  ${sec.node.title}` : tr("none"),
        ),
      );
      addRows(sec.items);
    }
  } else {
    addRows(visible);
  }
}

/** Selection counter + type-to-filter heading picker (quick assign). */
function assignBar(ctx: Ctx, t: Palette): HTMLElement {
  const { doc, s } = ctx;
  const bar = el(
    doc,
    "div",
    "display:flex;gap:6px;align-items:center;position:relative;",
  );
  bar.appendChild(
    el(
      doc,
      "span",
      `color:${t.sub};font-size:12px;white-space:nowrap;`,
      tr("selected").replace("{n}", String(s.sel.selected.size)),
    ),
  );
  const pick = input(doc, t, tr("assignTo"));
  pick.style.flex = "1";
  const menu = el(
    doc,
    "div",
    `position:absolute;top:30px;left:70px;right:0;z-index:5;display:none;max-height:240px;` +
      `overflow-y:auto;background:${t.panel};border:1px solid ${t.border};border-radius:4px;`,
  );
  const matches = () => {
    const q = pick.value.trim().toLowerCase();
    const nums = numbering(s.roots);
    return flatten(s.roots)
      .filter(({ node }) =>
        `${nums.get(node.id)} ${node.title}`.toLowerCase().includes(q),
      )
      .map(({ node }) => ({
        node,
        label: `${nums.get(node.id)}  ${node.title}`,
      }));
  };
  const choose = (node: OutlineNode) => {
    menu.style.display = "none";
    pick.value = "";
    if (s.sel.selected.size) void assign(ctx, [...s.sel.selected], node);
  };
  const fill = () => {
    menu.textContent = "";
    const m = matches();
    for (const { node, label } of m.slice(0, 40)) {
      const o = el(doc, "div", "padding:5px 8px;cursor:pointer;", label);
      o.addEventListener("mouseenter", () => (o.style.background = t.hover));
      o.addEventListener(
        "mouseleave",
        () => (o.style.background = "transparent"),
      );
      o.addEventListener("mousedown", (e) => {
        e.preventDefault();
        choose(node);
      });
      menu.appendChild(o);
    }
    menu.style.display = m.length ? "block" : "none";
  };
  pick.addEventListener("input", fill);
  pick.addEventListener("focus", fill);
  pick.addEventListener("blur", () => (menu.style.display = "none"));
  pick.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      const first = matches()[0];
      if (first) choose(first.node);
    }
    if (e.key === "Escape") menu.style.display = "none";
  });
  bar.append(pick, menu);
  const cur =
    s.node !== "all" && s.node !== "none"
      ? locate(s.roots, s.node)?.node
      : null;
  if (cur) {
    bar.appendChild(
      button(
        doc,
        t,
        tr("removeFromCategory"),
        tr("removeFromCategoryTitle"),
        () => void unassign(ctx, [...s.sel.selected], cur),
      ),
    );
  }
  return bar;
}

function sortForWorks(s: State, rows: Row[]): Row[] {
  if (s.tab !== "wissen" || !s.showWorks) return rows;
  return [...rows].sort(
    (a, b) => a.workTitle.localeCompare(b.workTitle) || a.workID - b.workID,
  );
}

function rowEl(
  ctx: Ctx,
  t: Palette,
  r: Row,
  order: number[],
  byId: Map<number, Row>,
): HTMLElement {
  const { doc, s } = ctx;
  const on = s.sel.selected.has(r.id);
  const d = el(
    doc,
    "div",
    `display:flex;align-items:center;gap:8px;height:26px;padding:0 8px;cursor:default;` +
      `background:${on ? t.chipBg : "transparent"};border-bottom:1px solid ${t.border}33;` +
      `user-select:none;${r.readOnly ? "opacity:.6;" : ""}`,
  );
  d.draggable = true;
  d.dataset.rowId = String(r.id);
  const icon = el(
    doc,
    "span",
    `flex:none;width:10px;height:10px;border-radius:2px;background:${
      r.color || t.border
    };`,
  );
  icon.title = r.type;
  const text = el(
    doc,
    "span",
    "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
    (r.text || r.comment || r.workTitle).replace(/\s+/g, " "),
  );
  text.title = r.text;
  const meta = el(
    doc,
    "span",
    `flex:none;color:${t.sub};font-size:11px;max-width:150px;overflow:hidden;` +
      "text-overflow:ellipsis;white-space:nowrap;",
    [
      s.tab === "wissen" && !s.showWorks
        ? r.byline
        : s.tab === "titel"
          ? r.byline
          : "",
      placeOf(r),
    ]
      .filter(Boolean)
      .join(" · "),
  );
  d.append(icon, text);
  if (r.comment && r.kind === "annotation") {
    const bubble = el(doc, "span", `flex:none;font-size:11px;`, "💬");
    bubble.title = r.comment;
    d.appendChild(bubble);
  }
  d.appendChild(meta);
  d.addEventListener("click", (e: MouseEvent) => {
    s.sel = applyClick(s.sel, order, r.id, {
      ctrl: e.ctrlKey || e.metaKey,
      shift: e.shiftKey,
    });
    s.editing = null;
    ctx.render();
  });
  d.addEventListener("dblclick", () => void openRow(r));
  d.addEventListener("dragstart", (e: DragEvent) => {
    const ids = dragIds(s.sel, r.id).filter((i) => !byId.get(i)?.readOnly);
    e.dataTransfer?.setData(DND_TYPE, JSON.stringify(ids));
    e.dataTransfer?.setData("text/plain", `${ids.length}`);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
  });
  return d;
}
