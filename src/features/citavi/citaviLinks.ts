/**
 * Citavi: Beiträge mit ihrem Hauptwerk verknüpfen. Herkunft: pre-merge:src/citaviImport.js
 * (linkContributions). Läuft aus citaviImport.ts nach dem Print-Quoten-Durchlauf.
 *
 * Zotero 10.0.5: Der Übersetzer verarbeitet ReferenceReferences nicht. Der seeAlso-Code
 * in chrome/content/zotero/xpcom/translation/translate_item.js:1081-1089 ist auskommentiert
 * (10.0.1: translate_item.js:1080-1089); siehe docs/architecture.md.
 */

/**
 * Ausschnitt des Zotero-internen Translation-Objekts (nicht typisiert). Die Felder
 * stammen aus xpcom/translate/src/translation/translate.js (`_itemSaver` in :2474,
 * `_io` in :2456, `_sandboxZotero` in :1864).
 */
export interface CitaviTranslation {
  translator?: Array<
    string | { label?: string; translatorID?: string | number }
  >;
  _itemSaver?: { _IDMap?: Record<string, number> };
  _io: { init(mode: string): void };
  _sandboxZotero: {
    getXML(): Document;
    Utilities: CitaviXml;
  };
}

/** Zotero.Utilities-XPath-Helfer aus der Sandbox (Zotero-Typen verlangen HTMLElement). */
export interface CitaviXml {
  xpath(root: Node, expr: string): Element[];
  xpathText(root: Node, expr: string): string | null;
}

/**
 * Verknüpft Beiträge (Contribution, ContributionInLegalCommentary) mit ihrem
 * Hauptwerk als Zotero-Relationen. Citavis `ReferenceReferences` enthält
 * `OnetoN`-Knoten im Format `ParentID;ChildID1;ChildID2;…`.
 *
 * Neben Parent↔Child werden auch Geschwister-Beiträge innerhalb derselben
 * Gruppe untereinander verknüpft.
 *
 * @return Anzahl angelegter Relationen (Paare mit Änderung)
 */
export async function linkContributions(
  translation: CitaviTranslation,
): Promise<number> {
  const idMap = translation?._itemSaver?._IDMap;
  if (!idMap) {
    ztoolkit.log("Citavi import: no ID map available for linking");
    return 0;
  }

  // Stream ist nach importPrintQuotes verbraucht — re-initialisieren
  translation._io.init("xml/dom");
  const doc = translation._sandboxZotero.getXML();
  const ZU = translation._sandboxZotero.Utilities;

  const onetoNNodes = ZU.xpath(doc, "//ReferenceReferences/OnetoN");
  if (!onetoNNodes.length) {
    ztoolkit.log("Citavi import: no ReferenceReferences found");
    return 0;
  }

  // Alle Paare sammeln, um sie in einer DB-Transaktion zu speichern.
  // Jedes Paar ist [itemA, itemB]; die Relation ist bidirektional.
  const pairs: [Zotero.Item, Zotero.Item][] = [];
  const skipped = { noParent: 0, noChild: 0, sameItem: 0 };
  let groupsProcessed = 0;

  for (const node of onetoNNodes) {
    const text = (node.textContent || "").trim();
    if (!text) {
      continue;
    }

    const ids = text
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length < 2) {
      continue;
    }

    const parentCitaviID = ids[0];
    const childCitaviIDs = ids.slice(1);

    const parentZoteroID = idMap[parentCitaviID];
    if (!parentZoteroID) {
      skipped.noParent++;
      continue;
    }

    const parentItem = await Zotero.Items.getAsync(parentZoteroID);
    if (!parentItem) {
      skipped.noParent++;
      continue;
    }

    // Kinder auflösen
    const childItems: Zotero.Item[] = [];
    for (const childCitaviID of childCitaviIDs) {
      const childZoteroID = idMap[childCitaviID];
      if (!childZoteroID) {
        skipped.noChild++;
        continue;
      }
      const childItem = await Zotero.Items.getAsync(childZoteroID);
      if (!childItem) {
        skipped.noChild++;
        continue;
      }
      if (childItem.id === parentItem.id) {
        skipped.sameItem++;
        continue;
      }
      childItems.push(childItem);
    }

    // Parent ↔ jedes Kind
    for (const child of childItems) {
      pairs.push([parentItem, child]);
    }

    // Geschwister untereinander
    for (let i = 0; i < childItems.length; i++) {
      for (let j = i + 1; j < childItems.length; j++) {
        if (childItems[i].id !== childItems[j].id) {
          pairs.push([childItems[i], childItems[j]]);
        }
      }
    }

    groupsProcessed++;
  }

  if (!pairs.length) {
    ztoolkit.log(
      "Citavi import: no contribution relations to create; " +
        `groups=${groupsProcessed} skipped ` +
        Object.entries(skipped)
          .map(([k, v]) => `${k}=${v}`)
          .join(" "),
    );
    return 0;
  }

  // Alle Relationen in einer Transaktion setzen und speichern.
  // Deduplizieren: ein Item kann durch mehrere Paare berührt werden.
  let linked = 0;
  const changedItems = new Set<Zotero.Item>();

  for (const [itemA, itemB] of pairs) {
    let changed = false;
    if (itemA.addRelatedItem(itemB)) {
      changed = true;
    }
    if (itemB.addRelatedItem(itemA)) {
      changed = true;
    }
    if (changed) {
      changedItems.add(itemA);
      changedItems.add(itemB);
      linked++;
    }
  }

  if (changedItems.size) {
    const saveOptions = { skipDateModifiedUpdate: true };
    await Zotero.DB.executeTransaction(async () => {
      for (const item of changedItems) {
        await item.save(saveOptions);
      }
    });
  }

  ztoolkit.log(
    `Citavi import: linked ${linked} contribution relation(s) ` +
      `from ${groupsProcessed} group(s); skipped ` +
      Object.entries(skipped)
        .map(([k, v]) => `${k}=${v}`)
        .join(" "),
  );
  return linked;
}
