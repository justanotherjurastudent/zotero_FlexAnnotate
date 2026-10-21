/**
 * Pure rules for print annotations, without Zotero globals (testable in Node).
 * Origin: pre-merge:src/printAnnotations.js and pre-merge:src/placeholder.js.
 */

export const DEFAULT_COLOR = "#ffd400";

/**
 * Zotero's eight standard colors as [l10n key, hex], in reader order.
 * Source: .zotero-reference/10.0.5/.../xpcom/annotations.js:40-52 (COLORS). Zotero 8/9
 * uses the same general-* keys (en-US/zotero/zotero.ftl), 7.x uses general.* in
 * zotero.properties; hex values from 7.x to 9.x are only partially covered in xpcom/reader.js:113-117
 * (Mendeley mapping). Reader source code is not present in references.
 */
export const STANDARD_COLORS: [string, string][] = [
  ["general-yellow", "#ffd400"],
  ["general-red", "#ff6666"],
  ["general-green", "#5fb236"],
  ["general-blue", "#2ea8e5"],
  ["general-purple", "#a28ae5"],
  ["general-magenta", "#e56eee"],
  ["general-orange", "#f19837"],
  ["general-gray", "#aaaaaa"],
];

/**
 * Uses Zotero.Annotations.COLORS if available (10.x) and correctly shaped,
 * falling back to the standard list. Validates shape because the value originates externally.
 */
export function annotationColors(zoteroColors?: unknown): [string, string][] {
  const valid =
    Array.isArray(zoteroColors) &&
    zoteroColors.length > 0 &&
    zoteroColors.every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        typeof pair[0] === "string" &&
        /^#[0-9a-f]{6}$/i.test(String(pair[1])),
    );
  return valid ? (zoteroColors as [string, string][]) : STANDARD_COLORS;
}

/** Zotero only allows annotationText for highlight/underline (item.js:4507). */
export function supportsText(type: string): boolean {
  return type === "highlight" || type === "underline";
}

/**
 * Does the annotation have a text passage? Print annotations (also on a real PDF)
 * carry the placeholder position with empty rectangles; the position of other formats
 * (EPUB, snapshot) has no `rects` and counts as a passage. Unreadable = none.
 */
export function hasPassage(position: string): boolean {
  try {
    const { rects } = JSON.parse(position);
    return (
      !Array.isArray(rects) ||
      rects.some((r: number[]) => r.some((n) => n !== 0))
    );
  } catch {
    return false;
  }
}

/**
 * Sort index by print page, formatted as \d{5}|\d{6}|\d{5}. Determined by the first
 * digit sequence in label: "para. 12" sorts as 12. Labels without digits (e.g. "XIV")
 * receive 99999 and sort to the end.
 */
export function buildSortIndex(
  pageLabel: string | number | null | undefined,
): string {
  const match = String(pageLabel ?? "").match(/\d+/);
  const page = match ? Math.min(parseInt(match[0], 10), 99999) : 99999;
  return [String(page).padStart(5, "0"), "000000", "00000"].join("|");
}

/** 6-character lowercase hex string, otherwise DEFAULT_COLOR. */
export function normalizeColor(color?: string | null): string {
  const value = String(color || "")
    .trim()
    .toLowerCase();
  return /^#[a-f0-9]{6}$/.test(value) ? value : DEFAULT_COLOR;
}

/**
 * Minimal valid 1-page PDF (A4, blank). The xref offsets are computed
 * so pdf.js opens the file without needing a repair pass.
 */
export function buildPlaceholderPDF(): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;

  // Pure ASCII, so string length and byte length match.
  return new TextEncoder().encode(pdf);
}
