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

// ── Footnote and document location mapping ─────────────────────────────────

export interface CitationLocation {
  citationID: string;
  /** 0 for in-text / body citations, >= 1 for footnotes / endnotes */
  noteIndex: number;
  /** Sequential document order index in citationsByIndex (0-based) */
  index?: number;
  citation?: any;
}

/**
 * Maps each annotation key to the active citation locations in the document.
 * Single-pass over citations and docData.
 */
export function buildCitationLocationsMap(
  docData: CitedDocData | null | undefined,
  citationsByIndex: unknown[] | Record<string, unknown> | null | undefined,
): Map<string, CitationLocation[]> {
  const map = new Map<string, CitationLocation[]>();
  if (!docData?.citations) return map;

  let rawList: any[] = [];
  if (Array.isArray(citationsByIndex)) {
    rawList = citationsByIndex;
  } else if (citationsByIndex && typeof citationsByIndex === "object") {
    // If integer keys, sort numerically so document order is preserved
    const keys = Object.keys(citationsByIndex).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
    });
    rawList = keys.map((k) => (citationsByIndex as Record<string, unknown>)[k]);
  }

  if (!rawList.length) return map;

  // Map citationID -> { citation, index } (deduplicated)
  const citationById = new Map<string, { citation: any; index: number }>();
  for (let i = 0; i < rawList.length; i++) {
    const cit = rawList[i];
    if (!cit || typeof cit !== "object") continue;
    const cid = String(cit.citationID ?? "");
    if (cid && !citationById.has(cid)) {
      const zIndex = cit.properties?.zoteroIndex;
      const docIndex =
        typeof zIndex === "number" && !isNaN(zIndex) ? zIndex : i;
      citationById.set(cid, { citation: cit, index: docIndex });
    }
  }

  for (const [cid, keys] of Object.entries(docData.citations)) {
    if (cid === "__proto__" || cid === "constructor" || cid === "prototype") {
      continue;
    }
    if (!Array.isArray(keys)) continue;
    const info = citationById.get(cid);
    if (!info) continue;

    const cit = info.citation;
    const rawNoteIndex =
      cit.properties && typeof cit.properties === "object"
        ? cit.properties.noteIndex
        : cit.noteIndex;
    const num =
      typeof rawNoteIndex === "number" && !isNaN(rawNoteIndex)
        ? rawNoteIndex
        : Number(rawNoteIndex);
    const noteIndex = !isNaN(num) && num > 0 ? Math.floor(num) : 0;

    const loc: CitationLocation = {
      citationID: cid,
      noteIndex,
      index: info.index,
      citation: cit,
    };

    for (const key of keys) {
      if (typeof key !== "string" || !key) continue;
      let list = map.get(key);
      if (!list) {
        list = [];
        map.set(key, list);
      }
      if (!list.some((existing) => existing.citationID === cid)) {
        list.push(loc);
      }
    }
  }

  // Sort each list: first by noteIndex ascending (0 for text, then fn 1, fn 2...),
  // and for citations with the same noteIndex, by document order index ascending
  for (const list of map.values()) {
    list.sort(
      (a, b) => a.noteIndex - b.noteIndex || (a.index ?? 0) - (b.index ?? 0),
    );
  }

  return map;
}

/**
 * Returns active citation locations (e.g. footnote numbers) for a specific annotation key.
 */
export function findCitationLocations(
  docData: CitedDocData | null | undefined,
  citationsByIndex: unknown[] | Record<string, unknown> | null | undefined,
  annKey: string,
): CitationLocation[] {
  if (!annKey) return [];
  return buildCitationLocationsMap(docData, citationsByIndex).get(annKey) ?? [];
}
