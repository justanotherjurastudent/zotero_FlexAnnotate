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

/** Last error from lockFile (for skip messages in tests). */
export let lastLockError: unknown = null;

/**
 * Hold exclusive file lock (Windows, kernel32!CreateFileW with share mode 0);
 * null if ctypes is missing or locking is unavailable (non-Windows platform).
 * ctypes is imported via importESModule as in Zotero's Winword integration.
 */
export function lockFile(path: string): { close: () => void } | null {
  try {
    const { ctypes } = ChromeUtils.importESModule(
      "resource://gre/modules/ctypes.sys.mjs",
    ) as any;
    const kernel32 = ctypes.open("kernel32.dll");
    // stdcall_abi as in Zotero's Winword integration (winapi_abi no longer exists in fx140)
    const CreateFileW = kernel32.declare(
      "CreateFileW",
      ctypes.stdcall_abi,
      ctypes.voidptr_t, // return
      ctypes.jschar.ptr, // lpFileName
      ctypes.unsigned_long, // dwDesiredAccess
      ctypes.unsigned_long, // dwShareMode
      ctypes.voidptr_t, // lpSecurityAttributes
      ctypes.unsigned_long, // dwCreationDisposition
      ctypes.unsigned_long, // dwFlagsAndAttributes
      ctypes.voidptr_t, // hTemplateFile
    );
    // GENERIC_READ|GENERIC_WRITE (0xc0000000), Share-Mode 0 = exklusiv,
    // OPEN_EXISTING (3), FILE_ATTRIBUTE_NORMAL (0x80)
    const handle = CreateFileW(path, 0xc0000000, 0, null, 3, 0x80, null);
    if (!handle || handle.isNull()) {
      lastLockError = "CreateFileW failed";
      return null;
    }
    const CloseHandle = kernel32.declare(
      "CloseHandle",
      ctypes.stdcall_abi,
      ctypes.bool,
      ctypes.voidptr_t,
    );
    return { close: () => CloseHandle(handle) };
  } catch (e) {
    lastLockError = e;
    console.error("flexannotate test: lock failed:", e);
    return null;
  }
}

/**
 * Whether the Word citation dialog supports annotation mode (Zotero 9+;
 * 8.x lacks #annotations-sidebar, 7.x names the file addCitationDialog.xhtml).
 */
export function hasAnnotationDialog(): boolean {
  try {
    const src = Zotero.File.getContentsFromURL(
      "chrome://zotero/content/integration/citationDialog.xhtml",
    );
    return src.includes("annotations-sidebar");
  } catch {
    return false;
  }
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

// FLEXANNOTATE_GREP (npm run test:zotero -- --grep <pattern>): only tests matching the pattern in their title.
// Evaluated when test files are loaded, prior to mocha.run.
const grepPattern = Services.env.get("FLEXANNOTATE_GREP");
if (grepPattern) mocha.grep(grepPattern);

/** Poll until `fn` returns something truthy (default 8 s, 25 ms steps). */
export async function waitFor<T>(
  fn: () => T | null | false | undefined,
  ms = 8000,
  message = `waitFor timed out after ${ms} ms: ${fn.toString().slice(0, 160)}`,
): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await Zotero.Promise.delay(25);
  }
  throw new Error(message);
}

/** Like waitFor, for an async condition. */
export async function waitForAsync<T>(
  fn: () => Promise<T | null | false | undefined>,
  ms = 8000,
  message = "waitForAsync timed out",
): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await Zotero.Promise.delay(25);
  }
  throw new Error(message);
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
