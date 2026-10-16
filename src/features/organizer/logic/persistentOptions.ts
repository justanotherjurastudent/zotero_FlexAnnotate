/**
 * Fensteroptionen für das persistente Zitierfenster (rein, ohne Zotero-Globals).
 *
 * "popup" und "alwaysRaised" nehmen dem Fenster die normale Fensterverwaltung
 * (Andocken/Snap unter Windows), deshalb werden sie entfernt.
 */

/** Position und optional Größe in Geräte-Pixeln (Features von openWindow). */
export interface WindowPosition {
  left: number;
  top: number;
  width?: number;
  height?: number;
}

export function normalizePersistentOptions(
  options?: string,
  position?: WindowPosition | null,
): string {
  const parts = (options || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "popup" && s !== "alwaysRaised");
  if (!parts.includes("dialog=no")) parts.push("dialog=no");
  if (!parts.some((s) => s.startsWith("resizable")))
    parts.push("resizable=yes");
  if (position) {
    // centerscreen würde die gemerkte Position überschreiben
    const rest = parts.filter((s) => s !== "centerscreen");
    rest.push(
      `left=${Math.round(position.left)}`,
      `top=${Math.round(position.top)}`,
    );
    if (position.width) rest.push(`width=${Math.round(position.width)}`);
    if (position.height) rest.push(`height=${Math.round(position.height)}`);
    return rest.join(",");
  }
  return parts.join(",");
}
