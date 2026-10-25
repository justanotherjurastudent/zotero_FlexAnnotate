/**
 * Management of placeholder attachments.
 *
 * Zotero throws when saving an annotation item if its parent is not a
 * file attachment with `attachmentReaderType` (pdf | epub | snapshot).
 * Attaching an annotation directly to a regular item is therefore not supported,
 * nor is attaching one to a linked-URL attachment. For print sources we attach
 * a tiny, blank 1-page PDF under the item and store print annotations beneath it.
 * Origin: pre-merge:src/placeholder.js.
 */
import { buildPlaceholderPDF } from "./logic/printAnnotation";
import { getString } from "../../utils/locale";
import { getPref } from "../../utils/prefs";

/** Identified by tag rather than title, so existing attachments survive UI language changes */
export const TAG = "#flexannotate-placeholder";
export const FILENAME = "flexannotate-placeholder.pdf";

/**
 * @returns true if the item is a placeholder attachment
 */
export function isPlaceholder(item: Zotero.Item | null | undefined): boolean {
  return !!item && item.isAttachment() && item.hasTag(TAG);
}

/**
 * Returns the placeholder attachment of a regular item, or null.
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
 * Returns the placeholder attachment, creating it if it does not exist yet.
 */
export async function ensure(item: Zotero.Item): Promise<Zotero.Item> {
  return find(item) ?? create(item);
}

/**
 * Creates the placeholder attachment under a regular item.
 */
export async function create(item: Zotero.Item): Promise<Zotero.Item> {
  if (!item.isRegularItem()) {
    throw new Error("Placeholder parent must be a regular item");
  }

  // Generated at runtime instead of packaged as an asset: importFromFile() requires a
  // real filesystem path, and inside an installed XPI rootURI is a jar: URI.
  const tmpPath = PathUtils.join(Zotero.getTempDirectory().path, FILENAME);
  await IOUtils.write(tmpPath, buildPlaceholderPDF());

  // The title is set upon creation.
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
 * Removes the placeholder attachment if it has no annotations left
 * and the preference permits cleanup.
 *
 * @returns true if removed
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
