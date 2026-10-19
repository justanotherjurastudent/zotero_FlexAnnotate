/**
 * lastCommand — welcher Befehl aus Word im Blätterfenster erneut ausgeführt wird.
 * Reine Logik (kein Zotero), damit sie in Node testbar ist.
 */

/** Befehle, die den Zitierdialog öffnen; nur diese darf das Blätterfenster wiederholen. */
const DIALOG_COMMANDS = ["addAnnotation", "addEditCitation"];

export interface CommandRef {
  agent: string;
  command: string;
  docId: string | undefined;
  templateVersion: number;
}

/**
 * Die Quellen für den wiederholten Befehl: steht der Cursor in einem bestehenden Zitat
 * (addEditCitation), bringt Zotero dessen Quellen mit (integration.js:1513-1517); die Auswahl
 * aus dem Blätterfenster kommt dazu, statt sie zu ersetzen. Gleiche `id` wird nicht doppelt.
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
 * Der Merker nach einem Befehl von Word. Andere Befehle (refresh, addEditBibliography ...)
 * übernehmen nur Dokument und Vorlage und behalten den Dialogbefehl; ohne einen solchen
 * gibt es nichts zu wiederholen. `persistent`: der Agent kann ein Blätterfenster (nicht http).
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
