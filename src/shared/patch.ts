/**
 * Sets a property on an external object and verifies that the assignment held.
 * Two failure modes are possible: a non-writable target (throws TypeError under
 * "use strict") and an assignment that lands solely in an Xray expando and does
 * not reappear when read back. Without this check an ineffective monkey patch
 * cannot be distinguished from success.
 *
 * @returns true if the property is verifiably set
 */
export function assignChecked(
  target: object,
  name: string,
  value: unknown,
): boolean {
  const obj = target as Record<string, unknown>;
  try {
    obj[name] = value;
  } catch {
    return false;
  }
  return obj[name] === value;
}
