/**
 * Zitierte Anmerkungen im Zitierdialog: Speicher in einer Pref (je Dokument
 * eine Sitzungs-Id), Übernahme beim Akzeptieren (io.accept) und die Werke,
 * die schon im Dokument zitiert sind. Keine Anzeige hier.
 */

import { parseStore, record } from "../../core/cited";
import type { CitedStore } from "../../core/cited";

const CITED_PREF = "citedAnnotations";

function prefKey(name: string): string {
  return `${addon.data.config.prefsPrefix}.${name}`;
}

export function readCitedStore(): CitedStore {
  try {
    return parseStore(Zotero.Prefs.get(prefKey(CITED_PREF), true) as string);
  } catch {
    return {};
  }
}

/** Wirft bei Fehlern; der Aufrufer entscheidet, ob er protokolliert. */
export function writeCitedStore(store: CitedStore): void {
  Zotero.Prefs.set(prefKey(CITED_PREF), JSON.stringify(store), true);
}

/** Id of the document the dialog was opened from (stored in the document). */
export function currentSessionId(): string {
  const session = (Zotero as any).Integration?.currentSession;
  return String(session?.sessionID ?? "unknown");
}

/**
 * Works cited in the document. Zotero loads this when the dialog opens, so we
 * wait for the same promise the dialog itself waits for (max. 5 s) instead of
 * reading a possibly still empty map.
 */
export async function citedWorksOf(win: Window): Promise<Set<number> | null> {
  let map: Record<string, unknown> | null = null;
  try {
    const loaded = (win as any).io?.allCitedDataLoadedPromise;
    if (loaded) {
      const result: any = await Promise.race([
        loaded,
        new Promise((resolve) => win.setTimeout(() => resolve(null), 5000)),
      ]);
      map = result?.[1] ?? null;
    }
  } catch (e) {
    ztoolkit.log("flexannotate cited works wait failed:", e);
  }
  map ??=
    (Zotero as any).Integration?.currentSession?.citationsByItemID ?? null;
  return map ? new Set<number>(Object.keys(map).map((k) => Number(k))) : null;
}

/** Remember which annotations the accepted citation contains. */
function recordCited(io: any) {
  if (!io?.isAddingAnnotations) return;
  const entries: { id: number; workID: number }[] = [];
  for (const ci of io.citation?.citationItems ?? []) {
    const item = Zotero.Items.get(ci.id) as Zotero.Item | false;
    if (!item || !item.isAnnotation()) continue;
    const attachment = item.parentItem as Zotero.Item | undefined;
    entries.push({ id: item.id, workID: Number(attachment?.parentID) || 0 });
  }
  if (!entries.length) return;
  writeCitedStore(record(readCitedStore(), currentSessionId(), entries));
}

/** Wraps io.accept once per dialog so that the accepted citation is remembered. */
export function hookAccept(win: Window): void {
  const io = (win as any).io;
  if (io && typeof io.accept === "function" && !io.__flexannotateHooked) {
    const original = io.accept;
    io.accept = function (...args: unknown[]) {
      try {
        recordCited(io);
      } catch (e) {
        ztoolkit.log("flexannotate record cited failed:", e);
      }
      return original.apply(this, args);
    };
    io.__flexannotateHooked = true;
  }
}
