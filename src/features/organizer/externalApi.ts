/**
 * externalApi — public plugin-to-plugin interface for FlexAnnotate.
 *
 * Other Zotero plugins (and, via the shared Zotero object, any in-process
 * consumer such as an AI plugin) read the organizer outline — headings with
 * their derived decimal numbers — through Zotero.FlexAnnotate. This gives them
 * the numbering without reimplementing the outline parsing/flattening logic.
 *
 * The interface is installed on the shared `Zotero` namespace in
 * startExternalApi() and removed again in stopExternalApi(), so it never leaks
 * after shutdown. Install/uninstall are idempotent.
 */

import { type FlatHeading, flatHeadings } from "./logic/flatHeadings";
import { OutlineModel, type OutlineNode } from "./outlineModel";

/** Version of the external contract, bumped on breaking changes. */
export const EXTERNAL_API_VERSION = 1;

/** Namespace name on the shared Zotero object. */
export const EXTERNAL_NAMESPACE = "FlexAnnotate";

export interface ExternalApi {
  /** Contract version consumers can check before relying on fields. */
  apiVersion: number;
  /** The installed plugin id, so consumers can detect which install responds. */
  pluginID: string;
  /**
   * Get the flat outline headings (with decimal number, path, depth, tag) for
   * a library. Pass a top-level collection key to pick a collection tree;
   * omit it (null) for the library tree.
   */
  getHeadings(
    libraryID: number,
    collectionKey?: string | null,
  ): Promise<FlatHeading[]>;
  /**
   * Get the raw outline tree. Primarily for consumers that want to traverse
   * the hierarchy themselves instead of the flattened list.
   */
  getOutline(
    libraryID: number,
    collectionKey?: string | null,
  ): Promise<{ roots: OutlineNode[] }>;
}

function api(): ExternalApi {
  // The contract must never reject with an untyped error: a consumer falls
  // back on its own when we return an empty result, so we surface exceptions
  // for diagnostics and degrade gracefully.
  const logFailure = (method: string, error: unknown): void =>
    Zotero.debug(
      `[FlexAnnotate] ${method} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  return {
    apiVersion: EXTERNAL_API_VERSION,
    pluginID: addon.data.config.addonID,
    async getHeadings(libraryID, collectionKey = null) {
      try {
        const { roots } = await OutlineModel.load(libraryID, collectionKey);
        return flatHeadings(roots);
      } catch (error) {
        logFailure("getHeadings", error);
        return [];
      }
    },
    async getOutline(libraryID, collectionKey = null) {
      try {
        const { roots } = await OutlineModel.load(libraryID, collectionKey);
        return { roots };
      } catch (error) {
        logFailure("getOutline", error);
        return { roots: [] };
      }
    },
  };
}

function installed(): ExternalApi | null {
  return (Zotero as any)[EXTERNAL_NAMESPACE]?.api ?? null;
}

/** Install the public interface on the shared Zotero namespace (idempotent). */
export function installExternalApi(): void {
  const existing = installed();
  if (existing) {
    // Another plugin already owns the namespace. Do not clobber it; make the
    // situation visible instead of silently skipping so the conflict surfaces.
    if (existing.pluginID !== addon.data.config.addonID) {
      Zotero.logError(
        new Error(
          `[FlexAnnotate] Zotero.${EXTERNAL_NAMESPACE} is already provided by ${existing.pluginID}; external API not installed`,
        ),
      );
    }
    return;
  }
  (Zotero as any)[EXTERNAL_NAMESPACE] = { api: api() };
  Zotero.debug(
    `[FlexAnnotate] external API installed on Zotero.${EXTERNAL_NAMESPACE}`,
  );
}

/** Remove the public interface from the shared Zotero namespace (idempotent). */
export function uninstallExternalApi(): void {
  const current = (Zotero as any)[EXTERNAL_NAMESPACE];
  // Only remove our own install; never tear down something another plugin put
  // in its place after our shutdown.
  if (current?.api?.pluginID === addon.data.config.addonID) {
    delete (Zotero as any)[EXTERNAL_NAMESPACE];
  }
  Zotero.debug(
    `[FlexAnnotate] external API uninstalled from Zotero.${EXTERNAL_NAMESPACE}`,
  );
}
