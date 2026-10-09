/**
 * Setzt eine Eigenschaft auf einem fremden Objekt und weist nach, dass sie steht.
 * Zwei Fehlerbilder sind möglich: ein nicht schreibbares Ziel (unter
 * "use strict" ein TypeError) und eine Zuweisung, die nur in einem
 * Xray-Expando landet und beim Zurücklesen nicht wieder auftaucht. Ohne diese
 * Prüfung ist ein wirkungsloser Patch von einem gelungenen nicht zu unterscheiden.
 *
 * @return true, wenn die Eigenschaft nachweislich gesetzt ist
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
