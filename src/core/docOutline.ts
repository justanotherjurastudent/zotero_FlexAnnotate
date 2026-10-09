/**
 * docOutline — Gliederung aus Word (DOCX) und LibreOffice (ODT) importieren.
 * Reine Logik ohne DOM: ein kleiner XML-Scanner liest nur die benoetigten
 * Strukturen. Der Import ist ein Append-Merge in die bestehende Gliederung.
 */
import { makeNode, type OutlineNode } from "./outline.ts";

export interface DocHeading {
  /** 1-basiert. */
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
  /** Bei "reuse" der Titel des vorhandenen Knotens, bei "create" der (ggf. umbenannte) neue Titel. */
  title: string;
  level: number;
  /** Titel des Elternknotens nach allen Umbenennungen; null = Wurzel. */
  parentTitle: string | null;
  /** Id des vorhandenen Knotens bei "reuse", sonst null. */
  id: string | null;
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

/** Entities in einem Durchgang dekodieren (&amp;lt; wird zu &lt;, nicht zu <). */
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

/** Tokenisiert XML grob: Tags, Text (dekodiert), Kommentare/PI/DOCTYPE werden verworfen. */
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
      const e = xml.indexOf("-->", i + 4);
      i = e < 0 ? n : e + 3;
    } else if (xml.startsWith("<![CDATA[", i)) {
      const e = xml.indexOf("]]>", i + 9);
      out.push({ t: "text", value: xml.slice(i + 9, e < 0 ? n : e) });
      i = e < 0 ? n : e + 3;
    } else if (xml.startsWith("<?", i) || xml.startsWith("<!", i)) {
      const e = xml.indexOf(">", i);
      i = e < 0 ? n : e + 1;
    } else {
      TAG.lastIndex = i;
      const m = TAG.exec(xml);
      if (!m) {
        i++; // stray "<" in malformed XML: drop it
        continue;
      }
      i = TAG.lastIndex;
      if (m[1]) {
        out.push({ t: "end", name: m[2], attrs: {} });
      } else {
        const attrs: Record<string, string> = {};
        ATTR.lastIndex = 0;
        for (let a = ATTR.exec(m[3]); a; a = ATTR.exec(m[3]))
          attrs[a[1]] = decodeEntities(a[2] ?? a[3]);
        out.push({ t: m[4] ? "empty" : "start", name: m[2], attrs });
      }
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

/** Fallback nur ueber die styleId (Standard-IDs wie Heading1 / berschrift1). */
function idLevel(id: string): number {
  const m = HEADING_ID.exec(id);
  return m ? Number(m[1]) : 0;
}

function parseStyles(xml: string): Map<string, StyleDef> {
  const map = new Map<string, StyleDef>();
  let id: string | undefined;
  let def: StyleDef = {};
  let inPPr = false;
  for (const tk of tokenize(xml)) {
    if (tk.t === "text") continue;
    const { name, attrs } = tk;
    if (tk.t === "end") {
      if (name === "w:pPr") inPPr = false;
      else if (name === "w:style" && id !== undefined) {
        map.set(id, def);
        id = undefined;
      }
      continue;
    }
    if (name === "w:style") {
      id = attr(attrs, "styleId");
      def = {};
      if (tk.t === "empty" && id !== undefined) {
        map.set(id, def);
        id = undefined;
      }
      continue;
    }
    if (id === undefined) continue;
    if (name === "w:pPr") inPPr = tk.t === "start";
    else if (name === "w:name") def.name = attr(attrs, "val");
    else if (name === "w:basedOn") def.basedOn = attr(attrs, "val");
    else if (name === "w:outlineLvl" && inPPr)
      def.outline = outlineToLevel(attr(attrs, "val"));
  }
  return map;
}

/** Ueberschriftsebene eines Absatzstils ueber die basedOn-Kette (0 = keine). */
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

/**
 * Ueberschriften aus document.xml (ggf. mit styles.xml fuer benutzerdefinierte
 * Stile). Text: w:t in Absaetzen; w:del/w:moveFrom und w:delText ausgeschlossen.
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

  for (const tk of tokenize(documentXml)) {
    const top = stack[stack.length - 1];
    if (tk.t === "text") {
      if (inT && del === 0 && top) top.text += tk.value;
      continue;
    }
    const { name, attrs } = tk;
    if (tk.t === "end") {
      if (name === "w:t") inT = false;
      else if (name === "w:del" || name === "w:moveFrom")
        del = Math.max(0, del - 1);
      else if (name === "w:pPr" && top) top.inPPr = false;
      else if (name === "w:p" && top) {
        stack.pop();
        pushHeading(top);
      }
      continue;
    }
    const isStart = tk.t === "start";
    if (name === "w:p") {
      if (isStart) stack.push({ inPPr: false, text: "" });
    } else if (name === "w:pPr") {
      if (isStart && top) top.inPPr = true;
    } else if (name === "w:t") {
      if (isStart) inT = true;
    } else if (name === "w:del" || name === "w:moveFrom") {
      if (isStart) del++;
    } else if (name === "w:pStyle" && top?.inPPr) {
      top.style = attr(attrs, "val");
    } else if (name === "w:outlineLvl" && top?.inPPr) {
      top.outline = outlineToLevel(attr(attrs, "val"));
    } else if (
      (name === "w:tab" || name === "w:br" || name === "w:cr") &&
      top &&
      !top.inPPr &&
      del === 0
    ) {
      top.text += " ";
    }
  }
  return out;
}

// ── ODT ──────────────────────────────────────────────────────────────────────

/**
 * Ueberschriften aus content.xml (text:h). Fussnoten (text:note) und geloeschte
 * Bereiche (text:deletion) fliessen nicht in den Titel ein.
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
    if (tk.t === "end") {
      if (name === "text:h" && cur) {
        const text = squash(cur.text);
        if (text) out.push({ level: cur.level, text });
        cur = null;
      } else if (name === "text:note" || name === "text:deletion") {
        skip = Math.max(0, skip - 1);
      }
      continue;
    }
    if (name === "text:note" || name === "text:deletion") {
      if (tk.t === "start") skip++;
      continue;
    }
    if (name === "text:h" && tk.t === "start" && skip === 0) {
      const lv = attr(attrs, "outline-level");
      const level = lv && /^\d+$/.test(lv) && Number(lv) >= 1 ? Number(lv) : 1;
      cur = { level, text: "" };
      continue;
    }
    if (!cur || skip > 0) continue;
    if (name === "text:s") {
      const c = attr(attrs, "c");
      const count =
        c && /^\d+$/.test(c) ? Math.min(Math.max(Number(c), 1), 1000) : 1;
      cur.text += " ".repeat(count);
    } else if (name === "text:tab" || name === "text:line-break") {
      cur.text += " ";
    }
  }
  return out;
}

// ── Normalisierung ───────────────────────────────────────────────────────────

/** Manuelle Nummerierung am Anfang: 1. / 1.1 / 1.1.1 / A. / I. / a) / (1) / 1) */
const STRIP_RE =
  /^(?:\d+(?:\.\d+)*\.|\d+(?:\.\d+)+|\d+\)|[A-Z]\.|[IVXLCDM]+\.|[a-z]\)|\(\d+\))\s+/;

/**
 * Ebenen lueckenlos machen (erste Ueberschrift = Ebene 1, nie mehr als
 * Vorgaenger+1) und optional manuelle Nummerierung entfernen, wenn sie in
 * mindestens 80 % (und mind. 3) der Ueberschriften vorkommt.
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
  const numberingDetected = n >= 3 && numbered / n >= 0.8;

  let numberingStripped = false;
  let items = leveled;
  if (numberingDetected && opts.stripNumbering) {
    items = leveled.map((h) => {
      const t = h.text.trim();
      const s = t.replace(STRIP_RE, "");
      if (!STRIP_RE.test(t) || !s) return h; // nie einen leeren Titel erzeugen
      numberingStripped = true;
      return { level: h.level, text: s };
    });
  }
  return { items, levelsFixed, numberingDetected, numberingStripped };
}

// ── Import-Plan ──────────────────────────────────────────────────────────────

/** Titelvergleich: Unicode-NFC, Whitespace zusammenfassen, case-insensitiv. */
const keyOf = (t: string) =>
  t.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

interface Work {
  id: string | null;
  title: string;
  children: Work[];
}

/**
 * Plant den Append-Merge der Ueberschriften in die bestehende Gliederung.
 * Wiederverwendung nur unter gleichem Elternknoten; sonst neu als letztes Kind.
 * Titel sind global eindeutig (jede Ueberschrift ist ein Tag): Kollisionen
 * erhalten " (2)", " (3)" ... Nichts wird geloescht oder verschoben.
 */
export function planOutlineImport(
  existing: OutlineNode[],
  items: DocHeading[],
): ImportPlan {
  const taken = new Set<string>();
  const toWork = (nodes: OutlineNode[]): Work[] =>
    nodes.map((n) => {
      taken.add(keyOf(n.title));
      return { id: n.id, title: n.title, children: toWork(n.children) };
    });
  // stack[0] ist die virtuelle Wurzel; stack[d] = Knoten auf Ebene d.
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
    const level = Math.min(want, stack.length); // nie tiefer als Vorgaenger+1
    stack.splice(level);
    const parent = stack[level - 1];
    const parentTitle = level === 1 ? null : parent.title;
    const k = keyOf(title);

    const hit = parent.children.find(
      (c) => c.id !== null && !used.has(c.id) && keyOf(c.title) === k,
    );
    let node: Work;
    if (hit) {
      used.add(hit.id ?? "");
      reused++;
      ops.push({
        kind: "reuse",
        title: hit.title,
        level,
        parentTitle,
        id: hit.id,
      });
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
 * Wendet den Plan auf eine Kopie der Gliederung an (die Eingabe bleibt
 * unveraendert). Die Operationen sind in Dokumentreihenfolge: neue Knoten
 * werden letztes Kind des Knotens auf Ebene-1; "reuse" wird ueber die Id
 * gefunden und bleibt an seinem Platz.
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
  // stack[d] = Knoten auf Ebene d+1 im aktuellen Pfad
  const stack: OutlineNode[] = [];
  for (const op of plan.ops) {
    const level = Math.max(1, Math.min(op.level, stack.length + 1));
    stack.splice(level - 1);
    let node = op.kind === "reuse" && op.id ? byId.get(op.id) : undefined;
    if (!node) {
      node = makeNode(op.title);
      (level === 1 ? out : stack[level - 2].children).push(node);
    }
    stack.push(node);
  }
  return out;
}
