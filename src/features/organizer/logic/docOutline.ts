/**
 * docOutline — import the outline from Word (DOCX) and LibreOffice (ODT).
 * Pure logic without DOM: a small XML scanner reads only the needed
 * structures. The import is an append-merge into the existing outline.
 */
import { makeNode, numbering, type OutlineNode } from "./outline.ts";

export interface DocHeading {
  /** 1-based. */
  level: number;
  text: string;
}

export interface NormalizeResult {
  items: DocHeading[];
  levelsFixed: number;
  numberingDetected: boolean;
  numberingStripped: boolean;
}

export interface ImportOp {
  kind: "reuse" | "create";
  /** For "reuse" the title of the existing node, for "create" the (possibly renamed) new title. */
  title: string;
  level: number;
  /** Title of the parent node after all renames; null = root. */
  parentTitle: string | null;
  /** Id of the existing node for "reuse", otherwise null. */
  id: string | null;
  /** Original title for "reuse" if the title was updated. */
  oldTitle?: string;
}

export interface ImportPlan {
  ops: ImportOp[];
  created: number;
  reused: number;
  renamed: number;
  renames: { from: string; to: string }[];
}

// ── XML-Scanner ──────────────────────────────────────────────────────────────

type Tok =
  | {
      t: "start" | "empty" | "end";
      name: string;
      attrs: Record<string, string>;
    }
  | { t: "text"; value: string };

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Decodes XML entities in a single pass (&amp;lt; becomes &lt;, not <). */
function decodeEntities(s: string): string {
  return s.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g,
    (m, e: string) => {
      if (e[0] !== "#") return NAMED[e];
      const cp =
        e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return cp > 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff)
        ? String.fromCodePoint(cp)
        : m;
    },
  );
}

const TAG =
  /<(\/?)([^\s/>!?]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** Position following the terminator; end of document if absent. */
function after(xml: string, term: string, from: number): number {
  const e = xml.indexOf(term, from);
  return e < 0 ? xml.length : e + term.length;
}

function tagToken(m: RegExpExecArray): Tok {
  if (m[1]) return { t: "end", name: m[2], attrs: {} };
  const attrs: Record<string, string> = {};
  ATTR.lastIndex = 0;
  for (let a = ATTR.exec(m[3]); a; a = ATTR.exec(m[3]))
    attrs[a[1]] = decodeEntities(a[2] ?? a[3]);
  return { t: m[4] ? "empty" : "start", name: m[2], attrs };
}

/** Rough XML tokenization: tags, text (decoded), comments/PI/DOCTYPE are discarded. */
function tokenize(xml: string): Tok[] {
  const out: Tok[] = [];
  const n = xml.length;
  let i = 0;
  while (i < n) {
    const lt = xml.indexOf("<", i);
    const stop = lt < 0 ? n : lt;
    if (stop > i)
      out.push({ t: "text", value: decodeEntities(xml.slice(i, stop)) });
    if (lt < 0) break;
    i = lt;
    if (xml.startsWith("<!--", i)) {
      i = after(xml, "-->", i + 4);
    } else if (xml.startsWith("<![CDATA[", i)) {
      const e = xml.indexOf("]]>", i + 9);
      out.push({ t: "text", value: xml.slice(i + 9, e < 0 ? n : e) });
      i = after(xml, "]]>", i + 9);
    } else if (xml.startsWith("<?", i) || xml.startsWith("<!", i)) {
      i = after(xml, ">", i);
    } else {
      TAG.lastIndex = i;
      const m = TAG.exec(xml);
      if (!m) {
        i++; // stray "<" in malformed XML: drop it
        continue;
      }
      i = TAG.lastIndex;
      out.push(tagToken(m));
    }
  }
  return out;
}

/** Attributwert per lokalem Namen (Praefix egal), z. B. "val", "styleId", "outline-level". */
function attr(attrs: Record<string, string>, key: string): string | undefined {
  for (const k of Object.keys(attrs)) {
    if (k.slice(k.indexOf(":") + 1) === key) return attrs[k];
  }
  return undefined;
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

// ── DOCX ─────────────────────────────────────────────────────────────────────

interface StyleDef {
  name?: string;
  basedOn?: string;
  /** Ueberschriftsebene (1-basiert), 0 = explizit keine Ueberschrift (outlineLvl 9). */
  outline?: number;
}

/** outlineLvl 0-8 -> Ebene 1-9, 9 -> 0 (Fliesstext), ungueltig -> undefined. */
function outlineToLevel(raw: string | undefined): number | undefined {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return undefined;
  const n = Number(raw);
  return n <= 8 ? n + 1 : 0;
}

const HEADING_NAME = /^(?:heading|überschrift|titre|rubrik)\s*([1-9])$/i;
const HEADING_ID = /^(?:heading|berschrift|titre|rubrik)\s*([1-9])$/i;

/** Fallback by styleId only (standard IDs like Heading1 / Überschrift1). */
function idLevel(id: string): number {
  const m = HEADING_ID.exec(id);
  return m ? Number(m[1]) : 0;
}

function applyStyleProp(
  def: StyleDef,
  name: string,
  attrs: Record<string, string>,
  inPPr: boolean,
): void {
  if (name === "w:name") def.name = attr(attrs, "val");
  else if (name === "w:basedOn") def.basedOn = attr(attrs, "val");
  else if (name === "w:outlineLvl" && inPPr)
    def.outline = outlineToLevel(attr(attrs, "val"));
}

function parseStyles(xml: string): Map<string, StyleDef> {
  const map = new Map<string, StyleDef>();
  let id: string | undefined;
  let def: StyleDef = {};
  let inPPr = false;
  const commit = () => {
    if (id !== undefined) map.set(id, def);
    id = undefined;
  };
  for (const tk of tokenize(xml)) {
    if (tk.t === "text") continue;
    const { name, attrs } = tk;
    if (tk.t === "end") {
      if (name === "w:pPr") inPPr = false;
      else if (name === "w:style") commit();
    } else if (name === "w:style") {
      id = attr(attrs, "styleId");
      def = {};
      if (tk.t === "empty") commit();
    } else if (id !== undefined) {
      if (name === "w:pPr") inPPr = tk.t === "start";
      else applyStyleProp(def, name, attrs, inPPr);
    }
  }
  return map;
}

/** Heading level of a paragraph style via the basedOn chain (0 = none). */
function levelOfStyle(id: string, styles: Map<string, StyleDef>): number {
  const seen = new Set<string>();
  let cur: string | undefined = id;
  while (cur !== undefined && !seen.has(cur)) {
    seen.add(cur);
    const def = styles.get(cur);
    if (!def) break;
    if (def.outline !== undefined) return def.outline;
    const m = HEADING_NAME.exec(def.name ?? "");
    if (m) return Number(m[1]);
    cur = def.basedOn;
  }
  return idLevel(id);
}

interface Para {
  style?: string;
  outline?: number;
  inPPr: boolean;
  text: string;
}

const SPACE_TAGS = new Set(["w:tab", "w:br", "w:cr"]);

/**
 * Headings from document.xml (optionally with styles.xml for custom styles).
 * Text: w:t in paragraphs; w:del/w:moveFrom and w:delText excluded.
 */
export function parseDocxHeadings(
  documentXml: string,
  stylesXml = "",
): DocHeading[] {
  const styles = parseStyles(stylesXml);
  const out: DocHeading[] = [];
  const stack: Para[] = [];
  let del = 0;
  let inT = false;
  const isDel = (n: string) => n === "w:del" || n === "w:moveFrom";

  const pushHeading = (para: Para) => {
    const level =
      para.outline !== undefined
        ? para.outline
        : para.style
          ? levelOfStyle(para.style, styles)
          : 0;
    const text = squash(para.text);
    if (level > 0 && text) out.push({ level, text });
  };

  const onEnd = (name: string, top: Para | undefined) => {
    if (name === "w:t") inT = false;
    else if (isDel(name)) del = Math.max(0, del - 1);
    else if (!top) return;
    else if (name === "w:pPr") top.inPPr = false;
    else if (name === "w:p") {
      stack.pop();
      pushHeading(top);
    }
  };

  const onOpen = (
    name: string,
    isStart: boolean,
    attrs: Record<string, string>,
    top: Para | undefined,
  ) => {
    if (isStart) {
      if (name === "w:p") stack.push({ inPPr: false, text: "" });
      else if (name === "w:t") inT = true;
      else if (isDel(name)) del++;
      else if (name === "w:pPr" && top) top.inPPr = true;
    }
    if (!top) return;
    if (top.inPPr) {
      if (name === "w:pStyle") top.style = attr(attrs, "val");
      else if (name === "w:outlineLvl")
        top.outline = outlineToLevel(attr(attrs, "val"));
    } else if (SPACE_TAGS.has(name) && del === 0) {
      top.text += " ";
    }
  };

  for (const tk of tokenize(documentXml)) {
    const top = stack[stack.length - 1];
    if (tk.t === "text") {
      if (inT && del === 0 && top) top.text += tk.value;
    } else if (tk.t === "end") onEnd(tk.name, top);
    else onOpen(tk.name, tk.t === "start", tk.attrs, top);
  }
  return out;
}

// ── ODT ──────────────────────────────────────────────────────────────────────

const ODT_SKIP_TAGS = new Set(["text:note", "text:deletion"]);

const positiveInt = (v: string | undefined) =>
  v && /^\d+$/.test(v) ? Number(v) : undefined;

/** text:s c="n" -> n Leerzeichen (1..1000, Standard 1). */
function odtSpaceCount(attrs: Record<string, string>): number {
  const c = positiveInt(attr(attrs, "c"));
  return c === undefined ? 1 : Math.min(Math.max(c, 1), 1000);
}

/** Text contributed by an inline element (spaces, tabs, line breaks). */
function odtInlineText(name: string, attrs: Record<string, string>): string {
  if (name === "text:s") return " ".repeat(odtSpaceCount(attrs));
  return name === "text:tab" || name === "text:line-break" ? " " : "";
}

const odtLevel = (attrs: Record<string, string>) =>
  Math.max(1, positiveInt(attr(attrs, "outline-level")) ?? 1);

/**
 * Headings from content.xml (text:h). Footnotes (text:note) and deleted
 * regions (text:deletion) are excluded from the title.
 */
export function parseOdtHeadings(contentXml: string): DocHeading[] {
  const out: DocHeading[] = [];
  let cur: DocHeading | null = null;
  let skip = 0;
  for (const tk of tokenize(contentXml)) {
    if (tk.t === "text") {
      if (cur && skip === 0) cur.text += tk.value;
      continue;
    }
    const { name, attrs } = tk;
    if (ODT_SKIP_TAGS.has(name)) {
      if (tk.t === "end") skip = Math.max(0, skip - 1);
      else if (tk.t === "start") skip++;
    } else if (name === "text:h" && tk.t === "end" && cur) {
      const text = squash(cur.text);
      if (text) out.push({ level: cur.level, text });
      cur = null;
    } else if (name === "text:h" && tk.t === "start" && skip === 0) {
      cur = { level: odtLevel(attrs), text: "" };
    } else if (cur && skip === 0 && tk.t !== "end") {
      cur.text += odtInlineText(name, attrs);
    }
  }
  return out;
}

// ── Normalization ───────────────────────────────────────────────────────────

/** Leading manual numbering: 1. / 1.1 / 1.1.1 / A. / I. / a) / (1) / 1) */
const STRIP_RE =
  /^(?:\d+(?:\.\d+)*\.|\d+(?:\.\d+)+|\d+\)|[A-Z]\.|[IVXLCDM]+\.|[a-z]\)|\(\d+\))\s+/;

/**
 * Ensures gap-free levels (first heading = level 1, never exceeding
 * predecessor + 1) and optionally strips manual numbering if present in
 * at least 80% (and minimum 3) of headings.
 */
export function normalizeHeadings(
  headings: DocHeading[],
  opts: { stripNumbering?: boolean } = {},
): NormalizeResult {
  let prev = 0;
  let levelsFixed = 0;
  const leveled: DocHeading[] = headings.map((h) => {
    const want = Number.isFinite(h.level)
      ? Math.max(1, Math.floor(h.level))
      : 1;
    const level = Math.min(want, prev + 1);
    if (level !== h.level) levelsFixed++;
    prev = level;
    return { level, text: h.text };
  });

  const n = leveled.length;
  const numbered = leveled.filter((h) => STRIP_RE.test(h.text.trim())).length;
  const level1 = leveled.filter((h) => h.level === 1);
  const numberedLevel1 = level1.filter((h) =>
    STRIP_RE.test(h.text.trim()),
  ).length;
  const numberingDetected =
    n >= 3 &&
    (numbered / n >= 0.8 ||
      (level1.length >= 2 && numberedLevel1 / level1.length >= 0.5));

  let numberingStripped = false;
  let items = leveled;
  if (numberingDetected && opts.stripNumbering) {
    items = leveled.map((h) => {
      const t = h.text.trim();
      const s = t.replace(STRIP_RE, "");
      if (!STRIP_RE.test(t) || !s) return h; // never produce an empty title
      numberingStripped = true;
      return { level: h.level, text: s };
    });
  }
  return { items, levelsFixed, numberingDetected, numberingStripped };
}

// ── Import Plan ──────────────────────────────────────────────────────────────

/** Titelvergleich: Unicode-NFC, Whitespace zusammenfassen, case-insensitiv. */
const keyOf = (t: string) =>
  t.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

const stripTitle = (t: string) => {
  const s = t.trim().replace(STRIP_RE, "");
  return s.trim() ? s.trim() : t.trim();
};

interface Work {
  id: string | null;
  title: string;
  children: Work[];
}

export interface PlanOutlineImportOptions {
  /**
   * When enabled, ignores leading numbers (e.g. "2. ", "II. ") in existing
   * titles as well when reusing existing nodes.
   */
  stripExistingNumbering?: boolean;
}

/**
 * Plans append-merge of headings into the existing outline.
 * Reuse occurs only under the same parent node; otherwise added as last child.
 * Titles are globally unique (each heading is a tag): collisions
 * receive " (2)", " (3)" ... Nothing is deleted or moved.
 */
export function planOutlineImport(
  existing: OutlineNode[],
  items: DocHeading[],
  opts: PlanOutlineImportOptions = {},
): ImportPlan {
  const taken = new Set<string>();
  const toWork = (nodes: OutlineNode[]): Work[] =>
    nodes.map((n) => {
      taken.add(keyOf(n.title));
      if (opts.stripExistingNumbering) {
        taken.add(keyOf(stripTitle(n.title)));
      }
      return { id: n.id, title: n.title, children: toWork(n.children) };
    });
  // stack[0] is the virtual root; stack[d] = node at level d.
  const stack: Work[] = [{ id: null, title: "", children: toWork(existing) }];
  const used = new Set<string>();
  const ops: ImportOp[] = [];
  const renames: { from: string; to: string }[] = [];
  let created = 0;
  let reused = 0;

  for (const h of items) {
    const title = squash(h.text);
    if (!title) continue;
    const want = Number.isFinite(h.level)
      ? Math.max(1, Math.floor(h.level))
      : 1;
    const level = Math.min(want, stack.length); // never deeper than predecessor + 1
    stack.splice(level);
    const parent = stack[level - 1];
    const parentTitle = level === 1 ? null : parent.title;
    const k = keyOf(title);

    let hit = parent.children.find(
      (c) => c.id !== null && !used.has(c.id) && keyOf(c.title) === k,
    );
    if (!hit && opts.stripExistingNumbering) {
      hit = parent.children.find(
        (c) =>
          c.id !== null && !used.has(c.id) && keyOf(stripTitle(c.title)) === k,
      );
    }
    let node: Work;
    if (hit) {
      used.add(hit.id ?? "");
      reused++;
      const shouldUpdateTitle =
        Boolean(opts.stripExistingNumbering) &&
        hit.title !== title &&
        keyOf(stripTitle(hit.title)) === k;
      const opTitle = shouldUpdateTitle ? title : hit.title;
      const op: ImportOp = {
        kind: "reuse",
        title: opTitle,
        level,
        parentTitle,
        id: hit.id,
      };
      if (shouldUpdateTitle) op.oldTitle = hit.title;
      ops.push(op);
      node = hit;
    } else {
      let t = title;
      if (taken.has(k)) {
        let c = 2;
        while (taken.has(keyOf(`${title} (${c})`))) c++;
        t = `${title} (${c})`;
        renames.push({ from: title, to: t });
      }
      taken.add(keyOf(t));
      created++;
      ops.push({ kind: "create", title: t, level, parentTitle, id: null });
      node = { id: null, title: t, children: [] };
      parent.children.push(node);
    }
    stack.push(node);
  }
  return { ops, created, reused, renamed: renames.length, renames };
}

/**
 * Applies the plan to a copy of the outline (input remains unmodified).
 * Operations follow document order: new nodes become the last child of
 * the level - 1 node; "reuse" matches by id and preserves its position.
 */
export function applyImportPlan(
  roots: OutlineNode[],
  plan: ImportPlan,
): OutlineNode[] {
  const copy = (ns: OutlineNode[]): OutlineNode[] =>
    ns.map((n) => ({ ...n, children: copy(n.children) }));
  const out = copy(roots);
  const byId = new Map<string, OutlineNode>();
  const index = (ns: OutlineNode[]) =>
    ns.forEach((n) => (byId.set(n.id, n), index(n.children)));
  index(out);
  // stack[d] = node at level d + 1 in the current path
  const stack: OutlineNode[] = [];
  for (const op of plan.ops) {
    const level = Math.max(1, Math.min(op.level, stack.length + 1));
    stack.splice(level - 1);
    let node = op.kind === "reuse" && op.id ? byId.get(op.id) : undefined;
    if (node) {
      if (op.title && op.title !== node.title) {
        node.title = op.title;
      }
    } else {
      node = makeNode(op.title);
      (level === 1 ? out : stack[level - 2].children).push(node);
    }
    stack.push(node);
  }
  return out;
}

/**
 * Computes the decimal numbering ("1", "1.1", ...) for each operation in the
 * import plan as it will appear in the resulting outline (matching Organizer).
 */
export function computePlanNumbers(
  roots: OutlineNode[],
  plan: ImportPlan,
): string[] {
  const copy = (ns: OutlineNode[]): OutlineNode[] =>
    ns.map((n) => ({ ...n, children: copy(n.children) }));
  const out = copy(roots);
  const byId = new Map<string, OutlineNode>();
  const index = (ns: OutlineNode[]) =>
    ns.forEach((n) => (byId.set(n.id, n), index(n.children)));
  index(out);
  const stack: OutlineNode[] = [];
  const nodesForOps: OutlineNode[] = [];
  for (const op of plan.ops) {
    const level = Math.max(1, Math.min(op.level, stack.length + 1));
    stack.splice(level - 1);
    let node = op.kind === "reuse" && op.id ? byId.get(op.id) : undefined;
    if (node) {
      if (op.title && op.title !== node.title) {
        node.title = op.title;
      }
    } else {
      node = makeNode(op.title);
      (level === 1 ? out : stack[level - 2].children).push(node);
      byId.set(node.id, node);
    }
    stack.push(node);
    nodesForOps.push(node);
  }
  const nums = numbering(out);
  return nodesForOps.map((node) => nums.get(node.id) || "");
}
