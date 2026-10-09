/**
 * outline — pure outline logic (no Zotero imports, unit-testable in Node).
 *
 * Derived from Lattice (birugit, AGPL-3.0-or-later); see NOTICE.md.
 * A heading IS a Zotero tag (HEADING_PREFIX + title); the tree (hierarchy and
 * order) is JSON in one standalone note tagged OUTLINE_TAG. Numbers like
 * "1.2.3" are computed for display and never stored.
 */

/** Marker tag identifying the standalone note that stores the outline tree. */
export const OUTLINE_TAG = "★outline";

/** Prefix that turns a heading title into its backing Zotero tag. */
export const HEADING_PREFIX = "§";

/** First line of the code block, so we can find our JSON payload reliably. */
const SENTINEL = "LATTICE-OUTLINE-V1";

export interface OutlineNode {
  id: string;
  title: string;
  children: OutlineNode[];
}

/** The tag a heading files things under. */
export function headingTag(title: string): string {
  return HEADING_PREFIX + title.trim();
}

// ── pure tree operations (no Zotero) ─────────────────────────────────────────

let idCounter = 0;
/** Short, collision-resistant id for a node. */
export function genId(): string {
  idCounter = (idCounter + 1) % 1e6;
  return (
    Date.now().toString(36) +
    idCounter.toString(36) +
    Math.random().toString(36).slice(2, 6)
  );
}

interface Located {
  node: OutlineNode;
  siblings: OutlineNode[];
  index: number;
  parent: OutlineNode | null;
}

/** Depth-first search for a node, returning it with its sibling context. */
export function locate(
  roots: OutlineNode[],
  id: string,
  parent: OutlineNode | null = null,
): Located | null {
  for (let i = 0; i < roots.length; i++) {
    if (roots[i].id === id) {
      return { node: roots[i], siblings: roots, index: i, parent };
    }
    const found = locate(roots[i].children, id, roots[i]);
    if (found) return found;
  }
  return null;
}

/** Every title currently in the tree, lower-cased (for duplicate checks). */
export function allTitlesLower(roots: OutlineNode[]): Set<string> {
  const set = new Set<string>();
  const walk = (nodes: OutlineNode[]) => {
    for (const n of nodes) {
      set.add(n.title.trim().toLowerCase());
      walk(n.children);
    }
  };
  walk(roots);
  return set;
}

/**
 * Because a heading is a tag, two headings with the same title would share a
 * tag and gather each other's items. Titles must therefore be unique across the
 * whole tree; this reports why an add/rename would be rejected (or "" if ok).
 * `exceptId` lets a rename keep its own current title.
 */
export function titleError(
  roots: OutlineNode[],
  title: string,
  exceptId?: string,
): string {
  const t = title.trim();
  if (!t) return "Heading can't be empty";
  if (t.includes("\n")) return "Heading can't contain a line break";
  const existing = allTitlesLower(roots);
  if (exceptId) {
    const cur = locate(roots, exceptId)?.node.title.trim().toLowerCase();
    if (cur && cur === t.toLowerCase()) return ""; // unchanged
  }
  if (existing.has(t.toLowerCase())) return "A heading with that title exists";
  return "";
}

export function makeNode(title: string): OutlineNode {
  return { id: genId(), title: title.trim(), children: [] };
}

/** Move a node one slot earlier among its siblings. Returns true if it moved. */
export function moveUp(roots: OutlineNode[], id: string): boolean {
  const loc = locate(roots, id);
  if (!loc || loc.index === 0) return false;
  const s = loc.siblings;
  [s[loc.index - 1], s[loc.index]] = [s[loc.index], s[loc.index - 1]];
  return true;
}

/** Move a node one slot later among its siblings. */
export function moveDown(roots: OutlineNode[], id: string): boolean {
  const loc = locate(roots, id);
  if (!loc || loc.index >= loc.siblings.length - 1) return false;
  const s = loc.siblings;
  [s[loc.index + 1], s[loc.index]] = [s[loc.index], s[loc.index + 1]];
  return true;
}

/** Indent: make a node the last child of its previous sibling. */
export function indent(roots: OutlineNode[], id: string): boolean {
  const loc = locate(roots, id);
  if (!loc || loc.index === 0) return false;
  const prev = loc.siblings[loc.index - 1];
  loc.siblings.splice(loc.index, 1);
  prev.children.push(loc.node);
  return true;
}

/** Outdent: move a node to be the next sibling of its parent. */
export function outdent(roots: OutlineNode[], id: string): boolean {
  const loc = locate(roots, id);
  if (!loc || !loc.parent) return false;
  const parentLoc = locate(roots, loc.parent.id);
  if (!parentLoc) return false;
  loc.siblings.splice(loc.index, 1);
  parentLoc.siblings.splice(parentLoc.index + 1, 0, loc.node);
  return true;
}

/** Remove a node (and its subtree); returns the removed node or null. */
export function removeNode(
  roots: OutlineNode[],
  id: string,
): OutlineNode | null {
  const loc = locate(roots, id);
  if (!loc) return null;
  loc.siblings.splice(loc.index, 1);
  return loc.node;
}

/** Every title in a subtree (the node itself + all descendants). */
export function subtreeTitles(node: OutlineNode): string[] {
  const out: string[] = [];
  const walk = (n: OutlineNode) => {
    out.push(n.title);
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

export interface FlatNode {
  node: OutlineNode;
  depth: number;
}

/** Depth-first flatten in outline order, carrying each node's depth. */
export function flatten(roots: OutlineNode[]): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (nodes: OutlineNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ node: n, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(roots, 0);
  return out;
}

// ── serialization ────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function htmlToText(html: string): string {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|blockquote|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Render the outline note's HTML: a human-readable list + the JSON payload. */
export function serializeOutline(roots: OutlineNode[]): string {
  const json = JSON.stringify({ v: 1, roots });
  const readable = renderReadable(roots);
  // The <pre><code> block is the source of truth on read; the list above it is
  // just so the note is glanceable inside Zotero itself.
  return (
    `<h1>📚 Annotree — Gliederung</h1>` +
    readable +
    `<pre><code>${SENTINEL}\n${escapeHtml(json)}</code></pre>`
  );
}

function renderReadable(roots: OutlineNode[]): string {
  if (!roots.length) return "<p><em>(empty outline)</em></p>";
  const walk = (nodes: OutlineNode[]): string =>
    "<ul>" +
    nodes
      .map(
        (n) =>
          `<li>${escapeHtml(n.title)}${
            n.children.length ? walk(n.children) : ""
          }</li>`,
      )
      .join("") +
    "</ul>";
  return walk(roots);
}

/** Parse the tree back out of a stored outline note's HTML. */
export function parseOutline(noteHtml: string): OutlineNode[] {
  // Zotero rewrites <pre><code>…</code></pre> to <pre>…</pre> when a note is
  // saved again, so accept both closings.
  const m = noteHtml.match(
    new RegExp(SENTINEL + "\\s*([\\s\\S]*?)</(?:code|pre)>"),
  );
  if (!m) return [];
  try {
    const parsed = JSON.parse(unescapeHtml(m[1].trim()));
    const roots = parsed?.roots;
    return Array.isArray(roots) ? sanitizeTree(roots) : [];
  } catch {
    return [];
  }
}

/** Defensively coerce parsed JSON into well-formed OutlineNodes. */
function sanitizeTree(nodes: any[]): OutlineNode[] {
  const out: OutlineNode[] = [];
  for (const n of nodes) {
    if (!n || typeof n.title !== "string") continue;
    out.push({
      id: typeof n.id === "string" && n.id ? n.id : genId(),
      title: n.title,
      children: Array.isArray(n.children) ? sanitizeTree(n.children) : [],
    });
  }
  return out;
}

// ── numbering and lookups (derived, never stored) ────────────────────────────

/** Decimal outline numbers ("1", "1.1", "1.2.3"), computed from the tree. */
export function numbering(roots: OutlineNode[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (nodes: OutlineNode[], prefix: string) => {
    nodes.forEach((n, i) => {
      const num = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      out.set(n.id, num);
      walk(n.children, num);
    });
  };
  walk(roots, "");
  return out;
}

/** Tag → node for every heading in the tree. */
export function tagIndex(roots: OutlineNode[]): Map<string, OutlineNode> {
  const out = new Map<string, OutlineNode>();
  for (const { node } of flatten(roots)) out.set(headingTag(node.title), node);
  return out;
}

/** Heading tags of a node and all its descendants (for "include subheadings"). */
export function subtreeTags(node: OutlineNode): string[] {
  return subtreeTitles(node).map(headingTag);
}

/** The heading tags among a list of tags (anything starting with the prefix). */
export function headingTagsOf(tags: string[]): string[] {
  return tags.filter((t) => t.startsWith(HEADING_PREFIX));
}

export interface Section<T> {
  /** null = the "no category" bucket. */
  node: OutlineNode | null;
  number: string;
  depth: number;
  items: T[];
}

/**
 * Arrange items the way the organizer shows them: one section per heading in
 * outline order (an item filed under several headings appears in each), then
 * the unassigned items. Empty headings are skipped unless keepEmpty is set.
 */
export function groupByOutline<T extends { tags: string[] }>(
  roots: OutlineNode[],
  items: T[],
  keepEmpty = false,
): Section<T>[] {
  const nums = numbering(roots);
  const byTag = new Map<string, T[]>();
  const unassigned: T[] = [];
  const known = tagIndex(roots);
  for (const it of items) {
    const mine = headingTagsOf(it.tags).filter((t) => known.has(t));
    if (!mine.length) unassigned.push(it);
    for (const t of mine) {
      if (!byTag.has(t)) byTag.set(t, []);
      byTag.get(t)!.push(it);
    }
  }
  const out: Section<T>[] = [];
  for (const { node, depth } of flatten(roots)) {
    const list = byTag.get(headingTag(node.title)) ?? [];
    if (list.length || keepEmpty)
      out.push({ node, number: nums.get(node.id)!, depth, items: list });
  }
  if (unassigned.length)
    out.push({ node: null, number: "", depth: 0, items: unassigned });
  return out;
}

/** Items filed under a node (optionally including all subheadings). */
export function itemsUnder<T extends { tags: string[] }>(
  node: OutlineNode,
  items: T[],
  includeSub = true,
): T[] {
  const tags = new Set(
    includeSub ? subtreeTags(node) : [headingTag(node.title)],
  );
  return items.filter((it) => it.tags.some((t) => tags.has(t)));
}

/** Items carrying no heading tag that exists in the outline. */
export function unassignedItems<T extends { tags: string[] }>(
  roots: OutlineNode[],
  items: T[],
): T[] {
  const known = tagIndex(roots);
  return items.filter((it) => !it.tags.some((t) => known.has(t)));
}

/** Id of the heading `delta` steps away in outline order (null at the ends). */
export function neighborId(
  roots: OutlineNode[],
  id: string | null,
  delta: number,
): string | null {
  const flat = flatten(roots);
  if (!flat.length) return null;
  const i = flat.findIndex((f) => f.node.id === id);
  if (i < 0) return flat[delta > 0 ? 0 : flat.length - 1].node.id;
  const j = i + delta;
  return j < 0 || j >= flat.length ? null : flat[j].node.id;
}
