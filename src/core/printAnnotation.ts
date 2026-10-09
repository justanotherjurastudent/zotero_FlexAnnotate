/**
 * Reine Regeln für Print-Annotationen, ohne Zotero-Globals (in Node testbar).
 * Herkunft: legacy/printAnnotations.js und legacy/placeholder.js.
 */

export const DEFAULT_COLOR = "#ffd400";

/**
 * Sortierschlüssel nach Druckseite, Format \d{5}|\d{6}|\d{5}. Maßgeblich ist die erste
 * Ziffernfolge im Label: "Rn. 12" sortiert wie 12. Labels ohne Ziffern (z. B. "XIV")
 * bekommen 99999 und landen damit hinten.
 */
export function buildSortIndex(
  pageLabel: string | number | null | undefined,
): string {
  const match = String(pageLabel ?? "").match(/\d+/);
  const page = match ? Math.min(parseInt(match[0], 10), 99999) : 99999;
  return [String(page).padStart(5, "0"), "000000", "00000"].join("|");
}

/** 6-stelliger Kleinbuchstaben-Hexwert, sonst DEFAULT_COLOR. */
export function normalizeColor(color?: string | null): string {
  const value = String(color || "")
    .trim()
    .toLowerCase();
  return /^#[a-f0-9]{6}$/.test(value) ? value : DEFAULT_COLOR;
}

/**
 * Minimales, gültiges 1-Seiten-PDF (A4, leer). Die xref-Offsets werden berechnet,
 * damit pdf.js die Datei ohne Reparaturlauf öffnet.
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

  // Reines ASCII, daher stimmen String-Länge und Bytelänge überein.
  return new TextEncoder().encode(pdf);
}
