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

// ── Persistent document citations (stored in Word doc variables) ────────────

export interface CitedDocData {
  /** citationID -> array of annotation item keys */
  citations: Record<string, string[]>;
  /** annotation item keys manually marked as cited */
  manual?: string[];
}

export function parseDocData(raw: string | undefined | null): CitedDocData {
  if (!raw) return { citations: {} };
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      return { citations: {} };
    }
    const citations: Record<string, string[]> = {};
    if (
      v.citations &&
      typeof v.citations === "object" &&
      !Array.isArray(v.citations)
    ) {
      for (const [k, arr] of Object.entries(v.citations)) {
        if (k === "__proto__" || k === "constructor" || k === "prototype") {
          continue;
        }
        if (Array.isArray(arr)) {
          citations[k] = arr.filter(
            (x: unknown): x is string => typeof x === "string",
          );
        }
      }
    }
    const manual = Array.isArray(v.manual)
      ? v.manual.filter((x: unknown): x is string => typeof x === "string")
      : undefined;
    return { citations, ...(manual && manual.length ? { manual } : {}) };
  } catch {
    return { citations: {} };
  }
}

export function serializeDocData(data: CitedDocData): string {
  const out: CitedDocData = { citations: data.citations || {} };
  if (data.manual && data.manual.length > 0) {
    out.manual = [...new Set(data.manual)];
  }
  return JSON.stringify(out);
}

/** Records annotation keys cited by a citationID. */
export function recordDocCitation(
  data: CitedDocData,
  citationID: string,
  annKeys: string[],
): CitedDocData {
  if (!citationID || !annKeys.length) return data;
  const existing = data.citations?.[citationID] ?? [];
  const merged = [...new Set([...existing, ...annKeys])];
  return {
    ...data,
    citations: {
      ...data.citations,
      [citationID]: merged,
    },
  };
}

/**
 * Reconciles document citations against active citationIDs in the document.
 * Fast single-pass reconciliation:
 * - If activeCitationIDs is provided, citations whose ID is not in activeCitationIDs are pruned.
 * - Collects all active annotation keys into a Set for O(1) membership testing.
 */
export function reconcileDocData(
  data: CitedDocData,
  activeCitationIDs?: Set<string> | Record<string, unknown> | null,
): { data: CitedDocData; activeKeys: Set<string>; pruned: boolean } {
  const activeKeys = new Set<string>(data.manual ?? []);
  if (!data.citations) {
    return {
      data: {
        citations: {},
        ...(data.manual?.length ? { manual: data.manual } : {}),
      },
      activeKeys,
      pruned: false,
    };
  }

  if (activeCitationIDs === null || activeCitationIDs === undefined) {
    for (const keys of Object.values(data.citations)) {
      for (let i = 0; i < keys.length; i++) {
        activeKeys.add(keys[i]);
      }
    }
    return { data, activeKeys, pruned: false };
  }

  const isActive = (id: string): boolean => {
    if (activeCitationIDs instanceof Set) return activeCitationIDs.has(id);
    return Object.prototype.hasOwnProperty.call(activeCitationIDs, id);
  };

  const nextCitations: Record<string, string[]> = {};
  let changed = false;

  for (const [cid, keys] of Object.entries(data.citations)) {
    if (cid === "__proto__" || cid === "constructor" || cid === "prototype") {
      changed = true;
      continue;
    }
    if (isActive(cid)) {
      nextCitations[cid] = keys;
      for (let i = 0; i < keys.length; i++) {
        activeKeys.add(keys[i]);
      }
    } else {
      changed = true;
    }
  }

  const nextData: CitedDocData = changed
    ? {
        citations: nextCitations,
        ...(data.manual && data.manual.length ? { manual: data.manual } : {}),
      }
    : data;

  return { data: nextData, activeKeys, pruned: changed };
}

/**
 * Manual toggle of green check for annotation keys.
 * on = true: adds keys to manual list.
 * on = false: removes keys from manual list AND removes them from any citation entry.
 */
export function toggleDocCited(
  data: CitedDocData,
  annKeys: string[],
  on: boolean,
): CitedDocData {
  const keysSet = new Set(annKeys);
  if (!keysSet.size) return data;

  if (on) {
    const existing = new Set(data.manual ?? []);
    for (const k of keysSet) existing.add(k);
    return {
      ...data,
      manual: [...existing],
    };
  } else {
    const nextManual = (data.manual ?? []).filter((k) => !keysSet.has(k));
    const nextCitations: Record<string, string[]> = {};
    let citationsChanged = false;
    for (const [cid, keys] of Object.entries(data.citations ?? {})) {
      const remaining = keys.filter((k) => !keysSet.has(k));
      if (remaining.length !== keys.length) {
        citationsChanged = true;
        if (remaining.length > 0) {
          nextCitations[cid] = remaining;
        }
      } else {
        nextCitations[cid] = keys;
      }
    }
    return {
      citations: citationsChanged ? nextCitations : data.citations,
      ...(nextManual.length ? { manual: nextManual } : {}),
    };
  }
}
