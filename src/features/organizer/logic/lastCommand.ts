/**
 * lastCommand — which command from Word is re-executed in the browse window.
 * Pure logic (no Zotero) so it is node-testable.
 */

/** Commands that open the citation dialog; only these may the browse window repeat. */
const DIALOG_COMMANDS = ["addAnnotation", "addEditCitation"];

export interface CommandRef {
  agent: string;
  command: string;
  docId: string | undefined;
  templateVersion: number;
}

/**
 * The sources for the repeated command: if the cursor is in an existing citation
 * (addEditCitation), Zotero brings its sources along (integration.js:1513-1517); the selection
 * from the browse window is added instead of replacing it. The same `id` is not duplicated.
 */
export function mergeCitationItems<T extends { id?: unknown }>(
  existing: T[] | undefined,
  added: T[],
): T[] {
  const base = existing ?? [];
  const seen = new Set(base.map((i) => i.id).filter((id) => id !== undefined));
  return [
    ...base,
    ...added.filter((i) => i.id === undefined || !seen.has(i.id)),
  ];
}

/**
 * The marker after a command from Word. Other commands (refresh, addEditBibliography ...)
 * only adopt document and template and keep the dialog command; without such a one
 * there is nothing to repeat. `persistent`: the agent can have a browse window (not http).
 */
export function nextLastCommand(
  prev: CommandRef | null,
  persistent: boolean,
  agent: string,
  command: string,
  docId: string | undefined,
  templateVersion: number,
): CommandRef | null {
  if (!persistent) return null;
  if (DIALOG_COMMANDS.includes(command))
    return { agent, command, docId, templateVersion };
  if (!prev || prev.agent !== agent) return null;
  return { ...prev, docId, templateVersion };
}
