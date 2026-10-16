# Why a sticky citation window is hard with Zotero's Word integration

This note records what was checked about the "keep citation window open" option (`persistentCitationDialog`) and why it works the way it does. It is a reference for future work and for forum replies.

**Labels**

- `[verified-in-source]`: read in Zotero 10.0.5 (`.zotero-reference/10.0.5`). Line numbers refer to that tree.
- `[measured-in-test]`: a Mocha test in real Zotero (10.0.6 installed, 9.0.6 and the other versions in `npm run test:versions`).
- `[observed-by-user-in-real-Word]`: reported by the plugin's user in Word on Windows. Not reproduced by us.
- `[unproven]`: a guess or an open question. Not established by source or test.

Versions: the source references are 10.0.5. Behaviour was measured on 10.0.6 and 9.0.6 (see the test counts in [testing.md](testing.md)). Nothing was tested on macOS, Linux, LibreOffice or in dark mode.

## 1. One dialog per command; no reuse

- `[verified-in-source]` Each command that needs a dialog opens a new window: `Zotero.Integration.displayDialog` calls `openWindow` with the io (`integration.js:470-515`, window opened at `:492`). The window is not kept between commands.
- `[verified-in-source]` The dialog reads its io once, in `onLoad`: `io = window.arguments[0].wrappedJSObject` (`citationDialog.js:62`). The handlers (`Helpers`, `SearchHandler`, `PopupsHandler`, `KeyboardHandler`) receive that io in their constructors (`citationDialog.js:78-81`).
- `[measured-in-test]` `location.reload()` on the dialog empties `window.arguments`. `onLoad` then throws at `window.arguments[0]` and `DIALOG_STATE.loaded` never becomes true. A proxy io that is swapped after a reload therefore cannot be used.
- `[verified-in-source]` The handlers keep the first io. Assigning a new `window.io` does not rebind them (section 1, `citationDialog.js:78-81`).
- Consequence: a second request cannot be served by the first window. The plugin opens a new window at the same position and size for each request (see [architecture.md](architecture.md), pitfall 18).

## 2. `accept()` tears the dialog down

- `[verified-in-source]` `accept()` (`citationDialog.js:155-183`) runs `cleanupBeforeDialogClosing()` first (`:159`). That saves the window size to `integration.citationDialog.windowParams` and unregisters the collections and items views (`:221-222`, pitfall 19 in [architecture.md](architecture.md)).
- `[verified-in-source]` Then it hides the layouts and sets `documentElement.style.minHeight` (`:161-168`). It calls `window.resizeTo` in a `setTimeout` (`:169-171`). After this the old trees are dead, so the window cannot simply be shown again.
- `[verified-in-source]` `accept()` returns early when there are no citation items (`:156`).

## 3. Minimum size and width

- `[verified-in-source]` `LibraryLayout.MIN_WIDTH = 1000` (`citationDialog.js:510`) is a minimum: `resizeWindow()` grows the window to at least that width (`:603-640`, `targetWidth = Math.max(innerWidth, MIN_WIDTH)` at `:613`). `ListLayout.MIN_WIDTH = 800` (`:1079`) is a maximum: `targetWidth = Math.min(innerWidth, MIN_WIDTH)` (`:1180`), so a list-mode dialog is shrunk to 800 px, not grown.
- `[verified-in-source]` `resizeWindow()` also sets `documentElement.style.minHeight` from the bubble, list, preview and bottom heights plus a constant (`:611`, `:624`, `:634`), and enlarges the window to that height (`:614-615`).
- `[verified-in-source]` The stylesheet adds `min-width` 800 and 1000 px to `#citation-dialog` (`zotero-platform/win/zotero.css`, cited from the earlier reading; not re-read for this note).
- `[measured-in-test]` The minimum height was about 583 px in the layout we measured. Height cannot be lowered without replacing `resizeWindow()`.
- How the plugin relaxes width: for the persistent window only, `relaxDialogMinWidth()` in `src/features/organizer/dialog/dialogPersistent.ts` sets the library layout's `MIN_WIDTH` to 360 and adds a style with `min-width: 0` to `#citation-dialog`. The list layout's `MIN_WIDTH` is a maximum and is left alone (setting it to 360 would shrink wide list dialogs). The minimum height is not changed.
- `[unproven]` That 360 px is a usable floor for every Zotero layout. Measured only for the layouts in `test/persistentLayout.test.ts`.

## 4. How the command waits for the dialog

- `[verified-in-source]` `displayDialog` resolves only on the window's `unload` (`integration.js:496-512`). Then it calls `progressBar.show()` (`:513`) and awaits the cleanup promise (`:514`).
- `[verified-in-source]` `addEditCitation`/`cite` calls `Zotero.Integration.displayDialog(...)` without `await` (`integration.js:1611`) and then awaits `io.promise` (`:1615`). `io.promise` resolves on `io.accept` or `io.cancel`. So the command's insertion waits for accept, not for the window to close.
- `[verified-in-source]` `execCommand` closes `currentWindow` in its `finally` if the window is still open (`integration.js:312-316`), resolves the command promise and clears `currentWindow` (`:346-347`).
- `[verified-in-source]` `shouldAbortCommand` (`:354-373`) calls `currentWindow.cancel()` if a window is still set when a new command starts. The plugin clears `currentWindow` before it re-runs a command from the browse window, to avoid that.
- `[verified-in-source]` The plugin's progress-bar guard (`dialogPersistent.ts`, `patchProgressBar`) suppresses `Progress.show()` calls without a current document. Zotero calls `show()` after the window closes (`:513`), so without the guard a progress window can appear after the command has ended. Whether that happens in practice was not observed.

## 5. Window features: popup, alwaysRaised, dialog=no

- `[verified-in-source]` Zotero builds the dialog features from `chrome,centerscreen` and adds `alwaysRaised` and the options for the mode (`integration.js:1603-1609`). It adds `dialog=no` only on Linux (`:487`).
- What the plugin does: `normalizePersistentOptions()` (`src/features/organizer/logic/persistentOptions.ts`) removes `popup`, `alwaysRaised` and `centerscreen`. It adds `dialog=no` and `resizable=yes` and sets `left`, `top`, `width` and `height` in device pixels.
- `[unproven]` The reason for removing `popup` and `alwaysRaised` is an assumption. Our understanding is that a popup window is not a normal top-level window, and that `alwaysRaised` pins the dialog above other windows, which is not what a docked task pane needs. Neither was tested against Windows snapping or docking.
- `[unproven]` That `dialog=no` added on all platforms changes nothing we rely on. It was not isolated in a test. Zotero adds it itself only on Linux (`integration.js:487`).

## 6. Position, size and Windows snapping

- `[measured-in-test]` `screenX`, `outerWidth` and the other window geometry properties are in CSS pixels. The `openWindow` features are in device pixels. On this machine (Windows, 125 % scaling, `devicePixelRatio` 1.25) the two differ by that factor. The plugin multiplies by `devicePixelRatio` when it stores a rect and when it opens a window (`positionOf`/`rectOf`, `dialogPersistent.ts`). Tolerance in tests: 2 to 4 px.
- `[verified-in-source]` Zotero stores the size in `integration.citationDialog.windowParams` and restores it on open (`citationDialog.js:96-100`, save at `:212`).
- `[unproven]` Windows keeps snap and dock state with the window handle. A new window at the same position and size is not snapped, so the user has to dock it again after each request. This is an assumption about Windows and was not tested with the Snap feature.

- `[measured-in-test]` Zotero changed the size of a browse window and of a real request window several times in the first second after opening (for example 814 px wide and 1014 by 590 px, the minimums of the list and library layouts, instead of 520 by 800). Without correction the window ended at Zotero's own size. With the pin described below, the sampled size and position stayed within 2 px (size) and 4 px (position) for 5 s, from 300 ms on (the first ~0.3 s can still show Zotero's load-time minimum: about 0.14 s on 10.0.6 and 9.0.6, measured) (`test/features.test.ts`, "keeps the stored rect ..."). The first sample, taken before the first correction, still has the window frame (about 15 px wide and 38 px high on this machine) because `openWindow` features set the content size.
- `[verified-in-source]` The layout minimums are set in the constructors (`citationDialog.js:510`, `:1079`) and the first layout runs during `onLoad`, before our injectors. So the plugin lowers them (`MIN_WIDTH` and the `min-width` CSS) from its own timer as soon as the page exists (`pinRect`, `relaxDialogMinWidth`).
- How the pin works (`dialogPersistent.ts`, `pinRect`): a 20 ms timer moves and resizes the window back to the stored rect, and `resizeTo`/`moveTo` calls by Zotero are clamped to that rect during the pin (`smoothResize` is time-based and still finishes, `helpers.mjs:449-492`). The pin holds the position only in the load phase: it ends LOAD_SETTLE_MS (500 ms) after `DIALOG_STATE.loaded`, at the latest LOAD_CAP_MS (1.5 s) after opening. After that the user can move the window. The earlier pin held the position for 5 s and moved it back; the user reported this as a snap back in real Word, and the code path is changed accordingly. The size stays pinned until the first resize that the pin did not make, after the load phase. A move does not change the size and raises no resize event, which is why the position cannot be guarded the same way. Limits: a minimum height above the stored height (Zotero's about 583 px) makes Zotero and the pin disagree, which the 30-correction cap stops.
- `[measured-in-test]` Moves after the load phase: a browse window and a real request window were moved 2 s after opening, and the position was sampled for 1 s (100 ms steps). Both stayed within 4 px of the target (`features.test.ts`, "a persistent window moved by the user after the load phase ..."). The sampling test ("keeps the stored rect ...") holds the size and position from 0.3 s to 5 s. Measured on 10.0.6 in the test run; the version matrix result is in the test counts in testing.md. Not on 7.x and 8.x (no annotation mode).
- `[unproven]` A user drag in a real Word session (the report that a drag snapped back is reproduced in the code, not in a real mouse drag).
- Limit: a user resize in the first 0.5 s after the page loaded is undone, and so is a resize before the load phase ends at 1.5 s at the latest.
- `[unproven]` How visible the first frames are to the user (the window frame size before the first correction, about 20 ms, and the animation Zotero runs during load). No real Word session was observed for the pinned size.

- `[verified-in-source]` Stored geometry. `openWindow` features set the content size, so the stored size is the inner size (`innerWidth`/`innerHeight`) and the position is the outer position (`screenX`/`screenY`). Storing the outer size would grow the window by the frame (about 15 x 38 px) on each reopen. Zotero's own cleanup writes the outer size to the same key (`cleanupBeforeDialogClosing`, `citationDialog.js:198-212`); the plugin writes its inner size after that (the accept wrappers in `dialogPersistent.ts`), so the plugin's value is the one the next window reads. Zotero reads the value with `resizeTo` (outer size), so a native dialog opened after a persistent one can start about one frame smaller.
- `[measured-in-test]` Live geometry. After the pin, the position and size are polled every 200 ms. At accept and when a window is replaced, the geometry is captured again before anything closes the window, and the next window opens with it. Two reopen cycles after a manual resize keep the outer size within 4 px (`features.test.ts`, "a browse window reopens with the geometry the user gave it, two cycles in a row").

- `[measured-in-test]` Restart memory. The last live rect of a persistent window is kept in the pref `extensions.flexannotate.persistentWindowRect` (JSON with the position and the inner size; written debounced, 500 ms, only on change, and flushed on stop). The first persistent window of a session, with no window open, reads it: a valid size is used, and a position is used only if the window would overlap the main window's screen area (`screen.avail*`). Otherwise the size is kept and the OS places the window (`features` without left/top, so `centerscreen` applies). Invalid values (no JSON, non-numbers, sizes below 320 x 300) fall back to the normal default. A stored size larger than the current screen (e.g. after switching from a bigger monitor) is clamped down to the available area instead of being discarded, so the window never opens bigger than the screen (`parseStoredRect`, `test-unit/persistentRect.test.ts`). Test: `features.test.ts`, "the first persistent window after a restart ..."; unit tests: `test-unit/persistentRect.test.ts`.
- `[unproven]` That a real restart restores the window, and that Zotero and Word behave the same on restart. Not run: Zotero was not restarted in the tests (a new profile is used for each version, so the pref is set by the test).
- Limit: positions on a second monitor count as off-screen, because only the main window's screen area is checked. A position on a monitor that is still connected is therefore dropped; the size is kept.

## 7. The footnote appeared only when the dialog closed

- `[observed-by-user-in-real-Word]` With the option on, the footnote appeared in Word only when the Zotero dialog window closed (that is, when the next "Add Annotation" replaced it). Clicking into Word did not help. With the option off it worked.
- `[observed-by-user-in-real-Word]` The user's Zotero debug log shows the insertion (`setText`/`setCode` and `updateDocument`) completing about 0.1 s after accept. That is the Word write. The command then finishes, which is when the window would have been closed by the native code.
- `[verified-in-source]` The Word plugin's `activate()` is an empty function (`integration/word-for-windows/components/zoteroWinWordIntegration.mjs:284`). The plugin does not switch focus or force a refresh on activate.
- `[unproven]` Why Word shows the footnote only after the window closes. The code we read does not explain it. The design below assumes the display is tied to the command's end, which is the only event the code shows.
- Design response: after accept, the plugin closes the dialog and opens a browse window at the same rect (section 8).

## 8. Browse mode (what the plugin does now)

- After an accepted real request, the native dialog is closed by the command's `finally` (`integration.js:312-316`). Then `openBrowse()` opens a fresh `citationDialog.xhtml` with a synthetic `CitationEditInterface` (`isAddingAnnotations = true`) at the same rect (`dialogPersistent.ts`).
- In the browse window, "Insert" does not run the native accept. `insertFromBrowse()` stores the chosen items and runs `Zotero.Integration.execCommand(agent, "addAnnotation", docId, templateVersion)` again, using the agent and document id from the last real command (captured in `patchExecCommand`).
- In the patched `displayDialog`, the stored items are copied into the real io, the browse window is closed and its unload awaited (capped at 3 s), and the real `io.accept` runs. The browse window reopens when that command ends.
- `[measured-in-test]` Insert from the browse window, the citation reaches the fake document, no dialog window is open during the insert, and the browse window comes back at the same rect with the annotations listed (`test/features.test.ts`, "inserting in the browse window ...").
- `[observed-by-user-in-real-Word]` The user reported that the window reloads and the citation is inserted from it.
- Limits:
  - It needs one real request first, because `agent` and `docId` are only known from a command that Zotero ran. If the user has not yet clicked "Add Annotation" in the session, there is no browse mode.
  - `[unproven]` That `docId` and `templateVersion` stay valid for the whole session. The plugin does not check that the document is still the same one. A changed document would be detected only by the command failing.
  - Tested on Windows with Word and LibreOffice Writer enabled; not tested on macOS, Linux, or in dark mode. The user confirmed the browse window reopens after an insert in real LibreOffice Writer, matching Word's behaviour.
  - WinWord and LibreOffice are allowed to open a browse window. For `http` (Google Docs) re-running the command from the browse window leaves the server's response callback stale: `Server._requestFinished` returns early (server.js:525-527), `execCommand` never reaches its `finally`, and every later command reports that a command is running. LibreOffice was deliberately enabled too: the normal insertion in Writer already runs through the synchronous `sendCommand` path, and the user confirmed the browse insert works in real Writer without a freeze. Word for Mac is not tested either.
  - **Word for Mac cannot reopen the browse window.** Zotero's macOS Word agent is `MacWord` (normalised from `MacWord16`/`MacWord2016` at `integration.js:236-237`); `MacWord` is not in the plugin's allow-list (`isPersistentAgent`: `WinWord`, `LibreOffice`). So on macOS in Microsoft Word the option's core effect — reopening the window after an insert — does not engage; the persistent window itself (position/size memory, normal taskbar window, min-width relaxation) still works, because those parts are agent-independent. On macOS in LibreOffice Writer the agent is `LibreOffice`, so the browse window works there too. `[verified-in-source]` for the agent names, not tested on a real Mac.
  - Turning the switch off no longer closes the current browse window immediately. It stays open until the next insert, which closes it and does not reopen it (`insertFromBrowse` reopens only while the switch is on) — the same "close after insert" behaviour as stock Zotero.
  - Turning the switch on while a dialog is already open works too: `activatePersistentOnOpenDialog()` (wired to the checkbox in `dialogOutline.ts`) installs the browse-reopen wrapper on the running window's io, so the next insert in that window reopens at the same rect like a persistent window opened from the start. Before, the mode only became active after closing and reopening the dialog.
  - The freeze risk for LibreOffice is the same as for a normal insert: the write reaches Writer through Zotero's synchronous `Comm.sendCommand` (`zoteroLibreOfficeIntegration.mjs:270-288`), which blocks the main thread with no timeout if Writer stops responding. No extra plugin-side mitigation is added (it cannot help while the thread is blocked); the same condition already applies to every ordinary annotation insert in Writer, and the user's real-Writer test showed no freeze.
  - Zotero 7 and 8 have no `Interface.prototype.addAnnotation` (checked in the 7.0.32 and 8.0.4 sources), so `persistentSupported()` is false there: nothing is patched, and the option and its switch are hidden.
  - Focus behaviour in Word and Windows focus stealing are not verified.

## 9. Alternatives considered

- **io proxy plus `location.reload()`**: rejected. `window.arguments` is empty after a reload and the handlers keep the first io (sections 1 and 2). Measured, and confirmed from the source.
- **Soft re-initialisation of the old dialog**: rejected. `accept()` unregisters the trees and collapses the layout (section 2). Rebuilding the views was not attempted, and the source does not show a supported way to do it. `[unproven]` that it is impossible in principle.
- **Idle placeholder window**: built first, then removed. The user rejected it: after an insert it showed only a note and nothing could be inserted from it.
- **Keeping the native dialog and not closing it after accept**: this is the behaviour the user saw in Word, where the footnote was not shown until the window closed (section 7). The cause is unproven.

## 10. What a real solution would need

These are proposals for a Zotero-side change, not something the plugin can do alone.

- A citation sidebar that Zotero keeps open between commands, with its io replaceable per command. That would remove the need to reopen the window.
- Or a reusable io: a dialog whose `onLoad` can read a new io, and whose handlers can be rebound to it, plus a way to re-show trees after `accept()`.
- Or Zotero documenting when a Word insertion becomes visible, so that the plugin can rely on it instead of closing the window (section 7).
- A Word-side side pane would avoid the Zotero dialog altogether. Not investigated.

## Related

- [architecture.md](architecture.md): pitfalls 18 to 24, the browse-mode design and the file map.
- [anchors.md](anchors.md): the table of Zotero source lines used by the plugin.
- `docs/handbuch.md` and `docs/guide.md`: user-facing description of the option.
