/**
 * Feature registry: each feature exposes optional lifecycle hooks.
 * Helper functions invoke them safely so a failing feature neither blocks
 * other features nor causes caller exceptions. Errors are logged.
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
 * Default logger. Resolves `ztoolkit` at runtime so the module remains
 * importable without Zotero globals (Node unit tests). Never throws.
 */
export const defaultLogger: FeatureLogger = (feature, hook, e) => {
  try {
    ztoolkit.log(`feature ${feature}.${hook} failed:`, e);
  } catch {
    // Logging must not disturb caller flow.
  }
  try {
    Zotero.logError(e as Error);
  } catch {
    // likewise
  }
};

/**
 * Invokes a lifecycle hook. Returns a Promise if the hook is async;
 * the Promise never rejects. Synchronous errors are logged immediately.
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

/** Starts all features in sequence; awaits async hooks. */
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

/** Stops all features in reverse order. */
export function stopAll(
  features: Feature[],
  log: FeatureLogger = defaultLogger,
): void {
  for (let i = features.length - 1; i >= 0; i--) {
    const f = features[i];
    invoke(f, "stop", () => f.stop?.(), log);
  }
}

/** Adds all features to a main window. */
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

/** Removes all features from a main window in reverse order. */
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
