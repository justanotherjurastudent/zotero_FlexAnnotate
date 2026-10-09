/**
 * Verwaltung des Platzhalter-Attachments.
 *
 * Zotero wirft beim Speichern eines Annotation-Items, wenn dessen Parent kein
 * Datei-Attachment mit `attachmentReaderType` (pdf | epub | snapshot) ist. Eine
 * Annotation direkt an einem Titel-Item ist damit nicht möglich, ebenso wenig ein
 * Linked-URL-Attachment. Für Print-Quellen hängen wir deshalb ein winziges, leeres
 * 1-Seiten-PDF unter den Titel und führen die Print-Annotationen darunter.
 * Herkunft: legacy/placeholder.js.
 */
import { buildPlaceholderPDF } from "../../core/printAnnotation";
import { getString } from "../../utils/locale";
import { getPref } from "../../utils/prefs";

/** Erkennung am Tag, nicht am Titel: ein Sprachwechsel lässt ältere Anhänge gültig */
export const TAG = "#flexannotate-placeholder";
export const FILENAME = "flexannotate-placeholder.pdf";

/**
 * @returns true, wenn das Item ein Platzhalter-Attachment ist
 */
export function isPlaceholder(item: Zotero.Item | null | undefined): boolean {
  return !!item && item.isAttachment() && item.hasTag(TAG);
}

/**
 * Liefert das Platzhalter-Attachment eines Titel-Items, oder null.
 */
export function find(item: Zotero.Item): Zotero.Item | null {
  for (const attachment of Zotero.Items.get(item.getAttachments())) {
    if (isPlaceholder(attachment)) {
      return attachment;
    }
  }
  return null;
}

/**
 * Liefert das Platzhalter-Attachment und legt es an, falls noch keins existiert.
 */
export async function ensure(item: Zotero.Item): Promise<Zotero.Item> {
  return find(item) ?? create(item);
}

/**
 * Legt das Platzhalter-Attachment unter einem regulären Titel-Item an.
 */
export async function create(item: Zotero.Item): Promise<Zotero.Item> {
  if (!item.isRegularItem()) {
    throw new Error("Placeholder parent must be a regular item");
  }

  // Zur Laufzeit erzeugt statt als Asset mitgeliefert: importFromFile() braucht einen
  // echten Dateipfad, und aus einem installierten XPI heraus ist rootURI eine jar:-URI.
  const tmpPath = PathUtils.join(Zotero.getTempDirectory().path, FILENAME);
  await IOUtils.write(tmpPath, buildPlaceholderPDF());

  // Der Titel wird beim Anlegen festgeschrieben.
  const title = getString("placeholder-title");

  try {
    const attachment = await Zotero.Attachments.importFromFile({
      file: tmpPath,
      parentItemID: item.id,
      title,
      contentType: "application/pdf",
    });
    attachment.addTag(TAG, 1);
    await attachment.saveTx();
    ztoolkit.log(
      `Created placeholder attachment ${attachment.key} for item ${item.key}`,
    );
    return attachment;
  } finally {
    await IOUtils.remove(tmpPath, { ignoreAbsent: true });
  }
}

/**
 * Entfernt das Platzhalter-Attachment, sofern keine Annotationen mehr daran hängen
 * und die Einstellung das Aufräumen erlaubt.
 *
 * @returns true, wenn entfernt wurde
 */
export async function cleanUpIfEmpty(
  attachment: Zotero.Item,
): Promise<boolean> {
  if (!isPlaceholder(attachment)) {
    return false;
  }
  if (getPref("keepEmptyPlaceholders")) {
    return false;
  }
  if (attachment.getAnnotations().length > 0) {
    return false;
  }
  await attachment.eraseTx();
  ztoolkit.log(`Removed empty placeholder attachment ${attachment.key}`);
  return true;
}
