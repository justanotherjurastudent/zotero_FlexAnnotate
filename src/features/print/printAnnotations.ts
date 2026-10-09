/**
 * Anlegen und Bearbeiten von Print-Annotationen. Herkunft: legacy/printAnnotations.js.
 *
 * Feldregeln verifiziert gegen Zotero 10.0.1 (item.js:4487-4555):
 *  - `annotationType` muss vor allen anderen Annotation-Feldern gesetzt werden
 *  - `annotationText` ist nur bei 'highlight' und 'underline' erlaubt
 *  - `annotationColor` muss /#[a-f0-9]{6}/ erfüllen (Kleinbuchstaben)
 *  - `annotationSortIndex` muss bei PDF-Parent /^\d{5}\|\d{6}\|\d{5}$/ erfüllen
 */
import {
  buildSortIndex,
  normalizeColor,
  supportsText,
} from "../../core/printAnnotation";
import {
  DEFAULT_LOCATOR,
  DEFAULT_LOCATOR_PREFIX,
  LOCATOR_PREFIX,
  locatorOf,
  locatorTagChanges,
} from "../../core/locator";
import { ensure, cleanUpIfEmpty, isPlaceholder } from "./placeholder";

export interface PrintAnnotationData {
  /** Druckseitenzahl, wie sie zitiert werden soll */
  pageLabel?: string | number;
  /** Zitat (nur bei type 'highlight'/'underline') */
  text?: string;
  comment?: string;
  color?: string;
  /** Standard 'highlight' */
  type?: _ZoteroTypes.Annotations.AnnotationType;
  /** CSL-Locator, z. B. 'page' oder 'paragraph' */
  locator?: string;
  /** Schlagwörter, die an die Annotation gehängt werden */
  tags?: string[];
}

/** Nur gesetzte Felder (!== undefined) werden übernommen. */
export type PrintAnnotationUpdate = Omit<PrintAnnotationData, "type" | "tags">;

/**
 * Legt eine Print-Annotation unter dem Platzhalter-Attachment eines Titels an.
 */
export async function create(
  item: Zotero.Item,
  data: PrintAnnotationData,
): Promise<Zotero.Item> {
  const attachment = await ensure(item);
  const type = data.type || "highlight";
  let comment = data.comment || "";

  const annotation = new Zotero.Item("annotation");
  annotation.libraryID = attachment.libraryID;
  annotation.parentID = attachment.id;
  // Muss zuerst gesetzt werden, sonst wirft item.js:4488
  annotation.annotationType = type;

  if (supportsText(type)) {
    annotation.annotationText = data.text || "";
  } else if (data.text) {
    // Bei 'note' kennt Zotero kein Zitatfeld (item.js:4507): der Text wandert in
    // den Kommentar, statt stillschweigend verloren zu gehen.
    comment = [data.text, comment].filter(Boolean).join("\n\n");
  }

  annotation.annotationComment = comment;
  annotation.annotationColor = normalizeColor(data.color);
  annotation.annotationPageLabel = String(data.pageLabel ?? "").trim();
  annotation.annotationSortIndex = buildSortIndex(data.pageLabel);
  annotation.annotationPosition = JSON.stringify({
    pageIndex: 0,
    rects: [[0, 0, 0, 0]],
  });

  applyLocatorTag(annotation, data.locator);

  for (const tag of data.tags || []) {
    annotation.addTag(tag);
  }

  await annotation.saveTx();
  // annotationPageLabel liest sich nach dem Speichern als null zurück, wenn es leer
  // war (item.js:2290 schreibt `pageLabel || null`) — sonst stünde "null" im Log.
  ztoolkit.log(
    `Created print annotation ${annotation.key} on page "${annotation.annotationPageLabel || ""}"`,
  );
  return annotation;
}

/**
 * Ändert eine bestehende Print-Annotation. Nur gesetzte Felder werden übernommen.
 */
export async function update(
  annotation: Zotero.Item,
  data: PrintAnnotationUpdate,
): Promise<Zotero.Item> {
  if (!annotation.isAnnotation()) {
    throw new Error("Not an annotation item");
  }

  if (data.text !== undefined && supportsText(annotation.annotationType)) {
    annotation.annotationText = data.text;
  }
  if (data.comment !== undefined) {
    annotation.annotationComment = data.comment;
  }
  if (data.color !== undefined) {
    annotation.annotationColor = normalizeColor(data.color);
  }
  if (data.pageLabel !== undefined) {
    annotation.annotationPageLabel = String(data.pageLabel).trim();
    // Der sortIndex nativer Annotationen kodiert die Position im Dokument und darf
    // nicht aus der Seitenzahl überschrieben werden.
    if (isPlaceholder(annotation.parentItem)) {
      annotation.annotationSortIndex = buildSortIndex(data.pageLabel);
    }
  }
  if (data.locator !== undefined) {
    applyLocatorTag(annotation, data.locator);
  }

  await annotation.saveTx();
  ztoolkit.log(`Updated print annotation ${annotation.key}`);
  return annotation;
}

/**
 * Löscht eine Print-Annotation und räumt ein leer gewordenes Platzhalter-Attachment auf.
 */
export async function erase(annotation: Zotero.Item): Promise<void> {
  const attachment = annotation.parentItem;
  await annotation.eraseTx();
  if (attachment) {
    await cleanUpIfEmpty(attachment);
  }
}

/**
 * Liefert den Locator-Typ einer Annotation: erst der eigene Tag, dann der Standard
 * des Dokuments (Anhangs), zuletzt 'page'. Gilt für Print-Annotationen und für
 * Annotationen in PDF/EPUB/Snapshot gleichermaßen.
 */
export function getLocator(annotation: Zotero.Item): string {
  return locatorOf(
    knownLocatorTags(tagsOf(annotation), LOCATOR_PREFIX),
    knownLocatorTags(tagsOf(annotation.parentItem), DEFAULT_LOCATOR_PREFIX),
  );
}

/**
 * Standard-Locator eines Dokuments. Er hängt als automatischer Tag am Anhang und gilt
 * für alle Annotationen darunter, die keinen eigenen Locator-Tag tragen.
 */
export function getDefaultLocator(
  attachment: Zotero.Item | null | undefined,
): string {
  return locatorOf(
    [],
    knownLocatorTags(tagsOf(attachment), DEFAULT_LOCATOR_PREFIX),
  );
}

/**
 * Prüft, ob eine Annotation einen ausdrücklichen FlexAnnotate-Locator-Tag besitzt.
 */
export function hasExplicitLocator(annotation: Zotero.Item | null): boolean {
  if (!annotation || typeof annotation.getTags !== "function") {
    return false;
  }
  return annotation.getTags().some((tag) => tag.tag.startsWith(LOCATOR_PREFIX));
}

/**
 * Setzt den Standard-Locator eines Dokuments und speichert den Anhang. 'page' ist der
 * Grundzustand und entfernt den Tag wieder. Bestehende Annotationen ohne expliziten
 * Tag werden auf den bisherigen Standard eingefroren, damit die künftige Vorgabe nicht
 * rückwirkend bestehende Annotationen ändert.
 */
export async function setDefaultLocator(
  attachment: Zotero.Item | null,
  locator: string,
  excludeAnnotationKey: string | number | null = null,
): Promise<void> {
  if (!attachment || !attachment.isAttachment() || !attachment.isEditable()) {
    return;
  }
  if (!isKnownLocator(locator)) {
    throw new Error(`Unknown locator type: ${locator}`);
  }
  const previousDefault = getDefaultLocator(attachment);
  if (previousDefault === locator) {
    return;
  }

  for (const ann of attachment.getAnnotations()) {
    if (
      excludeAnnotationKey &&
      (ann.key === excludeAnnotationKey || ann.id === excludeAnnotationKey)
    ) {
      continue;
    }
    if (ann.isEditable?.() !== false && !hasExplicitLocator(ann)) {
      ann.addTag(LOCATOR_PREFIX + previousDefault, 1);
      await ann.saveTx();
    }
  }

  for (const tag of attachment.getTags()) {
    if (tag.tag.startsWith(DEFAULT_LOCATOR_PREFIX)) {
      attachment.removeTag(tag.tag);
    }
  }
  if (locator !== DEFAULT_LOCATOR) {
    attachment.addTag(DEFAULT_LOCATOR_PREFIX + locator, 1);
  }
  await attachment.saveTx();
  ztoolkit.log(`Default locator of ${attachment.key} is now "${locator}"`);
}

/**
 * Setzt den Locator-Tag; speichert nicht selbst. Ohne eigenen Tag folgt eine Annotation
 * dem Standard ihres Dokuments. Wählt jemand 'page', obwohl das Dokument einen anderen
 * Standard hat, muss das ein ausdrücklicher Tag sein; nur im Grundzustand entfällt er.
 */
export function applyLocatorTag(
  annotation: Zotero.Item,
  locator?: string,
): void {
  // Unbekannte Werte entfernen nur die alten Tags, es wird kein neuer gesetzt.
  const known = locator && isKnownLocator(locator) ? locator : "";
  const changes = locatorTagChanges(
    tagsOf(annotation),
    knownLocatorTags(tagsOf(annotation.parentItem), DEFAULT_LOCATOR_PREFIX),
    known,
  );
  for (const tag of changes.remove) {
    annotation.removeTag(tag);
  }
  for (const { tag, type } of changes.add) {
    annotation.addTag(tag, type);
  }
}

/** Tag-Texte eines Items; fehlendes Item ergibt keine Tags. */
function tagsOf(item: Zotero.Item | false | null | undefined): string[] {
  return item ? item.getTags().map((t) => t.tag) : [];
}

/** Nur Tags mit dem Präfix, deren Wert ein bekannter Locator ist (Legacy ignoriert andere). */
function knownLocatorTags(tags: string[], prefix: string): string[] {
  return tags.filter(
    (t) => t.startsWith(prefix) && isKnownLocator(t.slice(prefix.length)),
  );
}

/** Zoteros CSL-Labels plus 'margin' (Randnummer), wie in der Legacy-Version. */
function isKnownLocator(locator: string): boolean {
  return Zotero.Cite.labels.includes(locator) || locator === "margin";
}
