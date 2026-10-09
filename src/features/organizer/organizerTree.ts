/**
 * Column 1 of the organizer: the outline tree with its toolbar, the "(Alle)" and
 * "(Ohne Kategorie)" entries, inline rename, deletion and drop targets.
 */

import {
  flatten,
  headingTag,
  indent,
  itemsUnder,
  locate,
  makeNode,
  moveDown,
  moveUp,
  numbering,
  OutlineNode,
  outdent,
  removeNode,
  subtreeTags,
  titleError,
  unassignedItems,
} from "../../core/outline";
import { OutlineModel } from "./outlineModel";
import { exportNote } from "./organizerExport";
import { assign } from "./organizerFiling";
import { button, DND_TYPE, el, iconButton, input, toast } from "./organizerDom";
import { Ctx, NodeSel, persist, reload } from "./organizerState";
import { Palette } from "./theme";
import { tr } from "./strings";

const DOUBLE_CLICK_MS = 450;

export function renderTree(ctx: Ctx, c: HTMLElement, t: Palette) {
  const { doc, s } = ctx;
  const rerender = () => ctx.render();
  const save = async () => {
    await persist(s);
    rerender();
  };

  const bar = el(
    doc,
    "div",
    `display:flex;gap:3px;flex-wrap:wrap;padding:6px;border-bottom:1px solid ${t.border};`,
  );
  const selNode =
    s.node !== "all" && s.node !== "none" ? locate(s.roots, s.node) : null;
  const add = (child: boolean) => {
    const node = makeNode(uniqueTitle(s.roots));
    if (child && selNode) selNode.node.children.push(node);
    else if (selNode) selNode.siblings.splice(selNode.index + 1, 0, node);
    else s.roots.push(node);
    s.node = node.id;
    s.renaming = node.id;
    rerender();
  };
  const act = (fn: (roots: OutlineNode[], id: string) => boolean) => () => {
    if (selNode && fn(s.roots, s.node)) void save();
  };
  const sep = () =>
    el(doc, "span", `width:1px;background:${t.border};margin:2px 3px;`);
  bar.append(
    iconButton(doc, t, "add", tr("addHeading"), () => add(false)),
    iconButton(doc, t, "addSub", tr("addSub"), () => add(true)),
    sep(),
    iconButton(doc, t, "up", tr("up"), act(moveUp)),
    iconButton(doc, t, "down", tr("down"), act(moveDown)),
    iconButton(doc, t, "outdent", tr("outdent"), act(outdent)),
    iconButton(doc, t, "indent", tr("indent"), act(indent)),
    sep(),
    iconButton(doc, t, "rename", tr("rename"), () => {
      if (selNode) {
        s.renaming = s.node;
        rerender();
      }
    }),
    iconButton(doc, t, "delete", tr("delete"), () => {
      if (selNode) void deleteNode(ctx);
    }),
  );
  c.appendChild(bar);

  const list = el(doc, "div", "flex:1;overflow-y:auto;padding:0 4px 8px;");
  list.dataset.scroll = "tree";
  const goto = input(doc, t, tr("goto"));
  goto.style.margin = "6px";
  goto.value = s.goto;
  goto.addEventListener("input", () => {
    s.goto = goto.value;
    renderTreeList(ctx, list, t);
  });
  c.appendChild(goto);
  c.appendChild(list);
  renderTreeList(ctx, list, t);

  const foot = el(
    doc,
    "div",
    `border-top:1px solid ${t.border};padding:6px;display:flex;flex-direction:column;gap:4px;`,
  );
  foot.append(
    button(
      doc,
      t,
      tr("export"),
      tr("exportTitle"),
      () => void exportNote(s),
      "export",
    ),
    el(doc, "span", `font-size:11px;color:${t.sub};`, tr("exportHint")),
  );
  c.appendChild(foot);
}

function uniqueTitle(roots: OutlineNode[]): string {
  let n = 1;
  let title = tr("newHeading");
  while (titleError(roots, title)) title = `${tr("newHeading")} ${++n}`;
  return title;
}

/** Label and count of a normal (not renaming) tree row. */
function fillTreeRow(
  doc: Document,
  d: HTMLElement,
  node: OutlineNode,
  num: string,
  count: number,
  t: Palette,
) {
  d.textContent = "";
  const label = el(
    doc,
    "span",
    "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
    `${num}  ${node.title}`,
  );
  label.title = node.title;
  d.append(
    label,
    el(doc, "span", `color:${t.sub};font-size:11px;flex:none;`, String(count)),
  );
}

function renderTreeList(ctx: Ctx, list: HTMLElement, t: Palette) {
  const { doc, s } = ctx;
  list.textContent = "";
  const nums = numbering(s.roots);
  const rows = s.rows;

  const pseudo = (key: NodeSel, label: string, count: number) => {
    const on = s.node === key;
    const d = el(
      doc,
      "div",
      `padding:5px 8px;cursor:pointer;border-radius:4px;margin:1px 0;` +
        `background:${on ? t.chipBg : "transparent"};font-weight:${on ? 600 : 400};` +
        "display:flex;justify-content:space-between;gap:6px;",
    );
    d.append(
      el(doc, "span", "", label),
      el(doc, "span", `color:${t.sub};font-size:11px;`, String(count)),
    );
    d.addEventListener("click", () => {
      s.node = key;
      ctx.render();
    });
    list.appendChild(d);
  };
  pseudo("all", tr("all"), rows.length);
  pseudo("none", tr("none"), unassignedItems(s.roots, rows).length);

  const gq = s.goto.trim().toLowerCase();
  const keep = new Set<string>();
  if (gq) {
    for (const { node } of flatten(s.roots)) {
      if (!node.title.toLowerCase().includes(gq)) continue;
      keep.add(node.id);
      let p = locate(s.roots, node.id)?.parent ?? null;
      while (p) {
        keep.add(p.id);
        p = locate(s.roots, p.id)?.parent ?? null;
      }
    }
  }

  for (const { node, depth } of flatten(s.roots)) {
    if (gq && !keep.has(node.id)) continue;
    const on = s.node === node.id;
    const d = el(
      doc,
      "div",
      `padding:5px 8px 5px ${8 + depth * 16}px;cursor:pointer;border-radius:4px;` +
        `margin:1px 0;background:${on ? t.chipBg : "transparent"};` +
        `font-weight:${on ? 600 : 400};display:flex;justify-content:space-between;gap:6px;` +
        "border:1px solid transparent;",
    );
    d.dataset.nodeId = node.id;
    const num = nums.get(node.id) ?? "";
    const count = itemsUnder(node, rows, true).length;
    if (s.renaming === node.id) {
      renameRow(ctx, d, node, t, num, count);
      list.appendChild(d);
      continue;
    }
    fillTreeRow(doc, d, node, num, count, t);
    // Selecting re-renders the tree, so a native dblclick would be lost:
    // detect the second click on the same heading ourselves.
    d.addEventListener("click", () => {
      const now = Date.now();
      const last = s.lastTreeClick;
      s.lastTreeClick = { id: node.id, t: now };
      s.node = node.id;
      if (last && last.id === node.id && now - last.t < DOUBLE_CLICK_MS) {
        s.lastTreeClick = null;
        s.renaming = node.id;
      }
      ctx.render();
    });
    d.addEventListener("dragover", (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes(DND_TYPE)) return;
      e.preventDefault();
      d.style.borderColor = t.accent;
    });
    d.addEventListener(
      "dragleave",
      () => (d.style.borderColor = "transparent"),
    );
    d.addEventListener("drop", (e: DragEvent) => {
      e.preventDefault();
      d.style.borderColor = "transparent";
      const raw = e.dataTransfer?.getData(DND_TYPE);
      if (raw) void assign(ctx, JSON.parse(raw) as number[], node);
    });
    list.appendChild(d);
  }
}

/**
 * Inline rename. Enter saves, Escape cancels, and leaving the field (clicking
 * elsewhere) saves a valid change or quietly restores the row. A blur only
 * patches this one row, so the click that caused it still reaches its target.
 */
function renameRow(
  ctx: Ctx,
  d: HTMLElement,
  node: OutlineNode,
  t: Palette,
  num: string,
  count: number,
) {
  const { doc, s } = ctx;
  const i = input(doc, t, "");
  i.style.flex = "1";
  i.value = node.title;
  let finished = false;
  const finish = async (mode: "commit" | "cancel" | "blur") => {
    if (finished) return;
    finished = true;
    s.endRename = null;
    const next = i.value.trim();
    let changed = mode !== "cancel" && next !== node.title;
    if (changed) {
      const err = titleError(s.roots, next, node.id);
      if (err) {
        toast(err, "error");
        changed = false;
      }
    }
    s.renaming = null;
    if (changed) {
      const old = headingTag(node.title);
      node.title = next;
      await OutlineModel.renameTag(s.libraryID, old, headingTag(next));
      await persist(s);
      await reload(ctx);
    } else if (mode === "blur") {
      fillTreeRow(doc, d, node, num, count, t);
    } else {
      ctx.render();
    }
  };
  i.addEventListener("keydown", (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") void finish("commit");
    if (e.key === "Escape") void finish("cancel");
  });
  i.addEventListener("blur", () => void finish("blur"));
  i.dataset.rename = "1";
  s.endRename = () => void finish("blur");
  d.append(el(doc, "span", `color:${t.sub};`, num), i);
  setTimeout(() => {
    i.focus();
    i.select();
  }, 0);
}

export async function deleteNode(ctx: Ctx) {
  const { doc, s } = ctx;
  const loc = locate(s.roots, s.node);
  if (!loc) return;
  const tags = subtreeTags(loc.node);
  const ok = ctx.confirm(
    doc.defaultView,
    tr("deleteTitle"),
    tr("deleteConfirm")
      .replace("{n}", String(tags.length))
      .replace("{title}", loc.node.title),
  );
  if (!ok) return;
  for (const tag of tags) await OutlineModel.purgeTag(s.libraryID, tag);
  removeNode(s.roots, s.node);
  s.node = "all";
  await persist(s);
  await reload(ctx);
}
