/**
 * Window options for the persistent citation window (pure, without Zotero globals).
 *
 * "popup" and "alwaysRaised" take away the window's normal window management
 * (docking/snap on Windows), so they are removed.
 */

/** Position and optional size in device pixels (features of openWindow). */
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
    // centerscreen would overwrite the remembered position
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
