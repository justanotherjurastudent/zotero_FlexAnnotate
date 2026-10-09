/**
 * Feature B – Nur-Nachweis-Zitieren (Herkunft: pre-merge:src/integrationPatch.js).
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
} from "../../core/citeOnly";
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
}

type InsertFn = (
  this: SessionProto,
  fieldIndex: number,
  field: unknown,
  citation: Citation,
) => Promise<unknown[]>;

interface Installed {
  proto: SessionProto;
  native: InsertFn;
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
        "Feature B (Nur-Nachweis-Zitieren) bleibt deaktiviert.",
    );
    return false;
  }
  if (typeof proto._insertItemsIntoDocument !== "function") {
    ztoolkit.log(
      "FlexAnnotate: _insertItemsIntoDocument not found — Feature B bleibt deaktiviert.",
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
        "Feature B (Nur-Nachweis-Zitieren) bleibt wirkungslos.",
    );
    return false;
  }

  installed = { proto, native };
  ztoolkit.log("Patched _insertCitingResult for citation-only mode");
  return true;
}

/** Stellt das ursprüngliche _insertCitingResult wieder her. */
export function unpatch(): void {
  if (!installed) {
    return;
  }
  const { proto, native } = installed;
  installed = null;
  if (!assignChecked(proto, "_insertCitingResult", native)) {
    ztoolkit.log(
      "FlexAnnotate: restore of _insertCitingResult did not take effect.",
    );
    return;
  }
  ztoolkit.log("Removed _insertCitingResult patch");
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
