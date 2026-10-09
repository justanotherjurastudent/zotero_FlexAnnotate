/**
 * Column 3 of the organizer: details of the selected row (quote, comment,
 * source, categories and actions), or a hint and select-all for the selection.
 */

import { HEADING_PREFIX, numbering, tagIndex } from "../../core/outline";
import { selectAll } from "../../core/selection";
import { openRow } from "./openTarget";
import { citationOfRow, Row } from "./organizerData";
import { button, el, toast } from "./organizerDom";
import { unassign } from "./organizerFiling";
import { renderEditForm } from "./organizerEdit";
import { Ctx, placeOf } from "./organizerState";
import { Palette } from "./theme";
import { tr } from "./strings";

// column 3 -------------------------------------------------------------------

export function renderDetails(
  ctx: Ctx,
  c: HTMLElement,
  t: Palette,
  visible: Row[],
) {
  const { doc, s } = ctx;
  const box = el(
    doc,
    "div",
    "flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;",
  );
  box.dataset.scroll = "details";
  c.appendChild(box);
  const picked = visible.filter((r) => s.sel.selected.has(r.id));
  if (!picked.length) {
    box.appendChild(el(doc, "div", `color:${t.sub};`, tr("pickHint")));
    if (visible.length) {
      box.appendChild(
        button(doc, t, tr("selectAll"), "Ctrl+A", () => {
          s.sel = selectAll([...new Set(visible.map((r) => r.id))]);
          ctx.render();
        }),
      );
    }
    return;
  }
  if (picked.length > 1) {
    box.appendChild(
      el(
        doc,
        "div",
        "font-weight:600;",
        tr("selected").replace("{n}", String(picked.length)),
      ),
    );
    return;
  }
  const r = picked[0];
  if (s.editing === r.id && r.kind === "annotation") {
    renderEditForm(ctx, box, t, r);
    return;
  }
  if (r.kind === "annotation" && r.text) {
    box.appendChild(
      el(
        doc,
        "blockquote",
        `margin:0;padding:6px 10px;border-left:4px solid ${r.color || t.border};` +
          "white-space:pre-wrap;line-height:1.45;",
        r.text,
      ),
    );
  } else if (r.kind === "work") {
    box.appendChild(el(doc, "div", "font-weight:600;line-height:1.4;", r.text));
  }
  if (r.comment) {
    box.appendChild(
      el(
        doc,
        "div",
        `white-space:pre-wrap;color:${t.sub};font-style:italic;`,
        r.comment,
      ),
    );
  }
  const cite = citationOfRow(r);
  const sourceText = [cite, placeOf(r)].filter(Boolean).join(", ");
  const src = el(
    doc,
    "div",
    `border-top:1px solid ${t.border};padding-top:8px;font-size:12px;`,
  );
  src.append(
    el(
      doc,
      "div",
      `color:${t.sub};font-size:11px;margin-bottom:2px;`,
      tr("source"),
    ),
    el(doc, "div", "", sourceText),
  );
  box.appendChild(src);

  const nums = numbering(s.roots);
  const known = tagIndex(s.roots);
  const cats = el(doc, "div", "display:flex;flex-wrap:wrap;gap:4px;");
  for (const tag of r.tags.filter((x) => x.startsWith(HEADING_PREFIX))) {
    const n = known.get(tag);
    const chip = el(
      doc,
      "span",
      `background:${t.chipBg};border:1px solid ${t.chipBorder};border-radius:10px;` +
        "padding:2px 8px;font-size:11px;display:inline-flex;gap:6px;",
      n ? `${nums.get(n.id)}  ${n.title}` : tag,
    );
    if (n && !r.readOnly) {
      const x = el(doc, "span", "cursor:pointer;", "✕");
      x.addEventListener("click", () => void unassign(ctx, [r.id], n));
      chip.appendChild(x);
    }
    cats.appendChild(chip);
  }
  box.append(
    el(doc, "div", `color:${t.sub};font-size:11px;`, tr("categories")),
    cats,
  );

  const actions = el(
    doc,
    "div",
    "display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;",
  );
  actions.append(
    button(doc, t, tr("open"), "", () => void openRow(r)),
    button(doc, t, tr("copy"), "", () => {
      const text = [r.text && `„${r.text.trim()}“`, r.comment, sourceText]
        .filter(Boolean)
        .join("\n");
      new ztoolkit.Clipboard().addText(text, "text/unicode").copy();
      toast(tr("copied"));
    }),
  );
  if (r.kind === "annotation" && !r.readOnly) {
    actions.appendChild(
      button(doc, t, tr("edit"), "", () => {
        s.editing = r.id;
        ctx.render();
      }),
    );
  }
  box.appendChild(actions);
}
