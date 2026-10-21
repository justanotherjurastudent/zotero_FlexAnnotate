/**
 * Creation and editing of print annotations. Origin: pre-merge:src/printAnnotations.js.
 *
 * Field rules verified against Zotero 10.0.1 (item.js:4487-4555):
 *  - `annotationType` must be set before any other annotation fields
 *  - `annotationText` is only allowed for 'highlight' and 'underline'
 *  - `annotationColor` must match /#[a-f0-9]{6}/ (lowercase)
 *  - `annotationSortIndex` must match /^\d{5}\|\d{6}\|\d{5}$/ for PDF parents
 */
import {
  buildSortIndex,
  normalizeColor,
  supportsText,
} from "./logic/printAnnotation";
import {
  DEFAULT_LOCATOR,
  DEFAULT_LOCATOR_PREFIX,
  LOCATOR_PREFIX,
  locatorOf,
  locatorTagChanges,
} from "../../core/locator";
import { ensure, cleanUpIfEmpty, isPlaceholder } from "./placeholder";
import { getString } from "../../utils/locale";
import { getPref, setPref } from "../../utils/prefs";

export interface PrintAnnotationData {
  /** Print page number as it should be cited */
  pageLabel?: string | number;
  /** Quotation text (only for type 'highlight'/'underline') */
  text?: string;
  comment?: string;
  color?: string;
  /** Default 'highlight' */
  type?: _ZoteroTypes.Annotations.AnnotationType;
  /** CSL locator, e.g. 'page' or 'paragraph' */
  locator?: string;
  /** Tags to attach to the annotation */
  tags?: string[];
}

/** Only set fields (!== undefined) are updated. */
export type PrintAnnotationUpdate = Omit<PrintAnnotationData, "type" | "tags">;

/**
 * Creates a print annotation under the placeholder attachment of a regular item.
 */
export async function create(
  item: Zotero.Item,
  data: PrintAnnotationData,
  target?: Zotero.Item | null,
): Promise<Zotero.Item> {
  const attachment = target ?? (await ensure(item));
  const type = data.type || "highlight";
  let comment = data.comment || "";

  const annotation = new Zotero.Item("annotation");
  annotation.libraryID = attachment.libraryID;
  annotation.parentID = attachment.id;
  // Must be set first, otherwise item.js:4488 throws
  annotation.annotationType = type;

  if (supportsText(type)) {
    annotation.annotationText = data.text || "";
  } else if (data.text) {
    // For 'note' Zotero has no quotation field (item.js:4507): the text is moved
    // into the comment instead of being silently lost.
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
  // annotationPageLabel reads back as null after saving if it was empty
  // (item.js:2290 writes pageLabel || null) — otherwise "null" would appear in log.
  ztoolkit.log(
    `Created print annotation ${annotation.key} on page "${annotation.annotationPageLabel || ""}"`,
  );
  return annotation;
}

/**
 * Updates an existing print annotation. Only set fields are updated.
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
    // Native annotations' sortIndex encodes the position within the document
    // and must not be overwritten from the page label.
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
 * Deletes a print annotation and cleans up the placeholder attachment if empty.
 */
export async function erase(annotation: Zotero.Item): Promise<void> {
  const attachment = annotation.parentItem;
  await annotation.eraseTx();
  if (attachment) {
    await cleanUpIfEmpty(attachment);
  }
}

/**
 * Context menu "Delete annotation": asks before every deletion (pref
 * confirmDeleteAnnotation, can be switched off in the dialog). Zotero deletes annotations
 * permanently (reader.js onDeleteAnnotations: eraseTx); there is no trash and no undo.
 */
export async function eraseWithConfirm(
  win: Window,
  annotation: Zotero.Item,
  confirm: (title: string, text: string) => boolean = (title, text) => {
    const dontAsk = { value: false };
    const ok = Services.prompt.confirmCheck(
      win as mozIDOMWindowProxy,
      title,
      text,
      getString("annotation-delete-dont-ask"),
      dontAsk,
    );
    if (ok && dontAsk.value) setPref("confirmDeleteAnnotation", false);
    return ok;
  },
): Promise<void> {
  if (
    getPref("confirmDeleteAnnotation") &&
    !confirm(
      getString("annotation-delete-title"),
      getString("annotation-delete-confirm"),
    )
  ) {
    return;
  }
  await erase(annotation);
}

/**
 * Returns the locator type of an annotation: first its own tag, then the document
 * (attachment) default, falling back to 'page'. Applies to print annotations and
 * annotations in PDF/EPUB/Snapshot alike.
 */
export function getLocator(annotation: Zotero.Item): string {
  return locatorOf(
    knownLocatorTags(tagsOf(annotation), LOCATOR_PREFIX),
    knownLocatorTags(tagsOf(annotation.parentItem), DEFAULT_LOCATOR_PREFIX),
  );
}

/**
 * Document default locator. Stored as an automatic tag on the attachment and applies
 * to all annotations beneath it that lack their own locator tag.
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
 * Checks whether an annotation has an explicit FlexAnnotate locator tag.
 */
export function hasExplicitLocator(annotation: Zotero.Item | null): boolean {
  if (!annotation || typeof annotation.getTags !== "function") {
    return false;
  }
  return annotation.getTags().some((tag) => tag.tag.startsWith(LOCATOR_PREFIX));
}

/**
 * Sets the default locator of a document and saves the attachment. 'page' is the
 * baseline state and removes the tag. Existing annotations without an explicit tag
 * are frozen to the prior default so the new default does not retroactively change them.
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
 * Sets the locator tag without saving. Without its own tag an annotation follows its
 * document default. If 'page' is chosen on a document with a non-page default,
 * an explicit tag is required; it is only omitted when matching the global default.
 */
export function applyLocatorTag(
  annotation: Zotero.Item,
  locator?: string,
): void {
  // Unknown values only clear previous tags without setting a new one.
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

/** Tag strings of an item; missing item yields an empty array. */
function tagsOf(item: Zotero.Item | false | null | undefined): string[] {
  return item ? item.getTags().map((t) => t.tag) : [];
}

/** Only tags with prefix whose value is a known locator (legacy ignores other tags). */
function knownLocatorTags(tags: string[], prefix: string): string[] {
  return tags.filter(
    (t) => t.startsWith(prefix) && isKnownLocator(t.slice(prefix.length)),
  );
}

/** Zotero's CSL labels plus 'margin' (Randnummer), matching the legacy version. */
function isKnownLocator(locator: string): boolean {
  return Zotero.Cite.labels.includes(locator) || locator === "margin";
}
