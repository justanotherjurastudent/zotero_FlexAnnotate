/**
 * organizer — the three-column Annotree window.
 *
 *   column 1: outline tree with "(Alle)" and "(Ohne Kategorie)"
 *   column 2: one-line rows (annotations or works) with a permanent assign bar
 *   column 3: details of the selected row, incl. citation and categories
 *
 * Two tabs like Citavi: "Wissen" (annotations) and "Titel" (works). Rows are
 * filed under a heading by multi-select + assign bar, or by drag and drop onto
 * a tree node. A heading is a Zotero tag; the tree lives in the outline note.
 *
 * Derived from Lattice's outlinePanel (birugit, AGPL-3.0-or-later).
 */

import {
  flatten,
  groupByOutline,
  HEADING_PREFIX,
  headingTag,
  indent,
  itemsUnder,
  locate,
  makeNode,
  moveDown,
  moveUp,
  numbering,
  outdent,
  OutlineNode,
  removeNode,
  subtreeTags,
  tagIndex,
  titleError,
  unassignedItems,
} from "../core/outline";
import {
  applyClick,
  dragIds,
  emptySelection,
  prune,
  selectAll,
  SelectionState,
} from "../core/selection";
import { OutlineModel } from "./outlineModel";
import {
  citationOfRow,
  fileMany,
  loadAnnotationRows,
  readShowWorks,
  loadWorkRows,
  Row,
  unfileMany,
} from "./organizerData";
import { gatherAll, saveDraftAsNote } from "./outlineExport";
import { getTheme, Palette } from "./theme";
import { getString } from "../utils/locale";
import { registerPluginMenu } from "../utils/menu";
import { tr } from "../utils/strings";

const HTML_NS = "http://www.w3.org/1999/xhtml";
const DND_TYPE = "text/x-annotree-ids";

type Tab = "wissen" | "titel";
type NodeSel = "all" | "none" | string;

interface State {
  libraryID: number;
  noteID: number | null;
  roots: OutlineNode[];
  tab: Tab;
  rows: Row[];
  sel: SelectionState;
  node: NodeSel;
  query: string;
  goto: string;
  sections: boolean;
  /** Plugin setting: show the works behind the annotations. */
  showWorks: boolean;
  renaming: string | null;
  /** Re-focus the search box after a re-render. */
  focusSearch: boolean;
}

function el<K extends keyof HTMLElementTagNameMap>(
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

function button(
  doc: Document,
  t: Palette,
  label: string,
  title: string,
  onClick: () => void,
  wide = true,
): HTMLButtonElement {
  const b = el(
    doc,
    "button",
    `appearance:none;-moz-appearance:none;color:${t.text};cursor:pointer;` +
      `border:1px solid ${t.border};border-radius:4px;background:${t.btnBg};` +
      `font-size:12px;line-height:1;padding:${wide ? "5px 9px" : "4px 0"};` +
      (wide ? "" : "width:24px;"),
    label,
  );
  b.title = title;
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

function input(
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

function toast(text: string, type = "success") {
  new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: 2500,
  })
    .createLine({ text, type, progress: 100 })
    .show();
}

export class OrganizerFactory {
  static registerMenu() {
    registerPluginMenu({
      menuID: "zotero-tools-annotree-organizer",
      target: "main/menubar/tools",
      l10nID: "outline-menu-label",
      icon: `chrome://${addon.data.config.addonRef}/content/icons/favicon@0.5x.png`,
      onCommand: () => {
        OrganizerFactory.open().catch((e) =>
          ztoolkit.log("annotree organizer open failed:", e),
        );
      },
    });
  }

  static async open() {
    const dialog = new ztoolkit.Dialog(1, 1).addCell(0, 0, {
      tag: "div",
      id: "annotree-root",
      styles: {
        width: "calc(100vw - 24px)",
        height: "calc(100vh - 64px)",
        display: "flex",
        flexDirection: "column",
        fontSize: "13px",
      },
    });
    dialog.setDialogData({
      loadCallback: () => {
        try {
          const doc = dialog.window.document;
          const root = doc.getElementById("annotree-root") as HTMLElement;
          if (root) void this.mount(doc, root, Zotero.Libraries.userLibraryID);
        } catch (e) {
          ztoolkit.log("annotree organizer build failed:", e);
        }
      },
    });
    dialog.open(getString("outline-window-title"), {
      width: 1240,
      height: 760,
      resizable: true,
    });
  }

  // ── data ───────────────────────────────────────────────────────────────────

  private static async mount(
    doc: Document,
    root: HTMLElement,
    libraryID: number,
  ) {
    const t = getTheme(doc);
    (root.style as any).colorScheme = t.colorScheme;
    root.style.background = t.bg;
    root.style.color = t.text;
    root.textContent = tr("loading");
    const loaded = await OutlineModel.load(libraryID);
    const state: State = {
      libraryID,
      noteID: loaded.noteID,
      roots: loaded.roots,
      tab: "wissen",
      rows: await loadAnnotationRows(libraryID),
      sel: emptySelection(),
      node: "all",
      query: "",
      goto: "",
      sections: false,
      showWorks: readShowWorks(),
      renaming: null,
      focusSearch: false,
    };
    this.render(doc, root, state);
  }

  private static async reload(doc: Document, root: HTMLElement, s: State) {
    s.rows =
      s.tab === "wissen"
        ? await loadAnnotationRows(s.libraryID)
        : await loadWorkRows(s.libraryID);
    s.sel = emptySelection();
    s.showWorks = readShowWorks();
    this.render(doc, root, s);
  }

  private static async persist(s: State) {
    s.noteID = await OutlineModel.save(s.libraryID, s.noteID, s.roots);
  }

  // ── derived view ───────────────────────────────────────────────────────────

  /** Rows of the current node, after the keyword filter. */
  private static visible(s: State): Row[] {
    let rows = s.rows;
    if (s.node === "none") rows = unassignedItems(s.roots, rows);
    else if (s.node !== "all") {
      const n = locate(s.roots, s.node)?.node;
      rows = n ? itemsUnder(n, rows, true) : [];
    }
    const q = s.query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.text}\n${r.comment}\n${r.workTitle}\n${r.byline}`
        .toLowerCase()
        .includes(q),
    );
  }

  // ── rendering ──────────────────────────────────────────────────────────────

  private static render(doc: Document, root: HTMLElement, s: State) {
    const t = getTheme(doc);
    root.textContent = "";

    root.appendChild(this.tabBar(doc, root, s, t));
    const body = el(
      doc,
      "div",
      "display:grid;grid-template-columns:270px minmax(300px,1fr) 340px;" +
        "flex:1;min-height:0;gap:0;",
    );
    root.appendChild(body);
    const col = (extra = "") =>
      el(
        doc,
        "div",
        `display:flex;flex-direction:column;min-height:0;min-width:0;` +
          `border-right:1px solid ${t.border};${extra}`,
      );
    const c1 = col();
    const c2 = col();
    const c3 = col("border-right:none;");
    body.append(c1, c2, c3);

    const visible = this.visible(s);
    s.sel = prune(
      s.sel,
      visible.map((r) => r.id),
    );
    this.renderTree(doc, root, c1, s, t);
    this.renderList(doc, root, c2, s, t, visible);
    this.renderDetails(doc, root, c3, s, t, visible);
  }

  private static tabBar(
    doc: Document,
    root: HTMLElement,
    s: State,
    t: Palette,
  ): HTMLElement {
    const bar = el(
      doc,
      "div",
      `display:flex;gap:4px;align-items:flex-end;border-bottom:2px solid ${t.border};` +
        "flex:0 0 auto;padding:0 4px;",
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
        void this.reload(doc, root, s);
      });
      bar.appendChild(d);
    };
    mk("wissen", tr("tabKnowledge"));
    mk("titel", tr("tabTitles"));
    return bar;
  }

  // column 1 -------------------------------------------------------------------

  private static renderTree(
    doc: Document,
    root: HTMLElement,
    c: HTMLElement,
    s: State,
    t: Palette,
  ) {
    const rerender = () => this.render(doc, root, s);
    const save = async () => {
      await this.persist(s);
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
      const node = makeNode(this.uniqueTitle(s.roots));
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
    bar.append(
      button(doc, t, "＋", tr("addHeading"), () => add(false), false),
      button(doc, t, "↳", tr("addSub"), () => add(true), false),
      button(doc, t, "↑", tr("up"), act(moveUp), false),
      button(doc, t, "↓", tr("down"), act(moveDown), false),
      button(doc, t, "→", tr("indent"), act(indent), false),
      button(doc, t, "←", tr("outdent"), act(outdent), false),
      button(
        doc,
        t,
        "✎",
        tr("rename"),
        () => {
          if (selNode) {
            s.renaming = s.node;
            rerender();
          }
        },
        false,
      ),
      button(
        doc,
        t,
        "🗑",
        tr("delete"),
        () => {
          if (selNode) void this.deleteNode(doc, root, s);
        },
        false,
      ),
    );
    c.appendChild(bar);

    const list = el(doc, "div", "flex:1;overflow-y:auto;padding:0 4px 8px;");
    const goto = input(doc, t, tr("goto"));
    goto.style.margin = "6px";
    goto.value = s.goto;
    goto.addEventListener("input", () => {
      s.goto = goto.value;
      this.renderTreeList(doc, root, list, s, t);
    });
    c.appendChild(goto);
    c.appendChild(list);
    this.renderTreeList(doc, root, list, s, t);

    const foot = el(
      doc,
      "div",
      `border-top:1px solid ${t.border};padding:6px;display:flex;gap:6px;`,
    );
    foot.appendChild(
      button(doc, t, tr("draft"), tr("draftTitle"), () => {
        void (async () => {
          const g = await gatherAll(s.libraryID, s.roots);
          await saveDraftAsNote(s.roots, g, s.libraryID, {
            title: "Annotree",
          });
          toast(tr("draftSaved"));
        })();
      }),
    );
    c.appendChild(foot);
  }

  private static uniqueTitle(roots: OutlineNode[]): string {
    let n = 1;
    let title = tr("newHeading");
    while (titleError(roots, title)) title = `${tr("newHeading")} ${++n}`;
    return title;
  }

  private static renderTreeList(
    doc: Document,
    root: HTMLElement,
    list: HTMLElement,
    s: State,
    t: Palette,
  ) {
    list.textContent = "";
    const nums = numbering(s.roots);
    const rows = s.rows;

    const pseudo = (key: NodeSel, label: string, count: number) => {
      const on = s.node === key;
      const d = el(
        doc,
        "div",
        `padding:5px 8px;cursor:pointer;border-radius:4px;margin:1px 0;` +
          `background:${on ? t.hover : "transparent"};font-weight:${on ? 600 : 400};` +
          "display:flex;justify-content:space-between;gap:6px;",
      );
      d.append(
        el(doc, "span", "", label),
        el(doc, "span", `color:${t.sub};font-size:11px;`, String(count)),
      );
      d.addEventListener("click", () => {
        s.node = key;
        this.render(doc, root, s);
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
          `margin:1px 0;background:${on ? t.hover : "transparent"};` +
          `font-weight:${on ? 600 : 400};display:flex;justify-content:space-between;gap:6px;` +
          "border:1px solid transparent;",
      );
      d.dataset.nodeId = node.id;
      if (s.renaming === node.id) {
        this.renameRow(doc, root, d, node, s, t, nums.get(node.id) ?? "");
        list.appendChild(d);
        continue;
      }
      const label = el(
        doc,
        "span",
        "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
        `${nums.get(node.id)}  ${node.title}`,
      );
      label.title = node.title;
      d.append(
        label,
        el(
          doc,
          "span",
          `color:${t.sub};font-size:11px;flex:none;`,
          String(itemsUnder(node, rows, true).length),
        ),
      );
      d.addEventListener("click", () => {
        s.node = node.id;
        this.render(doc, root, s);
      });
      d.addEventListener("dblclick", () => {
        s.renaming = node.id;
        this.render(doc, root, s);
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
        if (raw)
          void this.assign(doc, root, s, JSON.parse(raw) as number[], node);
      });
      list.appendChild(d);
    }
  }

  private static renameRow(
    doc: Document,
    root: HTMLElement,
    d: HTMLElement,
    node: OutlineNode,
    s: State,
    t: Palette,
    num: string,
  ) {
    const i = input(doc, t, "");
    i.style.flex = "1";
    i.value = node.title;
    const done = async () => {
      s.renaming = null;
      await this.persist(s);
      this.render(doc, root, s);
    };
    const commit = async () => {
      const next = i.value.trim();
      const err = titleError(s.roots, next, node.id);
      if (err) {
        toast(err, "error");
        return;
      }
      if (next !== node.title) {
        const old = headingTag(node.title);
        node.title = next;
        s.renaming = null;
        await OutlineModel.renameTag(s.libraryID, old, headingTag(next));
        await this.persist(s);
        await this.reload(doc, root, s);
        return;
      }
      await done();
    };
    i.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") void commit();
      if (e.key === "Escape") void done();
    });
    d.append(el(doc, "span", `color:${t.sub};`, num), i);
    setTimeout(() => {
      i.focus();
      i.select();
    }, 0);
  }

  private static async deleteNode(doc: Document, root: HTMLElement, s: State) {
    const loc = locate(s.roots, s.node);
    if (!loc) return;
    const tags = subtreeTags(loc.node);
    const ok = (Services as any).prompt.confirm(
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
    await this.persist(s);
    await this.reload(doc, root, s);
  }

  // filing -----------------------------------------------------------------------

  private static async assign(
    doc: Document,
    root: HTMLElement,
    s: State,
    ids: number[],
    node: OutlineNode,
  ) {
    const tag = headingTag(node.title);
    const changed = await fileMany(ids, tag);
    for (const r of s.rows)
      if (changed.includes(r.id)) r.tags = [...r.tags, tag];
    const skipped = ids.length - changed.length;
    toast(
      tr("assigned")
        .replace("{n}", String(changed.length))
        .replace("{title}", node.title) +
        (skipped ? ` ${tr("skipped").replace("{n}", String(skipped))}` : ""),
    );
    this.render(doc, root, s);
  }

  private static async unassign(
    doc: Document,
    root: HTMLElement,
    s: State,
    ids: number[],
    node: OutlineNode,
  ) {
    const tag = headingTag(node.title);
    const changed = await unfileMany(ids, tag);
    for (const r of s.rows)
      if (changed.includes(r.id)) r.tags = r.tags.filter((x) => x !== tag);
    this.render(doc, root, s);
  }

  // column 2 -------------------------------------------------------------------

  private static renderList(
    doc: Document,
    root: HTMLElement,
    c: HTMLElement,
    s: State,
    t: Palette,
    visible: Row[],
  ) {
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
      this.render(doc, root, s);
    });
    top.appendChild(search);
    if (s.focusSearch) {
      s.focusSearch = false;
      setTimeout(() => {
        search.focus();
        search.setSelectionRange(search.value.length, search.value.length);
      }, 0);
    }

    top.appendChild(this.assignBar(doc, root, s, t));

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
      this.render(doc, root, s);
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
      for (const r of this.sortForWorks(s, rows)) {
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
        list.appendChild(this.rowEl(doc, root, s, t, r, order, byId));
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
  private static assignBar(
    doc: Document,
    root: HTMLElement,
    s: State,
    t: Palette,
  ): HTMLElement {
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
      if (s.sel.selected.size)
        void this.assign(doc, root, s, [...s.sel.selected], node);
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
          () => void this.unassign(doc, root, s, [...s.sel.selected], cur),
        ),
      );
    }
    return bar;
  }

  private static sortForWorks(s: State, rows: Row[]): Row[] {
    if (s.tab !== "wissen" || !s.showWorks) return rows;
    return [...rows].sort(
      (a, b) => a.workTitle.localeCompare(b.workTitle) || a.workID - b.workID,
    );
  }

  private static rowEl(
    doc: Document,
    root: HTMLElement,
    s: State,
    t: Palette,
    r: Row,
    order: number[],
    byId: Map<number, Row>,
  ): HTMLElement {
    const on = s.sel.selected.has(r.id);
    const d = el(
      doc,
      "div",
      `display:flex;align-items:center;gap:8px;height:26px;padding:0 8px;cursor:default;` +
        `background:${on ? t.hover : "transparent"};border-bottom:1px solid ${t.border}33;` +
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
        r.pageLabel ? `S. ${r.pageLabel}` : "",
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
      this.render(doc, root, s);
    });
    d.addEventListener("dblclick", () => void this.openRow(r));
    d.addEventListener("dragstart", (e: DragEvent) => {
      const ids = dragIds(s.sel, r.id).filter((i) => !byId.get(i)?.readOnly);
      e.dataTransfer?.setData(DND_TYPE, JSON.stringify(ids));
      e.dataTransfer?.setData("text/plain", `${ids.length}`);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
    });
    return d;
  }

  // column 3 -------------------------------------------------------------------

  private static renderDetails(
    doc: Document,
    root: HTMLElement,
    c: HTMLElement,
    s: State,
    t: Palette,
    visible: Row[],
  ) {
    const box = el(
      doc,
      "div",
      "flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;",
    );
    c.appendChild(box);
    const picked = visible.filter((r) => s.sel.selected.has(r.id));
    if (!picked.length) {
      box.appendChild(el(doc, "div", `color:${t.sub};`, tr("pickHint")));
      if (visible.length) {
        box.appendChild(
          button(doc, t, tr("selectAll"), "", () => {
            s.sel = selectAll([...new Set(visible.map((r) => r.id))]);
            this.render(doc, root, s);
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
      box.appendChild(
        el(doc, "div", "font-weight:600;line-height:1.4;", r.text),
      );
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
    const sourceText = [cite, r.pageLabel ? `S. ${r.pageLabel}` : ""]
      .filter(Boolean)
      .join(", ");
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
        x.addEventListener(
          "click",
          () => void this.unassign(doc, root, s, [r.id], n),
        );
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
      button(doc, t, tr("open"), "", () => void this.openRow(r)),
      button(doc, t, tr("copy"), "", () => {
        const text = [r.text && `„${r.text.trim()}“`, r.comment, sourceText]
          .filter(Boolean)
          .join("\n");
        new ztoolkit.Clipboard().addText(text, "text/unicode").copy();
        toast(tr("copied"));
      }),
    );
    box.appendChild(actions);
  }

  private static async openRow(r: Row) {
    try {
      if (r.kind === "work") {
        const win = Zotero.getMainWindow();
        win.focus();
        await (win as any).ZoteroPane.selectItem(r.id);
        return;
      }
      const readers: any[] = (Zotero.Reader as any)._readers ?? [];
      for (const rd of readers) {
        if (rd.itemID === r.attachmentID) {
          rd.navigate({ annotationKey: r.key });
          return;
        }
      }
      await (Zotero.Reader as any).open(r.attachmentID, {
        annotationKey: r.key,
      });
    } catch (e) {
      ztoolkit.log("annotree open row failed:", e);
    }
  }
}
