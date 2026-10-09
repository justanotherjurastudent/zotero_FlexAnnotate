/**
 * Layout of the organizer window: tab bar on top, the three columns below.
 * Scroll positions of the columns survive every re-render.
 */

import { prune } from "../../core/selection";
import { el } from "./organizerDom";
import { renderDetails } from "./organizerDetails";
import { renderList } from "./organizerList";
import { tabBar } from "./organizerTabs";
import { renderTree } from "./organizerTree";
import { Ctx, State, visibleRows } from "./organizerState";
import { getTheme } from "./theme";

export function renderAll(ctx: Ctx) {
  const { doc, root, s } = ctx;
  const t = getTheme(doc);
  // keep scroll positions across re-renders
  const scroll = new Map<string, number>();
  root
    .querySelectorAll("[data-scroll]")
    .forEach((e: Element) =>
      scroll.set(e.getAttribute("data-scroll")!, (e as HTMLElement).scrollTop),
    );
  root.textContent = "";

  root.appendChild(tabBar(ctx, t));
  const body = el(
    doc,
    "div",
    "display:grid;grid-template-columns:300px minmax(300px,1fr) 360px;" +
      "flex:1;min-height:0;gap:0;",
  );
  root.appendChild(body);
  const col = (name: string, extra = "") => {
    const c = el(
      doc,
      "div",
      `display:flex;flex-direction:column;min-height:0;min-width:0;` +
        `border-right:1px solid ${t.border};${extra}`,
    );
    c.dataset.col = name;
    return c;
  };
  const c1 = col("tree");
  const c2 = col("list");
  const c3 = col("details", "border-right:none;");
  body.append(c1, c2, c3);

  const visible = visibleRows(s);
  s.sel = prune(
    s.sel,
    visible.map((r) => r.id),
  );
  renderTree(ctx, c1, t);
  renderList(ctx, c2, t, visible);
  renderDetails(ctx, c3, t, visible);

  root.querySelectorAll("[data-scroll]").forEach((e: Element) => {
    const y = scroll.get(e.getAttribute("data-scroll")!);
    if (y) (e as HTMLElement).scrollTop = y;
  });
}

/** Context for the panels; `render` redraws the whole window. */
export function makeCtx(
  doc: Document,
  root: HTMLElement,
  s: State,
  confirm: Ctx["confirm"],
): Ctx {
  const ctx: Ctx = { doc, root, s, render: () => renderAll(ctx), confirm };
  return ctx;
}
