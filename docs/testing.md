# Tests

## Contents

- [Commands](#commands)
- [Strategy](#strategy)
- [Zotero tests in detail](#zotero-tests-in-detail)
- [Multiple Zotero versions](#multiple-zotero-versions)
- [Screenshots](#screenshots)
- [Limits](#limits)

## Commands

| Command                      | Effect                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run test:unit`          | Node tests in `test-unit/` (`node --test`), no Zotero needed                                                             |
| `npm run test:unit:coverage` | like `test:unit`, also measures coverage (`--experimental-test-coverage`)                                                |
| `npm run test:unit:repeat`   | runs the unit tests 10 times in a row to check for flakes and determinism                                                |
| `npm run test:zotero`        | Mocha tests in `test/` in a dedicated Zotero instance (about 15 s)                                                       |
| `npm run test:versions`      | like `test:zotero`, in turn for the installed version and each test version in `.zotero-versions/*`; table and exit code |
| `npm run screenshots`        | like `test:zotero`, plus the recordings from `test/screenshots.test.ts`; PNGs into `.scaffold/screenshots/`              |
| `npm run screenshots:docs`   | `screenshots`, then copies the curated images into `docs/img/` (`scripts/docs-screenshots.mjs`)                          |
| `npm run lint:check`         | `prettier --check .` and `eslint .`                                                                                      |
| `npm run build`              | `zotero-plugin build` and `tsc --noEmit`                                                                                 |
| `npm run verify`             | `lint:check`, `build`, `test:unit`, `test:zotero` in sequence                                                            |

As of 2026-10-28: 334 unit tests across 86 test suites (`npm run test:unit`), all passed. Zotero tests without errors (`npm run test:versions`): 10.0.6 (installed) 102 passed, 7 skipped; 9.0.6 102 passed, 7 skipped; 8.0.4 74 passed, 35 skipped; 7.0.32 76 passed, 33 skipped. Tests are skipped when they need a feature of that version (for example the annotations mode of the citation dialog, from Zotero 9 on) or produce screenshots only with `npm run screenshots`; see [Multiple Zotero versions](#multiple-zotero-versions).

## Running a subset

While developing you can run only part of the tests. Without arguments all tests run as before (`verify`, `test:versions` do not change).

- Unit tests by name: `node --test --test-name-pattern=persistent "test-unit/*.test.ts"` (an option of `node --test`; it has to come before the file glob, otherwise it is read as a file, so not via `npm run test:unit -- ...`). By file: `node --test test-unit/persistentRect.test.ts`.
- Zotero tests by title: `npm run test:zotero -- --grep "persistent"`. The search runs over the full title (describe and it). Implementation: `FLEXANNOTATE_GREP` is passed to `mocha.grep` in `test/helpers.ts`; without a pattern everything runs.
- Versions: `npm run test:versions -- --versions 10.0.6,9.0.6 --grep "browse"` runs only those versions with the selection.

Patterns for the browse window (Zotero tests): `persistent` (first dialog after restart, layout, parts of the switch), `browse` (browse window, inserting from it), `stored rect` (position and size), `reopen` (two openings in a row), `switch` (switch), `wide window` (three columns after restart and opening). A selection is only a development tool: before finishing always run `npm run verify` and `npm run test:versions` without arguments.

## Strategy

- Pure logic belongs in `src/core` and is tested with Node in `test-unit/`. Node 24 runs `.ts` directly, so the imports in `src/core` end in `.ts`. No Zotero globals in these files.
- Behaviour that needs Zotero (items, tags, menus, windows, patches) is checked in `test/`, in real Zotero through zotero-plugin-scaffold and Mocha.
- Zotero tests reach the plugin only through `addon.api` (proven in `src/hooks.ts`), never through direct module imports: modules access the global `ztoolkit`, which exists in the test context only through the plugin.
- The Zotero tests run in an isolated profile under `.scaffold/test/` (own data folder, the scaffold's standard port 23124). The productive Zotero and its library stay untouched; Word is not started.
- Test data is synthetic (`test/helpers.ts`: works, linked PDF file, annotations) and is deleted after the runs.
- New logic: first as a pure function in `src/core` with a unit test. Only what cannot be checked without Zotero gets a Zotero test.

## Zotero tests in detail

`npm run test:zotero` starts `scripts/run-zotero-tests.mjs`. The wrapper

- detects `zotero.exe` automatically under `%LOCALAPPDATA%\Zotero`, `%ProgramFiles%\Zotero` and `%ProgramFiles(x86)%\Zotero`, if `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` is not set,
- sets `ZOTERO_PLUGIN_KILL_COMMAND` to `scripts/kill-test-zotero.ps1`, which ends only processes whose command line contains `.scaffold/test`,
- detects "Test run completed" in the output stream and stops the test instance right away (`zotero-plugin test` would otherwise stay up until interrupted),
- aborts after `FLEXANNOTATE_TEST_LIMIT_MS` milliseconds (default 240000; the suite is slower on older Zotero versions).

The test files in `test/` cover: startup and feature lifecycle, settings, print annotations (placeholder, input panel, menus), citation-only patch and mode selection, Citavi import (among others exact keywords, duplicates), reader menu (register and unregister only), tools menu fallback, organizer (data, window, toolbar button, citation dialog view with search and "show place") and the outline import (`docImport.test.ts`, fixtures in `docFixtures.ts`; the pure logic in `test-unit/docOutline.test.ts`).

`scripts/word-smoke.ps1` starts a dedicated, invisible Word instance, checks that `Zotero.dotm` is loaded, and ends it. It opens no document and touches the running Word.

## Multiple Zotero versions

`npm run test:versions` (`scripts/run-versions.mjs`) runs `scripts/run-zotero-tests.mjs` in sequence for

- the installed version (from `%LOCALAPPDATA%\Zotero\app\application.ini`) and
- each version in `.zotero-versions/<version>/core/zotero.exe`. Tested were 7.0.32, 8.0.4 and 9.0.6.

The binaries in `.zotero-versions/` are unpacked installers, not installed, and excluded via `.gitignore`. This is how you get a version:

```powershell
$v = "9.0.6"
Invoke-WebRequest "https://download.zotero.org/client/release/$v/Zotero-${v}_x64_setup.exe" -OutFile "$env:TEMP\zotero-$v-setup.exe"
7z x "-o.zotero-versions/$v" "$env:TEMP\zotero-$v-setup.exe"
# the app then sits under .zotero-versions/9.0.6/core/
```

Each version gets a fresh test profile: the scaffold only empties the data folder, otherwise the profile would keep the startup cache and extension registry of the previous version when switching, and the runs would depend on order (8.0.4 failed only right after 7.0.32). The script deletes `.scaffold/test/profile` before each run, never a productive profile.

At the end comes a table with `version`, `passed`, `failed`, `pending`, `exit`; the exit code is 1 when a version has errors or yields no result. The script counts skipped tests (pending) from the `ℹ … pending` lines, because Zotero does not name them in the result line. What is skipped is what the version lacks: the tests with annotations mode in the citation dialog (`hasAnnotationDialog()` in `test/helpers.ts`, only from Zotero 9 on; `citeOnly.test.ts`, `features.test.ts`, `modeSelector.test.ts`) and the command test of the tools menu fallback, once `Zotero.MenuManager` exists (`toolsMenu.test.ts`).

## Screenshots

`npm run screenshots` sets `FLEXANNOTATE_SCREENSHOTS=1`; `test/screenshots.test.ts` then records the test windows with `drawWindow` (`test/screenshot.ts`) into `.scaffold/screenshots/`. `npm run screenshots:docs` copies the curated files into `docs/img/` (list `CURATED` in `scripts/docs-screenshots.mjs`) and warns about files over 250 KB. `drawWindow` captures only the window itself: popups and menus do not appear. The recordings run in the test profile with synthetic data, never in the productive Zotero.

## Limits

Not tested automatically:

- **Reader window:** context menu, page-number popup and locator display in the reader. Tested is only that the reader menu registers and unregisters.
- **Real Word run:** the path "Word button → citation dialog → insert" needs the user's running Zotero and would touch its library. Tested is the citation dialog itself with the real Zotero window and a dialog object as in `Zotero.Integration.Session.cite`.
- **Real Citavi translator:** the tests use synthetic fixtures. The `PageRange` format (`<os>`/`<nt>`) is therefore only proven against fixtures.
- **Dark mode:** appearance of the toolbar and menu icons and of the reader popup only by code review.
- **Other patch versions:** run were only 7.0.32, 8.0.4, 9.0.6 and 10.0.5/10.0.6. In-between versions are not checked.
- **Citation dialog before Zotero 9:** the annotations mode is missing there; the tests for it are skipped, not passed.
- **File picker of the outline import:** the test hands the file directly to `docImport.importFromFile`; the native dialog (`FilePicker`) is not tested automatically.
