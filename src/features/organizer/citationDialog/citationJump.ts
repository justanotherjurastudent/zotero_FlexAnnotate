/**
 * Direct jump to a footnote/citation location in the word processor: clicking
 * a footnote chip selects the citation field in Word, LibreOffice or Mac Word
 * and brings the program to the foreground. Word is driven via a temporary
 * WScript/VBS script (bypassing the native `selectField` stub of the Windows
 * integration), other platforms via `Zotero.Integration.getApplication`.
 */

import { currentSession } from "./citationSession";
import { getLastCommand } from "./persistentState";
import {
  isJumpingActive,
  isTestProfile,
  logJump,
  setJumping,
} from "./citationShared";

const WORD_JUMP_VBS = `' FlexAnnotate Word Jump Script
Option Explicit

Dim word, doc, shell, docId, noteIndex, citationId, noteType
Dim i, found, targetDoc, fnItem, fnRef, fnRange, story

If WScript.Arguments.Count < 3 Then WScript.Quit 1

docId = WScript.Arguments(0)
If docId = "-" Then docId = ""
If IsNumeric(WScript.Arguments(1)) Then
    noteIndex = CLng(WScript.Arguments(1))
Else
    noteIndex = 0
End If
citationId = WScript.Arguments(2)
If citationId = "-" Then citationId = ""

noteType = 0
If WScript.Arguments.Count >= 4 Then
    If IsNumeric(WScript.Arguments(3)) Then
        noteType = CLng(WScript.Arguments(3))
    End If
End If

On Error Resume Next
Set word = GetObject(, "Word.Application")
If Err.Number <> 0 Or word Is Nothing Then
    WScript.Quit 1
End If
On Error GoTo 0

word.Visible = True
word.ScreenUpdating = True

Set targetDoc = Nothing
If docId <> "" Then
    For i = 1 To word.Documents.Count
        Set doc = word.Documents.Item(i)
        If StrComp(doc.FullName, docId, 1) = 0 Or StrComp(doc.Name, docId, 1) = 0 Then
            Set targetDoc = doc
            Exit For
        End If
    Next
End If

If targetDoc Is Nothing Then
    Set targetDoc = word.ActiveDocument
End If

If targetDoc Is Nothing Then WScript.Quit 1

targetDoc.Activate
If Not targetDoc.ActiveWindow Is Nothing Then
    targetDoc.ActiveWindow.Activate
End If

found = False

' 1. If noteIndex is valid, check Footnotes or Endnotes depending on noteType
If noteIndex > 0 Then
    If noteType = 2 Then
        ' Endnotes
        If noteIndex <= targetDoc.Endnotes.Count Then
            Set fnItem = targetDoc.Endnotes.Item(noteIndex)
            If Not fnItem Is Nothing Then
                Set fnRange = fnItem.Range
                If Not fnRange Is Nothing Then
                    If citationId <> "" Then
                        For i = 1 To fnRange.Fields.Count
                            If InStr(1, fnRange.Fields.Item(i).Code.Text, citationId, 1) > 0 Then
                                Set fnRef = fnItem.Reference
                                If Not fnRef Is Nothing Then
                                    fnRef.Select
                                    targetDoc.ActiveWindow.ScrollIntoView fnRef, True
                                End If
                                fnRange.Fields.Item(i).Select
                                targetDoc.ActiveWindow.ScrollIntoView word.Selection.Range, True
                                found = True
                                Exit For
                            End If
                        Next
                    Else
                        Set fnRef = fnItem.Reference
                        If Not fnRef Is Nothing Then
                            fnRef.Select
                            targetDoc.ActiveWindow.ScrollIntoView fnRef, True
                        End If
                        fnRange.Select
                        targetDoc.ActiveWindow.ScrollIntoView fnRange, True
                        found = True
                    End If
                End If
            End If
        End If
    Else
        ' Footnotes
        If noteIndex <= targetDoc.Footnotes.Count Then
            Set fnItem = targetDoc.Footnotes.Item(noteIndex)
            If Not fnItem Is Nothing Then
                Set fnRange = fnItem.Range
                If Not fnRange Is Nothing Then
                    If citationId <> "" Then
                        For i = 1 To fnRange.Fields.Count
                            If InStr(1, fnRange.Fields.Item(i).Code.Text, citationId, 1) > 0 Then
                                Set fnRef = fnItem.Reference
                                If Not fnRef Is Nothing Then
                                    fnRef.Select
                                    targetDoc.ActiveWindow.ScrollIntoView fnRef, True
                                End If
                                fnRange.Fields.Item(i).Select
                                targetDoc.ActiveWindow.ScrollIntoView word.Selection.Range, True
                                found = True
                                Exit For
                            End If
                        Next
                    Else
                        Set fnRef = fnItem.Reference
                        If Not fnRef Is Nothing Then
                            fnRef.Select
                            targetDoc.ActiveWindow.ScrollIntoView fnRef, True
                        End If
                        fnRange.Select
                        targetDoc.ActiveWindow.ScrollIntoView fnRange, True
                        found = True
                    End If
                End If
            End If
        End If
    End If
End If

' 2. Fast-path: if noteType = 0 (in-text), search document body / StoryRanges first
If Not found And citationId <> "" And noteType = 0 Then
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

' 3. Search footnotes and endnotes by citationId if not found yet
If Not found And citationId <> "" Then
    Dim j, fnCandidate
    If noteType <> 2 Then
        For j = 1 To targetDoc.Footnotes.Count
            Set fnCandidate = targetDoc.Footnotes.Item(j)
            If Not fnCandidate Is Nothing Then
                Set fnRange = fnCandidate.Range
                If Not fnRange Is Nothing Then
                    For i = 1 To fnRange.Fields.Count
                        If InStr(1, fnRange.Fields.Item(i).Code.Text, citationId, 1) > 0 Then
                            Set fnRef = fnCandidate.Reference
                            If Not fnRef Is Nothing Then
                                fnRef.Select
                                targetDoc.ActiveWindow.ScrollIntoView fnRef, True
                            End If
                            fnRange.Fields.Item(i).Select
                            targetDoc.ActiveWindow.ScrollIntoView word.Selection.Range, True
                            found = True
                            Exit For
                        End If
                    Next
                End If
            End If
            If found Then Exit For
        Next
    End If

    If Not found And noteType <> 1 Then
        For j = 1 To targetDoc.Endnotes.Count
            Set fnCandidate = targetDoc.Endnotes.Item(j)
            If Not fnCandidate Is Nothing Then
                Set fnRange = fnCandidate.Range
                If Not fnRange Is Nothing Then
                    For i = 1 To fnRange.Fields.Count
                        If InStr(1, fnRange.Fields.Item(i).Code.Text, citationId, 1) > 0 Then
                            Set fnRef = fnCandidate.Reference
                            If Not fnRef Is Nothing Then
                                fnRef.Select
                                targetDoc.ActiveWindow.ScrollIntoView fnRef, True
                            End If
                            fnRange.Fields.Item(i).Select
                            targetDoc.ActiveWindow.ScrollIntoView word.Selection.Range, True
                            found = True
                            Exit For
                        End If
                    Next
                End If
            End If
            If found Then Exit For
        Next
    End If
End If

' 4. Fallback search in document body / StoryRanges if not searched yet
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

If Not found Then WScript.Quit 2

' 4. Refresh viewport and activate document and Word application
word.ScreenRefresh
targetDoc.Activate
If Not targetDoc.ActiveWindow Is Nothing Then
    targetDoc.ActiveWindow.Activate
End If
word.Activate

' 5. Bring window to front via WScript.Shell
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

// Written once per session under a random name: parallel instances do not
// overwrite each other, and the path is not predictable.
let cachedVbsPath: string | null = null;

async function ensureVbsScript(): Promise<string | null> {
  try {
    if (cachedVbsPath) {
      const exists =
        typeof IOUtils !== "undefined"
          ? await IOUtils.exists(cachedVbsPath)
          : true;
      if (exists) return cachedVbsPath;
    }
    const tempDir =
      typeof PathUtils !== "undefined"
        ? PathUtils.tempDir
        : (Services.dirsvc.get("TmpD", Ci.nsIFile) as any).path;
    const fileName = `flexannotate-jump-${crypto.randomUUID()}.vbs`;
    const vbsPath =
      typeof PathUtils !== "undefined"
        ? PathUtils.join(tempDir, fileName)
        : `${tempDir}\\${fileName}`;

    if (typeof IOUtils !== "undefined" && IOUtils.writeUTF8) {
      await IOUtils.writeUTF8(vbsPath, WORD_JUMP_VBS, { mode: "create" });
    } else {
      (Zotero as any).File.putContents(
        (Zotero as any).File.pathToFile(vbsPath),
        WORD_JUMP_VBS,
      );
    }
    cachedVbsPath = vbsPath;
    return vbsPath;
  } catch (e) {
    logJump("ensureVbsScript failed:", e);
    return null;
  }
}

async function runWordJumpScript(
  docId: string,
  noteIndex: number,
  citationID: string,
  noteType = 0,
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
      String(noteType || 0),
    ];

    logJump("runWordJumpScript start:", {
      docId: docId || "-",
      noteIndex: noteIndex || 0,
      citationID: citationID || "-",
      noteType: noteType || 0,
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
    return (res?.exitCode ?? 0) === 0;
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
        const FindWindowExW = user32.declare(
          "FindWindowExW",
          abi,
          ctypes.voidptr_t,
          ctypes.voidptr_t,
          ctypes.jschar.ptr,
          ctypes.jschar.ptr,
        );
        const IsWindowVisible = user32.declare(
          "IsWindowVisible",
          abi,
          ctypes.bool,
          ctypes.voidptr_t,
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
        let hwnd = FindWindowW(className, null);
        let cur = hwnd;
        while (cur && (typeof cur.isNull !== "function" || !cur.isNull())) {
          if (IsWindowVisible(cur)) {
            hwnd = cur;
            break;
          }
          cur = FindWindowExW(null, cur, className, null);
        }
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

/**
 * Selects the citation field in Word/LibreOffice and brings the document window to the front.
 * If the original document session was already completed (e.g. in companion taskpane mode),
 * safely acquires an active document connection via Zotero.Integration to locate and select the field.
 */
export async function jumpToCitation(citationOrLoc: any): Promise<boolean> {
  if (isJumpingActive()) return false;
  setJumping(true);
  try {
    if (!citationOrLoc) return false;
    const citationID =
      citationOrLoc?.citationID ||
      citationOrLoc?.citation?.citationID ||
      citationOrLoc?.properties?.citationID;
    const noteIndex =
      citationOrLoc?.noteIndex ??
      citationOrLoc?.properties?.noteIndex ??
      citationOrLoc?.citation?.noteIndex ??
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
    const noteType =
      citationOrLoc?.noteType ??
      citationOrLoc?.properties?.noteType ??
      citationOrLoc?.citation?.noteType ??
      citationOrLoc?.citation?.properties?.noteType ??
      session?.data?.prefs?.noteType ??
      (noteIndex > 0 ? 1 : 0);

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
      noteType,
      citationID,
    });

    // 1. Direct field selection or document activation if the integration transaction is still active.
    // Note: In persistent companion mode, execCommand has already called document.complete() and set
    // Zotero.Integration.currentDoc = false. For LibreOffice, Document has no _documentStatus property
    // and calling Field_select on a completed document ID throws NullPointerException (mMarkManager).
    const docStatus = directDoc?._documentStatus;
    const currentDoc = (Zotero as any).Integration?.currentDoc;
    const fieldDocId =
      directField?._field?._documentID ?? directField?._documentID;
    const docIdMatch =
      fieldDocId === undefined ||
      directDoc?._documentID === undefined ||
      fieldDocId === directDoc._documentID;
    const isTest = isTestProfile();
    const isDocActive =
      Boolean(directDoc) &&
      (!docStatus || docStatus.active !== false) &&
      docIdMatch &&
      (currentDoc === directDoc || isTest);

    if (
      isDocActive &&
      (directField ||
        (isTest && directDoc && typeof directDoc.activate === "function"))
    ) {
      try {
        if (directField && typeof directField.select === "function") {
          await directField.select();
        }
        if (directDoc && typeof directDoc.activate === "function") {
          await directDoc.activate();
        }
        if ((Zotero as any).isWin && agent !== "LibreOffice") {
          await runWordJumpScript(
            docId || "",
            noteIndex || 0,
            citationID || "",
            noteType,
          );
        }
        bringWordProcessorToFront(agent);
        return true;
      } catch (step1Err) {
        if (isTest) throw step1Err;
        logJump(
          "direct select on active doc failed, falling back to getApplication:",
          step1Err,
        );
      }
    }

    // 2. Windows Word direct jumper via WScript COM (bypasses stubbed selectField in libzoteroWinWordIntegration.dll)
    if ((Zotero as any).isWin && agent !== "LibreOffice") {
      const jumped = await runWordJumpScript(
        docId || "",
        noteIndex || 0,
        citationID || "",
        noteType,
      );
      if (jumped) {
        bringWordProcessorToFront(agent);
        return true;
      }
      // If a concrete citationID was searched and the VBS script no longer found it
      // anywhere in the Word document (exit code 2, footnote deleted),
      // do not jump into an unrelated field.
      if (citationID && !isTestProfile()) {
        return false;
      }
    }

    // 3. Re-acquire active document via Zotero.Integration (natively supported by LibreOffice on Win/Mac/Linux and MacWord)
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
      const prefFieldType = session?.data?.prefs?.fieldType;
      let fieldType =
        prefFieldType &&
        (!app.primaryFieldType ||
          prefFieldType === app.primaryFieldType ||
          prefFieldType === app.secondaryFieldType)
          ? prefFieldType
          : app.primaryFieldType || prefFieldType || "Field";
      let fields = await doc.getFields(fieldType);
      if (
        (!fields || fields.length === 0) &&
        app.secondaryFieldType &&
        fieldType !== app.secondaryFieldType
      ) {
        try {
          const altFields = await doc.getFields(app.secondaryFieldType);
          if (altFields && altFields.length > 0) {
            fields = altFields;
            fieldType = app.secondaryFieldType;
          }
        } catch {
          /* ignore secondary field fetch */
        }
      }
      logJump("re-acquired document fields:", {
        agent,
        fieldType,
        count: fields?.length ?? 0,
      });
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

      if (
        !matchedField &&
        !citationID &&
        typeof noteIndex === "number" &&
        noteIndex > 0
      ) {
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
        logJump("selected matched field in document:", {
          agent,
          citationID,
          noteIndex,
        });
        if (typeof doc.activate === "function") {
          await doc.activate();
        }
        bringWordProcessorToFront(agent);
        return true;
      }

      return false;
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
    setJumping(false);
  }
}
