/**
 * Feature-Registry: jedes Feature hat optionale Lebenszyklus-Hooks. Die
 * Hilfsfunktionen rufen sie so auf, dass ein fehlerhaftes Feature weder die
 * anderen aufhält noch den Aufrufer wirft. Fehler werden protokolliert.
 */

export interface Feature {
  name: string;
  start?(): void | Promise<void>;
  stop?(): void;
  addToWindow?(win: _ZoteroTypes.MainWindow): void | Promise<void>;
  removeFromWindow?(win: _ZoteroTypes.MainWindow): void;
}

export type FeatureLogger = (feature: string, hook: string, e: unknown) => void;

/**
 * Standard-Logger. Liest `ztoolkit` erst zur Laufzeit, damit das Modul auch
 * ohne Zotero-Globals (Node-Tests) importierbar bleibt. Wirft nie.
 */
export const defaultLogger: FeatureLogger = (feature, hook, e) => {
  try {
    ztoolkit.log(`feature ${feature}.${hook} failed:`, e);
  } catch {
    // Protokollieren darf den Aufrufer nicht stören.
  }
  try {
    Zotero.logError(e as Error);
  } catch {
    // ebenso
  }
};

/**
 * Ruft einen Hook auf. Liefert ein Promise, wenn der Hook asynchron ist; das
 * Promise wirft nie. Sync-Fehler werden sofort protokolliert.
 */
function invoke(
  feature: Feature,
  hook: string,
  fn: () => unknown,
  log: FeatureLogger,
): Promise<void> | undefined {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(
        () => undefined,
        (e: unknown) => log(feature.name, hook, e),
      );
    }
  } catch (e) {
    log(feature.name, hook, e);
  }
  return undefined;
}

/** Startet alle Features in Reihenfolge; async Hooks werden abgewartet. */
export async function startAll(
  features: Feature[],
  log: FeatureLogger = defaultLogger,
): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const f of features) {
    const p = invoke(f, "start", () => f.start?.(), log);
    if (p) pending.push(p);
  }
  await Promise.all(pending);
}

/** Stoppt alle Features in umgekehrter Reihenfolge. */
export function stopAll(
  features: Feature[],
  log: FeatureLogger = defaultLogger,
): void {
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i];
    invoke(f, "stop", () => f.stop?.(), log);
  }
}

/** Fügt alle Features einem Hauptfenster hinzu. */
export async function addToWindow(
  features: Feature[],
  win: _ZoteroTypes.MainWindow,
  log: FeatureLogger = defaultLogger,
): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const f of features) {
    const p = invoke(f, "addToWindow", () => f.addToWindow?.(win), log);
    if (p) pending.push(p);
  }
  await Promise.all(pending);
}

/** Entfernt alle Features aus einem Hauptfenster in umgekehrter Reihenfolge. */
export function removeFromWindow(
  features: Feature[],
  win: _ZoteroTypes.MainWindow,
  log: FeatureLogger = defaultLogger,
): void {
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i];
    invoke(f, "removeFromWindow", () => f.removeFromWindow?.(win), log);
  }
}
