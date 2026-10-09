/**
 * Shared helpers for the Zotero integration tests. All data is synthetic and
 * removed again with `cleanup()`.
 */

export const created: Zotero.Item[] = [];
let workCounter = 0;

export async function makeWork(title: string): Promise<Zotero.Item> {
  const item = new Zotero.Item("book");
  item.libraryID = Zotero.Libraries.userLibraryID;
  item.setField("title", title);
  // A fresh creator per work: Zotero purges orphaned creators on erase and a
  // cached creator ID would otherwise be "not found" in the next suite.
  item.setCreators([
    {
      firstName: "Erika",
      lastName: `Muster${++workCounter}`,
      creatorType: "author",
    },
  ]);
  item.setField("date", "2020");
  await item.saveTx();
  created.push(item);
  return item;
}

export async function makePdfAttachment(
  parent: Zotero.Item,
): Promise<Zotero.Item> {
  const path = PathUtils.join(
    PathUtils.tempDir,
    `flexannotate-${parent.key}.pdf`,
  );
  await IOUtils.writeUTF8(path, "%PDF-1.4\n%%EOF\n");
  const att = await Zotero.Attachments.linkFromFile({
    file: path,
    parentItemID: parent.id,
    contentType: "application/pdf",
  });
  created.push(att);
  return att;
}

export async function makeAnnotation(
  att: Zotero.Item,
  text: string,
  page: string,
  index: number,
): Promise<Zotero.Item> {
  const a = new Zotero.Item("annotation");
  a.libraryID = att.libraryID;
  a.parentID = att.id;
  a.annotationType = "highlight";
  a.annotationText = text;
  a.annotationComment = "";
  a.annotationColor = "#ffd400";
  a.annotationPageLabel = page;
  a.annotationSortIndex = `00000|${String(index).padStart(6, "0")}|00000`;
  a.annotationPosition = JSON.stringify({
    pageIndex: 0,
    rects: [[0, 0, 10, 10]],
  });
  await a.saveTx();
  return a;
}

/** Erase everything the helpers created (children go with their parents). */
export async function cleanup(): Promise<void> {
  for (const item of created.reverse()) {
    try {
      await item.eraseTx();
    } catch {
      // already removed with its parent
    }
  }
  created.length = 0;
}

export function findWindowByUrl(url: string): Window | null {
  const en = Services.wm.getEnumerator("");
  while (en.hasMoreElements()) {
    const w = en.getNext() as Window;
    if (w.location?.href === url) return w;
  }
  return null;
}

export function findOrganizerWindow(): Window | null {
  const en = Services.wm.getEnumerator("");
  while (en.hasMoreElements()) {
    const w = en.getNext() as Window;
    if (w.document?.getElementById("flexannotate-root")) return w;
  }
  return null;
}

/** Poll until `fn` returns something truthy (default 8 s, 50 ms steps). */
export async function waitFor<T>(
  fn: () => T | null | false | undefined,
  ms = 8000,
): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await Zotero.Promise.delay(50);
  }
  throw new Error("waitFor timed out");
}

/** Like waitFor, for an async condition. */
export async function waitForAsync<T>(
  fn: () => Promise<T | null | false | undefined>,
  ms = 8000,
): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await Zotero.Promise.delay(50);
  }
  throw new Error("waitForAsync timed out");
}

/** Dispatch a plain click (optionally with modifiers) on an element. */
export function click(el: Element, init: MouseEventInit = {}) {
  const win = el.ownerDocument.defaultView as any;
  el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, ...init }));
}

export function key(doc: Document, k: string, init: KeyboardEventInit = {}) {
  const win = doc.defaultView as any;
  doc.dispatchEvent(
    new win.KeyboardEvent("keydown", { key: k, bubbles: true, ...init }),
  );
}
