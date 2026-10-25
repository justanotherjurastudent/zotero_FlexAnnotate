/**
 * Citation-only citing (citeOnly) (origin: pre-merge:src/integrationPatch.js).
 *
 * Attack point (verified against Zotero 10.0.5, xpcom/integration.js:1678-1701):
 * `Zotero.Integration.Session.prototype._insertCitingResult` branches as soon as the
 * cited items are annotations, and pushes them into the document as a mock note.
 * In "citation-only" mode the regular citation path is used instead
 * `_insertItemsIntoDocument()` (integration.js:1778-1785), with the
 * parent title as the cited item and `annotationPageLabel` as the locator.
 *
 * `insertAnnotations` is not an attack point: it only exists on
 * `Zotero.EditorInstance`, not on `Integration.Session`.
 */
import type { Feature } from "../../shared/feature";
import { assignChecked } from "../../shared/patch";
import { getPref } from "../../utils/prefs";
import {
  citationOnlyItems,
  type AnnotationRef,
  type CitationItemLike,
} from "./logic/citeOnly";
import { getLocator } from "../print/printAnnotations";
import {
  parseDocData,
  recordDocCitation,
  serializeDocData,
} from "../organizer/logic/cited";
import { DOC_CITED_PREF } from "../organizer/citationDialog/dialogCited";
import { isFeatureEnabled } from "../gates";

type Citation = {
  citationItems: CitationItemLike[];
  loadItemData?: () => Promise<unknown>;
};

interface SessionProto {
  _insertCitingResult: InsertFn;
  _insertItemsIntoDocument(
    fieldIndex: number,
    field: unknown,
    citation: Citation,
  ): Promise<unknown>;
  resetRequest?(doc?: unknown): void;
  rebuildCiteprocState?: boolean;
}

type InsertFn = (
  this: SessionProto,
  fieldIndex: number,
  field: unknown,
  citation: Citation,
) => Promise<unknown[]>;

interface Installed {
  proto: SessionProto;
  nativeInsert: InsertFn;
  patchedInsert: InsertFn;
  nativeResetRequest?: (doc?: unknown) => void;
  patchedResetRequest?: (doc?: unknown) => void;
}

/** Set as long as the patch is active; holds the original for unpatch(). */
let installed: Installed | null = null;

function sessionProto(): SessionProto | undefined {
  return (
    Zotero as unknown as {
      Integration?: { Session?: { prototype?: SessionProto } };
    }
  ).Integration?.Session?.prototype;
}

function refOf(annotation: Zotero.Item): AnnotationRef {
  const top = annotation.topLevelItem;
  const topLevelId = top && top.isRegularItem() ? top.id : null;
  if (topLevelId === null) {
    ztoolkit.log(
      `Annotation ${annotation.key} has no citable top-level item; falling back`,
    );
  }
  const pageLabel = annotation.annotationPageLabel;
  return {
    topLevelId,
    pageLabel,
    // For print sources the location is often not a page (marginal number, paragraph …);
    // the type hangs on the annotation or on the document default.
    locatorType: pageLabel ? getLocator(annotation) : "",
  };
}

/**
 * Builds an ordinary citation on the parent titles from an annotation citation.
 * The citation is changed in place and the same object is returned: a clone would
 * lose the prototype of Zotero.Integration.Citation, which the session later needs for
 * .serialize(). It is only mutated after full validation.
 *
 * @return The same citation, or null if the case does not apply (native fallthrough).
 */
async function rewriteToCitationOnly(
  citation: Citation,
): Promise<Citation | null> {
  const citationItems = citation?.citationItems;
  if (!Array.isArray(citationItems) || !citationItems.length) {
    return null;
  }

  const annotations = citationItems.map(
    (ci) => Zotero.Cite.getItem(ci.id) as Zotero.Item | undefined,
  );
  if (!annotations.every((item) => item && item.isAnnotation())) {
    // Mixed or regular selection: not our case.
    return null;
  }

  const items = citationOnlyItems(
    citationItems,
    annotations.map((item) => refOf(item!)),
  );
  if (!items) {
    return null;
  }

  citation.citationItems = items;
  if (typeof citation.loadItemData === "function") {
    await citation.loadItemData();
  }
  return citation;
}

/**
 * Applies the patch. Returns false if the target path is missing or the
 * assignment does not provably take effect; the cause is logged.
 */
export function patch(): boolean {
  if (installed) {
    return true;
  }

  const proto = sessionProto();
  if (!proto || typeof proto._insertCitingResult !== "function") {
    ztoolkit.log(
      "FlexAnnotate: Integration.Session.prototype._insertCitingResult not found — " +
        "Nur-Nachweis-Zitieren (citeOnly) bleibt deaktiviert.",
    );
    return false;
  }
  if (typeof proto._insertItemsIntoDocument !== "function") {
    ztoolkit.log(
      "FlexAnnotate: _insertItemsIntoDocument not found — cite-only stays disabled.",
    );
    return false;
  }

  // The original is held in the closure, not via module state: an unpatch()
  // during a running call must not lead to a null access.
  const native = proto._insertCitingResult;
  const patched: InsertFn = async function (fieldIndex, field, citation) {
    try {
      if (getPref("citationOnly")) {
        const citationID =
          !(citation as any).citationID ||
          (citation as any).citationID === "flexannotate-browse"
            ? ((citation as any).citationID =
                (Zotero as any).Utilities?.randomString?.() ||
                Math.random().toString(36).slice(2))
            : (citation as any).citationID;

        const annKeys: string[] = [];
        for (const ci of citation?.citationItems ?? []) {
          const item = (Zotero as any).Cite?.getItem(ci.id) as
            Zotero.Item | undefined;
          if (item && item.isAnnotation() && item.key) {
            annKeys.push(item.key);
          }
        }

        const rewritten = await rewriteToCitationOnly(citation);
        if (rewritten) {
          if (
            isFeatureEnabled("citedTracking") &&
            annKeys.length &&
            (this as any).data?.prefs
          ) {
            const prefs = (this as any).data.prefs;
            const docData = parseDocData(prefs[DOC_CITED_PREF]);
            const next = recordDocCitation(docData, citationID, annKeys);
            prefs[DOC_CITED_PREF] = serializeDocData(next);
          }
          return [
            await this._insertItemsIntoDocument(fieldIndex, field, rewritten),
          ];
        }
      }
    } catch (e) {
      // Never let the insertion fail: in doubt continue natively.
      Zotero.logError(e as Error);
    }
    return native.call(this, fieldIndex, field, citation);
  };

  if (!assignChecked(proto, "_insertCitingResult", patched)) {
    ztoolkit.log(
      "FlexAnnotate: patch of _insertCitingResult did not take effect — " +
        "Nur-Nachweis-Zitieren (citeOnly) bleibt wirkungslos.",
    );
    return false;
  }

  let nativeResetRequest: ((doc?: unknown) => void) | undefined;
  let patchedResetRequest: ((doc?: unknown) => void) | undefined;
  if (
    isFeatureEnabled("citeprocResetFix") &&
    typeof proto.resetRequest === "function"
  ) {
    // Zotero bugfix (xpcom/integration.js:574, 1161, 1192–1195, 1914):
    // getSession() resp. setData() set session.rebuildCiteprocState = true.
    // Session.prototype.resetRequest resets this unconditionally to false,
    // before updateFromDocument() can restore the Citeproc state.
    // In the citation dialog this leads to a crash in processCitationCluster with existing citations.
    const origReset = proto.resetRequest;
    const patchedReset = function (this: SessionProto, doc?: unknown) {
      const wasRebuilding = this.rebuildCiteprocState;
      const result = origReset.call(this, doc);
      if (wasRebuilding) {
        this.rebuildCiteprocState = true;
      }
      return result;
    };
    if (assignChecked(proto, "resetRequest", patchedReset)) {
      nativeResetRequest = origReset;
      patchedResetRequest = patchedReset;
      ztoolkit.log("Patched resetRequest to preserve citeproc state");
    } else {
      ztoolkit.log("FlexAnnotate: patch of resetRequest did not take effect");
    }
  }

  installed = {
    proto,
    nativeInsert: native,
    patchedInsert: patched,
    nativeResetRequest,
    patchedResetRequest,
  };
  ztoolkit.log("Patched _insertCitingResult for citation-only mode");
  return true;
}

/** Restores the original _insertCitingResult. */
export function unpatch(): void {
  if (!installed) {
    return;
  }
  const {
    proto,
    nativeInsert,
    patchedInsert,
    nativeResetRequest,
    patchedResetRequest,
  } = installed;
  let allRestored = true;
  if (proto._insertCitingResult !== patchedInsert) {
    ztoolkit.log(
      "FlexAnnotate: Session.prototype._insertCitingResult patched by others, kept",
    );
  } else if (!assignChecked(proto, "_insertCitingResult", nativeInsert)) {
    ztoolkit.log(
      "FlexAnnotate: restore of _insertCitingResult did not take effect.",
    );
    allRestored = false;
  }
  if (nativeResetRequest && patchedResetRequest) {
    if (proto.resetRequest !== patchedResetRequest) {
      ztoolkit.log(
        "FlexAnnotate: Session.prototype.resetRequest patched by others, kept",
      );
    } else if (!assignChecked(proto, "resetRequest", nativeResetRequest)) {
      ztoolkit.log(
        "FlexAnnotate: restore of resetRequest did not take effect.",
      );
      allRestored = false;
    }
  }
  if (allRestored) {
    installed = null;
    ztoolkit.log("Removed integration patches");
  }
}

/** Whether the patch is currently active. */
export function isPatched(): boolean {
  return installed !== null;
}

/**
 * Feature registry entry. A failed patch is reported as an error
 * (logged by feature.ts), not silently ignored.
 */
export const citeOnlyPatch: Feature = {
  name: "citeOnlyPatch",
  start() {
    if (!patch()) {
      throw new Error("citeOnlyPatch: _insertCitingResult patch not active");
    }
  },
  stop() {
    unpatch();
  },
};
