---
type: operations
title: Build, Packaging & Release
description: Build pipeline using zotero-plugin-scaffold and esbuild, TypeScript dual-config verification, XPI packaging, release workflows, and manifest compatibility bounds.
tags: [operations, build, release, packaging, zotero-plugin-scaffold, esbuild, updates, ci, typescript]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-16T19:49:13.348Z
sources:
  - id: openwiki-source-5f5b95b3d6a215fa02ceb945
    resource: repo://.env.example
  - id: openwiki-source-79b37831c9c81206da1d88ec
    resource: repo://.github/dependabot.yml
  - id: openwiki-source-164e2da859b5277df81c7d94
    resource: repo://.github/workflows/ci.yml
  - id: openwiki-source-4d1d392666be6dfdd7a91a2e
    resource: repo://.github/workflows/release.yml
  - id: openwiki-source-ea70eb6c045047448e446296
    resource: repo://.gitignore
  - id: openwiki-source-e119253b3c3737247dc63f2a
    resource: repo://.openwikiignore
  - id: openwiki-source-bf3e76d6c2b2ed72992fe748
    resource: repo://addon/bootstrap.js
  - id: openwiki-source-858bad54ae30a3ea13767830
    resource: repo://addon/content/icons/icon.svg
  - id: openwiki-source-a9881e7baa40bb12538c2760
    resource: repo://addon/content/preferences.xhtml
  - id: openwiki-source-462bd155ced86e87e4c84777
    resource: repo://addon/content/zoteroPane.css
  - id: openwiki-source-842fdbe2a14fcef1b1c961b1
    resource: repo://addon/locale/de/addon.ftl
  - id: openwiki-source-5e7600950cd909e82c8afe85
    resource: repo://addon/locale/en-US/preferences.ftl
  - id: openwiki-source-38547aa50e37ec80b0d08602
    resource: repo://addon/manifest.json
  - id: openwiki-source-929d66ee695e065932e4d312
    resource: repo://addon/prefs.js
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-ca6cb4b1a14fd7969dfae3ec
    resource: repo://CHANGELOG.md
  - id: openwiki-source-115b2dad781e2a2c5b5a980d
    resource: repo://docs/architecture.md
  - id: openwiki-source-6886a5ee75169ef04af04f15
    resource: repo://docs/lattice-changelog.md
  - id: openwiki-source-2fda883e9b76745f69f487f7
    resource: repo://eslint.config.mjs
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-902edea08b23b3c6889179b6
    resource: repo://src/addon.ts
  - id: openwiki-source-203c7dd08ccb7d6de0448e34
    resource: repo://src/hooks.ts
  - id: openwiki-source-d1fbef09192ffbab6eff0bc2
    resource: repo://src/index.ts
  - id: openwiki-source-8c4f9cd772f4676743505d96
    resource: repo://src/prefs/preferences.ts
  - id: openwiki-source-c379b8f49ae922dbbb71e2c2
    resource: repo://src/utils/prefs.ts
  - id: openwiki-source-32ee6a3a7c5ef9573082d7b3
    resource: repo://src/utils/ztoolkit.ts
  - id: openwiki-source-d2312aeb185e1d9e3e4a89ac
    resource: repo://test/tsconfig.json
  - id: openwiki-source-98d5ddb014a0fd4d678f6f2a
    resource: repo://tsconfig.json
  - id: openwiki-source-4555b956aff532b96ab50bd8
    resource: repo://updates.json
  - id: openwiki-source-64ea321d3689c35b39d43e01
    resource: repo://zotero-plugin.config.ts
generated: { by: "openwiki/0.7.2", at: "2026-10-16T19:49:13.348Z" }
---

Everything about how FlexAnnotate is built, packaged, and shipped is configured in [zotero-plugin.config.ts](../../zotero-plugin.config.ts): it declares source roots, the output staging directory, the plugin identity, update feed templates, build-time constant substitutions, and two distinct esbuild bundles. The `zotero-plugin build` command assembles the static `addon/` assets along with both compiled bundles into `.scaffold/build` and archives the directory as `flex-annotate.xpi`. Development runs execute through `zotero-plugin serve` using environment variables defined in `.env`. Neither build outputs nor environment files are treated as sources of truth: `.scaffold/`, `build/`, `*.xpi`, and `.env` are gitignored and excluded by [.openwikiignore](../../.openwikiignore), so build behavior is documented strictly from the configuration and scripts that produce them.

## Build → release → update flow

```mermaid
flowchart LR
    subgraph sources["Repository sources"]
        SRC["src/index.ts"]
        PREFS["src/prefs/preferences.ts"]
        ADDON["addon/ assets"]
        PKG["package.json"]
    end
    subgraph step["zotero-plugin build"]
        MAIN["esbuild main bundle"]
        PANEBLD["esbuild pane bundle"]
        COPY["copy assets and fill placeholders"]
    end
    subgraph out[".scaffold/build, gitignored"]
        MAINJS["content/scripts/flexannotate.js"]
        PREFJS["content/scripts/preferences.js"]
        XPI["flex-annotate.xpi"]
    end
    SRC --> MAIN --> MAINJS
    PREFS --> PANEBLD --> PREFJS
    ADDON --> COPY --> XPI
    PKG --> COPY
    MAINJS --> XPI
    PREFJS --> XPI
    XPI --> REL["GitHub release per version"]
    REL --> UPD["update.json entry on the release tag"]
    MAN["Installed plugin polls manifest update_url"] -->|"fetches"| UPD
    UPD -->|"update_link"| NEXT["Download and install the new xpi"]
```
*Figure: End-to-end pipeline from source files and esbuild bundling to XPI packaging, GitHub release, and manifest update polling.*

The package metadata and configuration in [package.json](../../package.json) supply the build constants; `src/index.ts` and `src/prefs/preferences.ts` compile into the two required bundles; and all static assets under `addon/` are copied while substituting compile-time placeholders (`__name__`). Automated releases publish the `.xpi` per version tag and update the feed under the `release` tag, which installed plugin instances query via the `update_url` declared in their manifest.

## The build definition

[zotero-plugin.config.ts](../../zotero-plugin.config.ts) defines the complete build configuration via `defineConfig`:

- **`source: ["src", "addon"]` and `dist: ".scaffold/build"`**: The source roots and staging target. Running `npm run build` produces `.scaffold/build/flex-annotate.xpi` ([AGENTS.md](../../AGENTS.md), commands). The directory also hosts ephemeral test profiles (`.scaffold/test/`) and UI screenshots (`.scaffold/screenshots/`); the entire `.scaffold/` directory is disposable.
- **Identity declarations**: Sourced directly from `pkg.config` in [package.json](../../package.json):
  - `name`: `FlexAnnotate`
  - `id`: `flexannotate@justanotherjurastudent.github.io`
  - `namespace`: `flexannotate` (matches `addonRef`)
  - `instance`: `FlexAnnotate`
  - `prefix`: `extensions.flexannotate` (declared in `pkg.config.prefsPrefix` and echoed in `build.prefs.prefix`).
  The `config` object is also spread into `build.define`, allowing values to be accessed both as TypeScript imports (`import pkg from "./package.json"`) and as preprocessor-substituted constants.
- **`updateURL`**: A templated URL resolved at build time:
  `https://github.com/{{owner}}/{{repo}}/releases/download/release/update-beta.json` when `pkg.version` contains a hyphen (prerelease), or `…/update.json` for stable releases. The `{{owner}}` and `{{repo}}` placeholders are resolved from `package.json`'s `repository.url` (`justanotherjurastudent/zotero_FlexAnnotate`). The built manifest receives this through `__updateURL__`, meaning installed versions check the GitHub release tag directly without an intermediate update server.
- **`xpiDownloadLink`**: The download template `https://github.com/{{owner}}/{{repo}}/releases/download/v{{version}}/{{xpiName}}.xpi`, where `{{xpiName}}` resolves to `flex-annotate`. Entries in [updates.json](../../updates.json) match this structure.
- **`build.assets: ["addon/**/*.*"]`**: Directs the scaffold to copy all static files under `addon/` into `.scaffold/build`—including `manifest.json`, `bootstrap.js`, `prefs.js`, preference pane XHTML, icons, CSS, and Fluent locale trees—while replacing defined tokens.
- **`build.define`**: Merges `pkg.config` with `author`, `description`, `homepage`, `buildVersion` (`pkg.version`), and `buildTime` (using scaffold placeholder `{{buildTime}}`). These tokens appear in source files as `__token__` placeholders:
  - `addon/manifest.json` consumes `__addonName__`, `__buildVersion__`, `__description__`, `__homepage__`, `__author__`, `__addonID__`, and `__updateURL__`.
  - [addon/bootstrap.js](../../addon/bootstrap.js) consumes `__addonRef__` and `__addonInstance__`.
  - [addon/content/preferences.xhtml](../../addon/content/preferences.xhtml) links its localization via `__addonRef__-preferences.ftl`.
- **`test.waitForPlugin`**: Declared as `() => Zotero.FlexAnnotate.data.initialized`. This flag is set in [src/hooks.ts](../../src/hooks.ts) at the conclusion of `onStartup`, after initialization promises resolve, locales initialize, `addon.api` is attached, preference panes register, and `startAll(features)` completes. The automated test runner polls this predicate before executing assertions.
- **`logLevel: "trace"`**: Available (commented out) in `zotero-plugin.config.ts` for debugging placeholder replacement and XPI zip packaging.

## The two esbuild bundles

The `build.esbuildOptions` array in [zotero-plugin.config.ts](../../zotero-plugin.config.ts) defines two distinct bundles. Both configure `bundle: true` and specify **`target: "firefox140"`**, targeting the modern Gecko engine underlying Zotero. The same bundles run across all supported Zotero releases (7.0.32, 8.0.4, 9.0.6, and 10.0.5/10.0.6) without per-version compilation variations.

| Bundle | Entry point | Output path | Environment & globals |
| ------ | ----------- | ----------- | --------------------- |
| Main bundle | `src/index.ts` | `.scaffold/build/addon/content/scripts/flexannotate.js` | Receives `__env__` from `process.env.NODE_ENV` (stored as `addon.data.env`). Installs `addon` and `ztoolkit` onto `_globalThis`. |
| Preferences bundle | `src/prefs/preferences.ts` | `.scaffold/build/addon/content/scripts/preferences.js` | Self-contained sandbox script for Zotero's preferences window. Operates without plugin globals. |

### Why preferences require an isolated bundle

Zotero loads preference pane scripts into an isolated sandbox window scope where only standard Zotero globals (`Zotero.*`), `window`, and `document` exist. Plugin globals instantiated by the main bundle (such as `addon` or `ztoolkit`) are **not** in scope (reflected in `zotero-plugin.config.ts`: `"Pane-Scripts laufen ohne Plugin-Globals"`).

The script is registered via the `scripts` property of `Zotero.PreferencePanes.register` in [src/hooks.ts](../../src/hooks.ts). Because it cannot access the main runtime's memory, any shared pure logic—such as [buildLocatorOptions](../../src/core/labelPopup.ts)—must be imported and bundled directly. Within the pane, [src/prefs/preferences.ts](../../src/prefs/preferences.ts):
1. Waits for `Zotero.Styles.init()`.
2. Populates five Citavi locator `<menupopup>` elements with localized style names.
3. Hides the persistent citation dialog checkbox if `Zotero.Integration` lacks `addAnnotation`.
4. Queues operations on the document-level capture-phase `load` event.

### Startup cache invalidation

The main bundle is loaded in [addon/bootstrap.js](../../addon/bootstrap.js) using `Services.scriptloader.loadSubScriptWithOptions` with `{ target: ctx, ignoreCache: true }`, ensuring code changes take effect immediately on reload.

In contrast, Zotero loads preference pane scripts through Gecko's startup cache without the `ignoreCache` flag. When editing `preferences.ts` during local development, developers must start Zotero once with the **`-purgecaches`** command-line flag; otherwise, the runtime continues executing the stale cached bytecode (documented as pitfall 4 in [docs/architecture.md](../../docs/architecture.md)).

## What ships: the `addon/` directory

### `manifest.json` and `strict_max_version` rules

[addon/manifest.json](../../addon/manifest.json) is a WebExtension Manifest V2 specification file containing placeholder macros. Its core configuration is the `applications.zotero` block:

```json
{
  "manifest_version": 2,
  "name": "__addonName__",
  "version": "__buildVersion__",
  "applications": {
    "zotero": {
      "id": "__addonID__",
      "update_url": "__updateURL__",
      "strict_min_version": "7.0",
      "strict_max_version": "10.*"
    }
  }
}
```

**`strict_max_version` is mandatory on Zotero 10.** In Zotero 10, any extension manifest omitting `strict_max_version` is rejected and silently dropped during manifest parsing without descriptive error messages (verified on 10.0.1 across multiple plugins; pitfall 9 in [docs/architecture.md](../../docs/architecture.md)). Although the preference `extensions.strictCompatibility` defaults to `false` in Zotero's developer settings, `zotero-plugin-toolkit` sets `addon.strictCompatibility` to true for release builds, enforcing compatibility bounds at runtime.

The project rule ([AGENTS.md](../../AGENTS.md), conventions) dictates that when a new Zotero major version is released:
1. Increment `strict_max_version`.
2. Run the multi-version test suite against the new target (`npm run test:versions`).
3. Only after verification passes should the bound be widened in version control.

### `bootstrap.js`

[addon/bootstrap.js](../../addon/bootstrap.js) is minimal and templated:
- Registers the chrome content mapping: `__addonRef__` → `rootURI/content/`.
- Prepares the sandbox context `{ rootURI }` with `_globalThis`, the global root where the main bundle attaches `addon` and `ztoolkit`.
- Loads `content/scripts/__addonRef__.js` using `loadSubScriptWithOptions` with `ignoreCache: true`.
- Relays Zotero lifecycle notifications (`startup`, `shutdown`, `install`, `uninstall`) to `Zotero.FlexAnnotate.hooks`.
- Handles `shutdown` optimizations: exits immediately without teardown when the reason is `APP_SHUTDOWN` (avoiding redundant cleanup during application termination), but executes full unregistration and chrome handle disposal on explicit addon disable or upgrade.

### `prefs.js` default preferences

[addon/prefs.js](../../addon/prefs.js) registers default preference keys under the `extensions.flexannotate.*` branch. These include:
- `showWorksInAnnotationView`, `showCommentInOrganizerRows`
- `dialogOutlineView`, `dialogOutlineCollection`
- `citedAnnotations`, `citationOnly`
- `persistentCitationDialog`, `persistentWindowRect`, `keepEmptyPlaceholders`
- `citaviImport`, `citaviKeepNotes`, `citaviLinkContributions`
- Five Citavi locator mapping defaults (`citaviLocatorPage`, `citaviLocatorColumn`, `citaviLocatorParagraph`, `citaviLocatorMargin`, `citaviLocatorOther`), with `citaviLocatorMargin` defaulting to `"paragraph"`.

These preference names hold user configuration and are **never renamed** ([Conventions & constraints](../conventions.md)). [src/utils/prefs.ts](../../src/utils/prefs.ts) interfaces with them via `config.prefsPrefix`.

### `content/` and `locale/` assets

- [addon/content/preferences.xhtml](../../addon/content/preferences.xhtml) provides the preference pane UI fragment registered at `chrome://flexannotate/content/preferences.xhtml`. It declares an isolated `<linkset>` referencing `__addonRef__-preferences.ftl`, declarative `data-l10n-id` and `preference` attributes, and five empty `<menupopup>` targets filled dynamically by the preferences script.
- `addon/content/icons/` contains `icon.svg` (used for 48px/96px manifest entries, preference pane branding, and `ProgressWindow` icons), `organizer.svg`, and context-menu SVG icons.
- `addon/content/zoteroPane.css` contains an unused styling template class (`.makeItRed`) leftover from the scaffold initialization.
- Locales are maintained concurrently in `addon/locale/de` and `addon/locale/en-US`. Main windows load `addon.ftl` and `mainWindow.ftl` on startup, while `preferences.ftl` is pulled into the preference pane through its linkset.

## TypeScript verification setup

Type verification uses a dual-configuration architecture reflecting Zotero's differing runtime scopes:

```
tsconfig.json (root)         test/tsconfig.json
────────────────────         ──────────────────
extends: sandbox/            extends: mainWindow/
scope: src, typings, test-unit scope: ../typings, ../src, test/
validates: pure logic,       validates: integration tests,
           sandbox runtime              Mocha runner, DOM,
           & Node unit tests            Zotero mainWindow globals
```

1. **Root configuration ([tsconfig.json](../../tsconfig.json))**:
   - Extends `"zotero-types/entries/sandbox/"`.
   - Targets `src`, `typings`, and `test-unit` while excluding `build` and `addon`.
   - Enforces sandbox scoping: mainWindow globals and DOM elements are not assumed to exist, ensuring pure logic modules in `src/features/*/logic/` remain clean and testable under Node.js.
   - Sets `noEmit: true`, `allowImportingTsExtensions: true`, and `rewriteRelativeImportExtensions: true`, enabling explicit `.ts` import specifiers in source files.
2. **Test configuration ([test/tsconfig.json](../../test/tsconfig.json))**:
   - Extends `"zotero-types/entries/mainWindow/"`.
   - Targets `test/`, `../typings`, and `../src`.
   - Includes type definitions for `mainWindow`, `mocha`, and `node` (`types: ["zotero-types/entries/mainWindow", "mocha", "node"]`).
   - Validates integration tests running directly inside Zotero's live window with full access to `window`, `document`, and Mocha test globals (`describe`, `it`, `before`, `after`).
   - Also specifies `allowImportingTsExtensions: true` and `rewriteRelativeImportExtensions: true`.

The `typecheck` script in [package.json](../../package.json) runs both checks in sequence:
```bash
tsc --noEmit && tsc -p test/tsconfig.json --noEmit
```
Furthermore, `npm run build` chains compilation with type verification (`zotero-plugin build && npm run typecheck`), guaranteeing that no build artifact is produced if either configuration fails type checking.

## Updates and release distribution

[updates.json](../../updates.json) at the repository root defines the update catalog fetched by installed plugins from GitHub releases. Newest versions are ordered first (2.0.0, 1.2.0, 1.1.0, 1.0.0), each declaring:
- `version`: The semantic release version.
- `update_link`: Absolute URL to the `.xpi` artifact on the release tag (e.g. `https://github.com/justanotherjurastudent/zotero_FlexAnnotate/releases/download/v2.0.0/flex-annotate.xpi`, matching the `xpiDownloadLink` template).
- `applications.zotero`: Compatibility boundaries (`strict_min_version: "7.0"`, `strict_max_version: "10.*"`).
- `update_hash`: SHA-512 checksum verifying package integrity for modern releases.

When Zotero checks for updates, it requests the URL resolved from the manifest's `update_url`. Because `updateURL` in `zotero-plugin.config.ts` points to the `release` tag on GitHub (`.../releases/download/release/update.json`), the update manifest is delivered statically via GitHub Releases without custom server infrastructure.

## Development environment: `.env`

Local development with live reloading is executed via `npm start` (`zotero-plugin serve`). This command relies on path configuration in `.env` (gitignored), which developers initialize from [.env.example](../../.env.example):

| Variable | Purpose |
| -------- | ------- |
| `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` | Path to the Zotero binary (e.g. `C:\\Program Files\\Zotero\\zotero.exe` with escaped backslashes on Windows, or `/Applications/Zotero.app/Contents/MacOS/zotero` on macOS). |
| `ZOTERO_PLUGIN_PROFILE_PATH` | Path to a dedicated development profile directory (created via `zotero -p`). |
| `ZOTERO_PLUGIN_DATA_DIR` | Optional custom data directory; left empty to run with default profile data. |
| `ZOTERO_PLUGIN_KILL_COMMAND` | Optional command to terminate running instances; platform defaults are built into `zotero-plugin`. |
| `GITHUB_TOKEN` | Required only when generating releases locally; allows the scaffold to create releases and upload `.xpi` assets. |

Alternatively, developers managing multiple plugins can configure `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` and `ZOTERO_PLUGIN_PROFILE_PATH` as system environment variables. The integration test runners also consume these variables ([Testing commands & runners](../testing/commands-and-runners.md)), with custom kill scripts ensuring only the test runner instance is terminated.

## Quality gates and CI

The verification sequence configured in [package.json](../../package.json) enforces code quality across multiple stages:

- `npm run lint:check`: Executes `prettier --check . && eslint .` using `@zotero-plugin/eslint-config` (with `no-unused-vars` disabled for `*.ts` files). `npm run lint:fix` formats code in-place.
- `npm run build`: Executes `zotero-plugin build` followed immediately by `npm run typecheck`, producing `.scaffold/build/flex-annotate.xpi`.
- `npm run verify`: The complete pre-commit gate, running `lint:check`, `build`, `test:unit`, and `test:zotero` sequentially.

### GitHub Actions workflows

1. **Continuous Integration ([.github/workflows/ci.yml](../../.github/workflows/ci.yml))**:
   Triggers on pushes and pull requests targeting `main`. Runs three concurrent jobs:
   - `lint`: Verifies formatting and lint rules.
   - `build`: Compiles the extension and uploads `.scaffold/build` as the `build-result` workflow artifact.
   - `test`: Executes the automated test suite.
2. **Release ([.github/workflows/release.yml](../../.github/workflows/release.yml))**:
   Triggers exclusively on tag pushes matching `v**`. Delegates execution to the reusable workflow `zotero-plugin-dev/workflows/.github/workflows/release-plugin.yml@master` with:
   - `build: "npm run build"`
   - `release: "npm run release"`
   - Configured with `contents: write`, `issues: write`, and `pull-requests: write` permissions, and `secrets: inherit`.
3. **Dependency updates ([.github/dependabot.yml](../../.github/dependabot.yml))**:
   Schedules weekly npm dependency updates, grouping minor and patch version bumps together.

## Release rules and constraints

Project operational constraints from [AGENTS.md](../../AGENTS.md) govern all versioning and release actions:
- **Authorization**: Never push, release, or create git tags without explicit instruction.
- **Commit formatting**: Use Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- **Documentation co-location**: Documentation must ship within the same changeset as code changes:
  - `README.md` and `CHANGELOG.md` updated for every user-facing change.
  - `docs/anchors.md` updated with file line numbers and Zotero versions whenever hooking new Zotero internal methods.
  - `docs/architecture.md` updated whenever new edge cases or architectural pitfalls are discovered.
- **Changelog maintenance**: [CHANGELOG.md](../../CHANGELOG.md) adheres to Keep a Changelog and Semantic Versioning. The upstream Lattice changelog is preserved unmodified in [docs/lattice-changelog.md](../../docs/lattice-changelog.md).

## Related pages

- [Architecture & Module Layout](../architecture/overview.md) — Internal module architecture, layer separation, and component structure.
- [Feature Lifecycle & Registry](../architecture/feature-lifecycle.md) — The `onStartup` sequence, feature registration, and the `waitForPlugin` lifecycle hook.
- [Conventions & Constraints](../conventions.md) — Stable preference naming, tag identifiers, and commit guidelines.
- [Quickstart](../quickstart.md) — Getting started with development and common workflows.
- [Testing Commands & Runners](../testing/commands-and-runners.md) — Detailed documentation of the unit, Zotero integration, and multi-version test suites.
