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

/** Collection ids whose items belong to the chosen scope. */
export function scopeCollectionIDs(
  cols: ColNode[],
  collectionID: number,
  includeSub: boolean,
): number[] {
  return includeSub ? descendantIds(cols, collectionID) : [collectionID];
}
