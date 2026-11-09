/**
 * Pure logic for state retention across companion window reloads and item additions:
 * - Outline node and search filter retention
 * - Ignoring focus-based empty input events from bubbleInput refocus
 * - Finding scroll targets for last inserted item
 */

export function shouldIgnoreSearchInput(eventType?: string): boolean {
  return eventType === "focus";
}

export function resolveInitialNode(
  viewNode?: string | null,
  lastNode?: string | null,
): string {
  if (viewNode && viewNode !== "all" && viewNode !== "none") return viewNode;
  if (lastNode && lastNode !== "all" && lastNode !== "none") return lastNode;
  const fallback = viewNode || lastNode;
  return fallback && fallback.length > 0 ? fallback : "all";
}

export function resolveInitialQuery(
  viewQuery?: string | null,
  lastQuery?: string | null,
  bubbleQuery?: string | null,
): string {
  if (viewQuery && viewQuery.trim().length > 0) return viewQuery;
  if (lastQuery && lastQuery.trim().length > 0) return lastQuery;
  return bubbleQuery ?? "";
}

export function shouldScrollToItem(
  keepScroll: boolean,
  lastInsertedID: number | null | undefined,
): boolean {
  return (
    !keepScroll && typeof lastInsertedID === "number" && lastInsertedID > 0
  );
}
