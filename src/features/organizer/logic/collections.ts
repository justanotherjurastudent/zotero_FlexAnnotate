/**
 * collections — pure helpers for choosing which collection (and its
 * subcollections) the organizer takes its entries from. No Zotero imports.
 */

export interface ColNode {
  id: number;
  parentID: number | false | null | undefined;
  name: string;
}

export interface ColOption {
  id: number;
  name: string;
  depth: number;
}

function childrenOf(cols: ColNode[], parent: number | null): ColNode[] {
  return cols
    .filter((c) => (parent === null ? !c.parentID : c.parentID === parent))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** All collections as a depth-first, name-sorted list for a dropdown. */
export function collectionOptions(cols: ColNode[]): ColOption[] {
  const out: ColOption[] = [];
  const walk = (parent: number | null, depth: number) => {
    for (const c of childrenOf(cols, parent)) {
      out.push({ id: c.id, name: c.name, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** The collection itself plus every descendant. */
export function descendantIds(cols: ColNode[], rootID: number): number[] {
  const out = [rootID];
  const walk = (parent: number) => {
    for (const c of childrenOf(cols, parent)) {
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(rootID);
  return out;
}

/**
 * The topmost ancestor of a collection (the "top-level collection"), or the
 * collection itself if it already lies on the top level. null if the
 * id does not exist or the chain would be circular.
 */
export function topmostCollection(
  cols: ColNode[],
  collectionID: number,
): ColNode | null {
  const byId = new Map(cols.map((c) => [c.id, c]));
  let cur = byId.get(collectionID);
  if (!cur) return null;
  const chain = new Set<number>([collectionID]);
  while (typeof cur.parentID === "number") {
    if (chain.has(cur.parentID)) break; // circular chain: stay where we are
    const parent = byId.get(cur.parentID);
    if (!parent) break;
    chain.add(parent.id);
    cur = parent;
  }
  return cur;
}

/** Collection ids whose items belong to the chosen scope. */
export function scopeCollectionIDs(
  cols: ColNode[],
  collectionID: number,
  includeSub: boolean,
): number[] {
  return includeSub ? descendantIds(cols, collectionID) : [collectionID];
}
