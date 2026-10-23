/**
 * Nur-Nachweis-Zitieren (citeOnly) (Herkunft: pre-merge:src/integrationPatch.js).
 *
 * Angriffspunkt (verifiziert gegen Zotero 10.0.5, xpcom/integration.js:1678-1701):
 * `Zotero.Integration.Session.prototype._insertCitingResult` zweigt ab, sobald die
 * zitierten Items Annotationen sind, und schiebt sie als Mock-Note ins Dokument.
 * Im Modus „nur Nachweis“ wird stattdessen der reguläre Zitationspfad
 * `_insertItemsIntoDocument()` (integration.js:1778-1785) genommen, mit dem
 * Elterntitel als zitiertem Item und `annotationPageLabel` als Locator.
 *
 * `insertAnnotations` ist kein Angriffspunkt: es gibt es nur auf
 * `Zotero.EditorInstance`, nicht auf `Integration.Session`.
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

/** Gesetzt, solange der Patch aktiv ist; hält das Original für unpatch(). */
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
    // Bei Print-Quellen ist die Fundstelle oft keine Seite (Randnummer, Paragraf …);
    // der Typ hängt an der Annotation bzw. am Dokument-Default.
    locatorType: pageLabel ? getLocator(annotation) : "",
  };
}

/**
 * Baut aus einer Annotations-Citation eine gewöhnliche Zitation auf die Elterntitel.
 * Die Citation wird in place geändert und dasselbe Objekt zurückgegeben: ein Klon
 * verlöre den Prototyp von Zotero.Integration.Citation, den die Session später für
 * .serialize() braucht. Mutiert wird erst nach vollständiger Validierung.
 *
 * @return Dieselbe Citation, oder null wenn der Fall nicht zutrifft (nativ weiter).
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
    // Gemischte oder reguläre Auswahl: nicht unser Fall.
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
 * Wendet den Patch an. Gibt false zurück, wenn der Zielpfad fehlt oder die
 * Zuweisung nicht nachweislich greift; die Ursache wird geloggt.
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

  // Das Original wird im Closure gehalten, nicht über den Modulzustand: ein unpatch()
  // während eines laufenden Aufrufs darf nicht zu einem Zugriff auf null führen.
  const native = proto._insertCitingResult;
  const patched: InsertFn = async function (fieldIndex, field, citation) {
    try {
      if (getPref("citationOnly")) {
        const rewritten = await rewriteToCitationOnly(citation);
        if (rewritten) {
          return [
            await this._insertItemsIntoDocument(fieldIndex, field, rewritten),
          ];
        }
      }
    } catch (e) {
      // Nie den Einfügevorgang scheitern lassen: im Zweifel nativ weitermachen.
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
  if (typeof proto.resetRequest === "function") {
    // Zotero-Bugfix (xpcom/integration.js:574, 1161, 1192–1195, 1914):
    // getSession() bzw. setData() setzen session.rebuildCiteprocState = true.
    // Session.prototype.resetRequest setzt dies bedingungslos auf false zurueck,
    // noch bevor updateFromDocument() den Citeproc-Zustand wiederherstellen kann.
    // Das fuehrt im Zitierdialog bei vorhandenen Zitaten zum Absturz in processCitationCluster.
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

/** Stellt das ursprüngliche _insertCitingResult wieder her. */
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

/** Ob der Patch gerade aktiv ist. */
export function isPatched(): boolean {
  return installed !== null;
}

/**
 * Feature-Registry-Eintrag. Ein fehlgeschlagener Patch wird als Fehler gemeldet
 * (feature.ts protokolliert ihn), nicht still ignoriert.
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
