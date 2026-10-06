/**
 * cited — bookkeeping for the green "already cited" check in the citation
 * dialog. Annotations are inserted into Word as quoted text plus a citation of
 * the work; the annotation itself is not stored in the document. So we record
 * the annotation ids per document (the document's session id) when a citation
 * is accepted, and treat an entry as still valid while its work is still cited
 * in the document. That check uses data Zotero has already loaded for the
 * dialog, so nothing extra is read from the document.
 * Pure logic, no Zotero imports.
 */

/** sessionID -> annotationID -> workID */
export type CitedStore = Record<string, Record<string, number>>;

const MAX_SESSIONS = 50;

export function parseStore(raw: string | undefined | null): CitedStore {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** New store with the given annotations recorded for a document. */
export function record(
  store: CitedStore,
  sessionID: string,
  entries: { id: number; workID: number }[],
): CitedStore {
  const next: CitedStore = { ...store };
  const mine = { ...(next[sessionID] ?? {}) };
  for (const e of entries) mine[String(e.id)] = e.workID;
  // move this document to the end so the oldest ones are dropped first
  delete next[sessionID];
  next[sessionID] = mine;
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_SESSIONS)))
    delete next[k];
  return next;
}

/**
 * Annotation ids to mark as cited for a document. If the set of works that are
 * currently cited in the document is known, entries whose work is no longer
 * cited are ignored.
 */
export function activeIds(
  store: CitedStore,
  sessionID: string,
  citedWorkIDs: Set<number> | null,
): Set<number> {
  const out = new Set<number>();
  for (const [id, workID] of Object.entries(store[sessionID] ?? {})) {
    if (!citedWorkIDs || citedWorkIDs.has(workID)) out.add(Number(id));
  }
  return out;
}

/** New store without the given annotations for a document (manual removal). */
export function unrecord(
  store: CitedStore,
  sessionID: string,
  ids: number[],
): CitedStore {
  const mine = { ...(store[sessionID] ?? {}) };
  for (const id of ids) delete mine[String(id)];
  return { ...store, [sessionID]: mine };
}
