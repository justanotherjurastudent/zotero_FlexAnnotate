/** Citation string for an item, honouring the user's QuickCopy style. */
export function citationFor(item: Zotero.Item): string {
  try {
    const format = Zotero.QuickCopy.getFormatFromURL(
      (Zotero.QuickCopy as any).lastActiveURL || "",
    );
    const content = (Zotero.QuickCopy as any).getContentFromItems(
      [item],
      format,
    );
    const text = (content?.text || "").trim();
    if (text) return text;
  } catch (e) {
    ztoolkit.log("annotationExport citation failed, using fallback:", e);
  }
  return fallbackCitation(item);
}

/** Author (Year). Title. — used when the citation engine is unavailable. */
function fallbackCitation(item: Zotero.Item): string {
  try {
    const creator = item.getField("firstCreator") as string;
    const date = (item.getField("date") as string) || "";
    const year = (date.match(/\d{4}/) || [""])[0];
    const title = item.getDisplayTitle();
    const parts = [creator, year ? `(${year})` : "", title].filter(Boolean);
    return parts.join(" ").replace(/\s+/g, " ").trim() || title;
  } catch {
    return item.getDisplayTitle?.() || "(untitled source)";
  }
}
