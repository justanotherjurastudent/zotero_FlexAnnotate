/**
 * Zitierte Anmerkungen im Zitierdialog: Speicher in Word-Dokument-Variablen
 * (session.data.prefs.flexannotate_cited) und Fallback in einer Zotero-Pref
 * (citedAnnotations). Übernahme beim Akzeptieren (io.accept) und Abgleich gegen
 * im Dokument vorhandene Zitierungen (session.documentCitationIDs).
 */

import {
  activeIds,
  buildCitationLocationsMap,
  buildWorkCitationLocationsMap,
  findCitationLocations,
  findWorkCitationLocations,
  parseDocData,
  parseStore,
  record,
  recordDocCitation,
  reconcileDocData,
  serializeDocData,
} from "../logic/cited";
import type {
  CitationLocation,
  CitedDocData,
  CitedStore,
} from "../logic/cited";
import { getLastCommand } from "./dialogPersistent";

export type { CitationLocation };

const CITED_PREF = "citedAnnotations";
export const DOC_CITED_PREF = "flexannotate_cited";

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

/** Active integration session if any. */
export function currentSession(): any {
  return (Zotero as any).Integration?.currentSession;
}

/** Id of the document the dialog was opened from (stored in the document). */
export function currentSessionId(): string {
  const session = currentSession();
  return String(session?.sessionID ?? "unknown");
}

export function readDocCitedData(): CitedDocData | null {
  const session = currentSession();
  const raw = session?.data?.prefs?.[DOC_CITED_PREF];
  if (typeof raw === "string") {
    return parseDocData(raw);
  }
  return null;
}

export function writeDocCitedData(data: CitedDocData): boolean {
  const session = currentSession();
  if (session?.data?.prefs && typeof session.data.prefs === "object") {
    session.data.prefs[DOC_CITED_PREF] = serializeDocData(data);
    return true;
  }
  return false;
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

/**
 * Returns the set of annotation IDs currently marked as cited.
 * Uses Word document variables (flexannotate_cited) reconciled against active
 * citation IDs in the document (session.documentCitationIDs) with O(1) Set lookup.
 * Falls back to legacy Zotero.Prefs store when document prefs are not available.
 */
export function getActiveCitedIDs(
  rows: { id: number; key?: string; workID: number }[],
  citedWorks: Set<number> | null,
): Set<number> {
  const session = currentSession();
  const docData = readDocCitedData();

  if (docData !== null) {
    const docCitationIDs = session?.documentCitationIDs;
    const {
      data: reconciled,
      activeKeys,
      pruned,
    } = reconcileDocData(docData, docCitationIDs);
    if (pruned) {
      writeDocCitedData(reconciled);
    }
    const cited = new Set<number>();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.key && activeKeys.has(r.key)) {
        cited.add(r.id);
      }
    }
    return cited;
  }

  // Fallback to legacy Pref-based store
  return activeIds(readCitedStore(), currentSessionId(), citedWorks);
}

/** Remember which annotations the accepted citation contains. */
function recordCited(io: any) {
  const entries: { id: number; workID: number }[] = [];
  const annKeys: string[] = [];
  for (const ci of io.citation?.citationItems ?? []) {
    const item = Zotero.Items.get(ci.id) as Zotero.Item | false;
    if (!item || !item.isAnnotation()) continue;
    const attachment = item.parentItem as Zotero.Item | undefined;
    entries.push({ id: item.id, workID: Number(attachment?.parentID) || 0 });
    if (item.key) annKeys.push(item.key);
  }
  if (!entries.length) return;

  // Legacy store update
  writeCitedStore(record(readCitedStore(), currentSessionId(), entries));

  // Word document store update
  if (annKeys.length && io.citation) {
    if (
      !io.citation.citationID ||
      io.citation.citationID === "flexannotate-browse"
    ) {
      io.citation.citationID =
        (Zotero as any).Utilities?.randomString?.() ||
        Math.random().toString(36).slice(2);
    }
    const docData = readDocCitedData() || { citations: {} };
    const nextDoc = recordDocCitation(docData, io.citation.citationID, annKeys);
    writeDocCitedData(nextDoc);
  }
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

/**
 * Returns active citation locations (e.g. footnote numbers) for a specific annotation key.
 */
export function getCitationLocations(
  annKey: string,
  docData?: CitedDocData | null,
  citations?: any[] | Record<string, any> | null,
): CitationLocation[] {
  if (!annKey) return [];
  const resolvedDocData = docData !== undefined ? docData : readDocCitedData();
  if (!resolvedDocData) return [];
  const session = currentSession();
  const resolvedCitations =
    citations !== undefined ? citations : session?.citationsByIndex;
  return findCitationLocations(resolvedDocData, resolvedCitations, annKey);
}

/**
 * Maps all annotation keys to their active citation locations in the document.
 */
export function getAllCitationLocations(
  docData?: CitedDocData | null,
  citations?: any[] | Record<string, any> | null,
): Map<string, CitationLocation[]> {
  const resolvedDocData = docData !== undefined ? docData : readDocCitedData();
  const session = currentSession();
  const resolvedCitations =
    citations !== undefined ? citations : session?.citationsByIndex;
  return buildCitationLocationsMap(resolvedDocData, resolvedCitations);
}

/**
 * Maps all cited work IDs to their active citation locations in the document.
 */
export function getAllWorkCitationLocations(
  citationsByItemID?: Record<string, unknown> | null,
): Map<number, CitationLocation[]> {
  const session = currentSession();
  const resolved =
    citationsByItemID !== undefined
      ? citationsByItemID
      : session?.citationsByItemID;
  return buildWorkCitationLocationsMap(resolved);
}

function logJump(msg: string, detail?: unknown): void {
  try {
    const suffix =
      detail === undefined
        ? ""
        : ` ${typeof detail === "string" ? detail : JSON.stringify(detail)}`;
    (Zotero as any).debug?.(`[FlexAnnotate] ${msg}${suffix}`);
  } catch {
    /* ignore */
  }
  try {
    if (typeof ztoolkit !== "undefined" && ztoolkit?.log) {
      if (detail !== undefined) {
        ztoolkit.log(`flexannotate ${msg}`, detail);
      } else {
        ztoolkit.log(`flexannotate ${msg}`);
      }
    }
  } catch {
    /* ignore */
  }
}

const WORD_JUMP_VBS = `' FlexAnnotate Word Jump Script
Option Explicit

Dim word, doc, shell, docId, noteIndex, citationId
Dim i, found, targetDoc, fnItem, fnRef, fnRange, story

If WScript.Arguments.Count < 3 Then WScript.Quit 0

docId = WScript.Arguments(0)
If docId = "-" Then docId = ""
If IsNumeric(WScript.Arguments(1)) Then
    noteIndex = CLng(WScript.Arguments(1))
Else
    noteIndex = 0
End If
citationId = WScript.Arguments(2)
If citationId = "-" Then citationId = ""

On Error Resume Next
Set word = GetObject(, "Word.Application")
If Err.Number <> 0 Or word Is Nothing Then
    WScript.Quit 0
End If

word.Visible = True
word.ScreenUpdating = True

Set targetDoc = Nothing
If docId <> "" Then
    For i = 1 To word.Documents.Count
        Set doc = word.Documents.Item(i)
        If InStr(1, doc.Name, docId, 1) > 0 Or InStr(1, docId, doc.Name, 1) > 0 Or _
           InStr(1, doc.FullName, docId, 1) > 0 Or InStr(1, docId, doc.FullName, 1) > 0 Then
            Set targetDoc = doc
            Exit For
        End If
    Next
End If

If targetDoc Is Nothing Then
    Set targetDoc = word.ActiveDocument
End If

If targetDoc Is Nothing Then WScript.Quit 0

targetDoc.Activate
If Not targetDoc.ActiveWindow Is Nothing Then
    targetDoc.ActiveWindow.Activate
End If

found = False

' 1. If noteIndex is valid, jump directly to the footnote
If noteIndex > 0 And noteIndex <= targetDoc.Footnotes.Count Then
    Set fnItem = targetDoc.Footnotes.Item(noteIndex)
    If Not fnItem Is Nothing Then
        Set fnRef = fnItem.Reference
        If Not fnRef Is Nothing Then
            fnRef.Select
            targetDoc.ActiveWindow.ScrollIntoView fnRef, True
        End If
        Set fnRange = fnItem.Range
        If Not fnRange Is Nothing Then
            fnRange.Select
            targetDoc.ActiveWindow.ScrollIntoView fnRange, True
            found = True
            If citationId <> "" Then
                For i = 1 To fnRange.Fields.Count
                    If InStr(1, fnRange.Fields.Item(i).Code.Text, citationId, 1) > 0 Then
                        fnRange.Fields.Item(i).Select
                        targetDoc.ActiveWindow.ScrollIntoView word.Selection.Range, True
                        Exit For
                    End If
                Next
            End If
        End If
    End If
End If

' 2. If not found by footnote, search fields across all stories (e.g. in-text citations)
If Not found And citationId <> "" Then
    For Each story In targetDoc.StoryRanges
        Do While Not story Is Nothing
            For i = 1 To story.Fields.Count
                If InStr(1, story.Fields.Item(i).Code.Text, citationId, 1) > 0 Then
                    story.Fields.Item(i).Select
                    targetDoc.ActiveWindow.ScrollIntoView word.Selection.Range, True
                    found = True
                    Exit For
                End If
            Next
            If found Then Exit Do
            Set story = story.NextStoryRange
        Loop
        If found Then Exit For
    Next
End If

' 3. Refresh viewport and activate document and Word application
word.ScreenRefresh
targetDoc.Activate
If Not targetDoc.ActiveWindow Is Nothing Then
    targetDoc.ActiveWindow.Activate
End If
word.Activate

' 4. Bring window to front via WScript.Shell
Set shell = CreateObject("WScript.Shell")
If Not shell Is Nothing Then
    If Not targetDoc.ActiveWindow Is Nothing Then
        shell.AppActivate targetDoc.ActiveWindow.Caption
    End If
    shell.AppActivate word.Caption
End If
`;

function getWscriptPath(): string {
  try {
    if (typeof Services !== "undefined" && Services.dirsvc) {
      const sysDir = (Services.dirsvc.get("SysD", Ci.nsIFile) as any).path;
      if (sysDir) {
        return typeof PathUtils !== "undefined"
          ? PathUtils.join(sysDir, "wscript.exe")
          : `${sysDir}\\wscript.exe`;
      }
    }
  } catch {
    /* fallback to default path */
  }
  try {
    const winDir =
      (typeof Services !== "undefined" && Services.env?.get?.("SystemRoot")) ||
      "C:\\Windows";
    return typeof PathUtils !== "undefined"
      ? PathUtils.join(winDir, "System32", "wscript.exe")
      : `${winDir}\\System32\\wscript.exe`;
  } catch {
    return "C:\\Windows\\System32\\wscript.exe";
  }
}

async function ensureVbsScript(): Promise<string | null> {
  try {
    const tempDir =
      typeof PathUtils !== "undefined"
        ? PathUtils.tempDir
        : (Services.dirsvc.get("TmpD", Ci.nsIFile) as any).path;
    const vbsPath =
      typeof PathUtils !== "undefined"
        ? PathUtils.join(tempDir, "flexannotate-jump-word.vbs")
        : `${tempDir}\\flexannotate-jump-word.vbs`;

    if (typeof IOUtils !== "undefined" && IOUtils.writeUTF8) {
      await IOUtils.writeUTF8(vbsPath, WORD_JUMP_VBS);
    } else {
      (Zotero as any).File.putContents(
        (Zotero as any).File.pathToFile(vbsPath),
        WORD_JUMP_VBS,
      );
    }
    return vbsPath;
  } catch (e) {
    logJump("ensureVbsScript failed:", e);
    return null;
  }
}

function isTestProfile(): boolean {
  try {
    const profDir =
      (typeof PathUtils !== "undefined" && (PathUtils as any).profileDir) ||
      (Zotero as any).Profile?.dir ||
      "";
    return /[\\/]\.scaffold[\\/]test[\\/]/.test(String(profDir));
  } catch {
    return false;
  }
}

async function runWordJumpScript(
  docId: string,
  noteIndex: number,
  citationID: string,
): Promise<boolean> {
  if (isTestProfile()) return false;
  try {
    const scriptPath = await ensureVbsScript();
    if (!scriptPath) return false;

    const wscriptPath = getWscriptPath();
    // Important: Subprocess.call on Windows automatically quotes arguments containing spaces
    // via subprocess_win.worker.js quoteString(), and drops empty "" arguments in join(" ").
    // Therefore, pass raw unquoted strings and use "-" as a non-empty sentinel for empty values.
    const args = [
      "//B",
      "//nologo",
      scriptPath,
      docId || "-",
      String(noteIndex || 0),
      citationID || "-",
    ];

    logJump("runWordJumpScript start:", {
      docId: docId || "-",
      noteIndex: noteIndex || 0,
      citationID: citationID || "-",
    });

    const { Subprocess } = ChromeUtils.importESModule(
      "resource://gre/modules/Subprocess.sys.mjs",
    ) as any;
    const proc = await Subprocess.call({
      command: wscriptPath,
      arguments: args,
      stdout: "ignore",
      stderr: "ignore",
    });
    const res = await proc.wait();
    logJump("runWordJumpScript finished:", res);
    return true;
  } catch (e) {
    logJump("runWordJumpScript failed:", e);
    return false;
  }
}

/**
 * Brings Microsoft Word, LibreOffice, or Mac Word to the foreground on the OS window level.
 */
export function bringWordProcessorToFront(agent?: string | null): void {
  if (isTestProfile()) return;
  try {
    if ((Zotero as any).isWin) {
      const { ctypes } = ChromeUtils.importESModule(
        "resource://gre/modules/ctypes.sys.mjs",
      ) as any;
      const abi = ctypes.stdcall_abi || ctypes.default_abi;
      const user32 = ctypes.open("user32.dll");
      try {
        const FindWindowW = user32.declare(
          "FindWindowW",
          abi,
          ctypes.voidptr_t,
          ctypes.jschar.ptr,
          ctypes.jschar.ptr,
        );
        const IsIconic = user32.declare(
          "IsIconic",
          abi,
          ctypes.bool,
          ctypes.voidptr_t,
        );
        const SetForegroundWindow = user32.declare(
          "SetForegroundWindow",
          abi,
          ctypes.bool,
          ctypes.voidptr_t,
        );
        const ShowWindow = user32.declare(
          "ShowWindow",
          abi,
          ctypes.bool,
          ctypes.voidptr_t,
          ctypes.int32_t,
        );
        const BringWindowToTop = user32.declare(
          "BringWindowToTop",
          abi,
          ctypes.bool,
          ctypes.voidptr_t,
        );
        let SwitchToThisWindow: any = null;
        try {
          SwitchToThisWindow = user32.declare(
            "SwitchToThisWindow",
            abi,
            ctypes.void_t,
            ctypes.voidptr_t,
            ctypes.bool,
          );
        } catch {
          /* optional API in user32 */
        }

        const className = agent === "LibreOffice" ? "SALFRAME" : "OpusApp";
        const hwnd = FindWindowW(className, null);
        if (hwnd && (typeof hwnd.isNull !== "function" || !hwnd.isNull())) {
          if (IsIconic(hwnd)) {
            ShowWindow(hwnd, 9); // SW_RESTORE only when minimized
          } else {
            ShowWindow(hwnd, 5); // SW_SHOW preserves maximized/normal state
          }
          BringWindowToTop(hwnd);
          SetForegroundWindow(hwnd);
          if (typeof SwitchToThisWindow === "function") {
            SwitchToThisWindow(hwnd, true);
          }
        }
      } finally {
        user32.close();
      }
    } else if ((Zotero as any).isMac) {
      (Zotero as any).Utilities?.Internal?.sendToBack?.();
    }
  } catch (e) {
    logJump("bringWordProcessorToFront failed:", e);
  }
}

let isJumping = false;

/**
 * Selects the citation field in Word/LibreOffice and brings the document window to the front.
 * If the original document session was already completed (e.g. in companion taskpane mode),
 * safely acquires an active document connection via Zotero.Integration to locate and select the field.
 */
export async function jumpToCitation(citationOrLoc: any): Promise<boolean> {
  if (isJumping) return false;
  isJumping = true;
  try {
    if (!citationOrLoc) return false;
    const citationID =
      citationOrLoc?.citationID ||
      citationOrLoc?.citation?.citationID ||
      citationOrLoc?.properties?.citationID;
    const noteIndex =
      citationOrLoc?.noteIndex ??
      citationOrLoc?.properties?.noteIndex ??
      citationOrLoc?.citation?.properties?.noteIndex;
    const directField = citationOrLoc?.field || citationOrLoc?.citation?.field;
    const session =
      currentSession() ||
      citationOrLoc?.session ||
      citationOrLoc?.citation?.session;
    const directDoc =
      session?._doc ||
      session?.doc ||
      citationOrLoc?.doc ||
      citationOrLoc?.citation?.doc;

    const cmd = getLastCommand();
    const agent =
      cmd?.agent ||
      session?.agent ||
      ((Zotero as any).isWin
        ? "WinWord"
        : (Zotero as any).isMac
          ? "MacWord"
          : "LibreOffice");
    const docId = cmd?.docId;
    logJump("jumpToCitation invoked:", {
      agent,
      docId,
      noteIndex,
      citationID,
    });

    // 1. Direct field selection or document activation if session is still active
    const docStatus = directDoc?._documentStatus;
    const isDocActive = !docStatus || docStatus.active !== false;

    if (
      isDocActive &&
      (directField || (directDoc && typeof directDoc.activate === "function"))
    ) {
      if (directField && typeof directField.select === "function") {
        await directField.select();
      }
      if (directDoc && typeof directDoc.activate === "function") {
        await directDoc.activate();
      }
      if ((Zotero as any).isWin && agent !== "LibreOffice") {
        await runWordJumpScript(docId || "", noteIndex || 0, citationID || "");
      }
      bringWordProcessorToFront(agent);
      return true;
    }

    // 2. Windows Word direct jumper via WScript COM (bypasses stubbed selectField in libzoteroWinWordIntegration.dll)
    if ((Zotero as any).isWin && agent !== "LibreOffice") {
      const jumped = await runWordJumpScript(
        docId || "",
        noteIndex || 0,
        citationID || "",
      );
      bringWordProcessorToFront(agent);
      if (jumped) return true;
    }

    // 3. Re-acquire active document via Zotero.Integration (for LibreOffice / Mac / fallback)
    const integration = (Zotero as any).Integration;
    if (!integration) return false;

    const app = integration.getApplication?.(agent, "jump", docId);
    if (!app) return false;

    // Avoid RPC_E_CANTCALLOUT_ININPUTSYNCCALL (integration.js:268)
    await (Zotero as any).Promise?.delay?.(10);

    const docPromise =
      app.getDocument && docId
        ? app.getDocument(docId)
        : app.getActiveDocument();
    const doc = await docPromise;
    if (!doc) return false;

    try {
      const fieldType =
        session?.data?.prefs?.fieldType || app.primaryFieldType || "Field";
      const fields = await doc.getFields(fieldType);
      let matchedField: any = null;

      if (citationID) {
        for (let i = 0; i < fields.length; i++) {
          const f = fields[i];
          try {
            const code = await f.getCode();
            if (code && code.includes(citationID)) {
              matchedField = f;
              break;
            }
          } catch {
            /* ignore field read error */
          }
        }
      }

      if (!matchedField && typeof noteIndex === "number" && noteIndex > 0) {
        for (let i = 0; i < fields.length; i++) {
          const f = fields[i];
          try {
            if (typeof f.getNoteIndex === "function") {
              const idx = await f.getNoteIndex();
              if (idx === noteIndex) {
                matchedField = f;
                break;
              }
            }
          } catch {
            /* ignore noteIndex read error */
          }
        }
      }

      if (matchedField && typeof matchedField.select === "function") {
        await matchedField.select();
      }

      if (typeof doc.activate === "function") {
        await doc.activate();
      }
      bringWordProcessorToFront(agent);
      return !!matchedField;
    } finally {
      try {
        if (typeof doc.cleanup === "function") await doc.cleanup();
        if (typeof doc.complete === "function") await doc.complete();
      } catch {
        /* ignore cleanup error */
      }
    }
  } catch (e) {
    logJump("jump to citation failed:", e);
    return false;
  } finally {
    isJumping = false;
  }
}
