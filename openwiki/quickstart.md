---
type: concept
title: Quickstart & Task-Routing Guide
description: Central entrypoint and task navigation guide for FlexAnnotate coding agents, outlining safety rules, core architecture, and workflow routing.
tags: [quickstart, routing, agents, safety, architecture, conventions]
verified:
  - by: openwiki/0.7.2
    at: 2026-10-16T19:49:13.348Z
sources:
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-115b2dad781e2a2c5b5a980d
    resource: repo://docs/architecture.md
  - id: openwiki-source-13a4eed7349267dabc005400
    resource: repo://scripts/kill-test-zotero.ps1
  - id: openwiki-source-e1a7f541c75c1bc0f78c20d4
    resource: repo://scripts/run-versions.mjs
  - id: openwiki-source-203c7dd08ccb7d6de0448e34
    resource: repo://src/hooks.ts
  - id: openwiki-source-c4ea7da293e48c50e642ab75
    resource: repo://src/shared/feature.ts
  - id: openwiki-source-ffff6188bcf257e1b54d144a
    resource: repo://src/shared/patch.ts
generated: { by: "openwiki/0.7.2", at: "2026-10-16T19:49:13.348Z" }
---

# Quickstart & Task-Routing Guide

FlexAnnotate is a TypeScript-based Zotero plugin (`flexannotate@justanotherjurastudent.github.io`, AGPL-3.0-or-later) built with `zotero-plugin-scaffold` and developed against Zotero 10.0.5/10.0.6 while actively supporting Zotero 7.0 through 10. The plugin overhauls annotation management in Zotero by introducing editable locators and comments across reader and item views, an outline-based annotation organizer (forked from Lattice), citation-only insertion for Word and LibreOffice ("Nur-Nachweis-Zitieren"), annotations for printed media without digital attachments via placeholder PDFs, and a secondary import pass for Citavi knowledge items.

This document serves as the primary task-routing hub and operational guide for autonomous coding agents and human engineers. It establishes the mandatory safety invariants, architectural boundaries, cross-version requirements, and direct pathways to specialized wiki documentation for every engineering task.

---

## Essential Safety Rules & Non-Negotiable Constraints

Agents operating in this repository must adhere strictly to five foundational constraints established in `AGENTS.md` and `docs/architecture.md`. Violating these rules risks corrupting user data or breaking Zotero host stability.

```
+-----------------------------------------------------------------------------------------+
|                                    NON-NEGOTIABLE RULES                                 |
+-----------------------------------------------------------------------------------------+
| 1. NEVER touch production Zotero or Word (isolated profiles only).                     |
| 2. NEVER monkey-patch without assignChecked (verify identity, roll back on teardown).   |
| 3. KEEP pure logic isolated in logic/ or core/ (no Zotero globals, explicit .ts).       |
| 4. BIND window state to DOM elements or WeakMaps (never to module-level variables).     |
| 5. ACCESS plugin internals in integration tests exclusively via addon.api.              |
+-----------------------------------------------------------------------------------------+
```

### 1. Production Environment Isolation
- **No Production Access**: Never run tests, scripts, or build commands against user libraries, personal profiles, or running Word/LibreOffice instances.
- **Isolated Scaffold Profile**: Integration tests execute exclusively within the dedicated profile path `.scaffold/test/`.
- **Targeted Process Termination**: The test process killer (`scripts/kill-test-zotero.ps1`) inspects process command lines using WMI/CIM and forcefully terminates only `zotero.exe` instances whose command lines contain the full path to `.scaffold/test`. User Zotero processes are never touched.
- **Clean Profile per Version**: When testing multi-version compatibility (`npm run test:versions`), the runner script (`scripts/run-versions.mjs`) deletes `.scaffold/test/profile` before each version invocation to prevent startup cache, extension registry, or version marker pollution across Zotero versions.

### 2. Verified Prototype Patching via `assignChecked`
- **Silent Failures in Gecko**: Assigning to non-writable properties throws in strict mode or silently fails outside it. Furthermore, assigning across Mozilla chrome/XUL boundaries can trap properties in an Xray expando, disappearing upon subsequent read-backs.
- **The `assignChecked` Guard**: All prototype and host object modifications must use `assignChecked(target, name, value)` from `src/shared/patch.ts`. It executes the assignment in a `try/catch` block and checks strict identity read-back (`obj[name] === value`).
- **Teardown Symmetry**: Every patch applied during `start()` or `addToWindow()` must be restored to its original reference during `stop()` or `removeFromWindow()`.
- **Anchored Research**: Patches must be grounded in verified Zotero source code extracted from `omni.ja` (referenced under `.zotero-reference/<version>/`) and documented with file and line anchors in `docs/anchors.md`. CommonJS modules loaded via `require()` run in sandboxes with frozen `exports` and cannot be patched.

### 3. Pure Logic Separation
- **No Ambient Host Dependencies**: Pure business logic (data transformations, locator calculations, XML parsers, sort index generation) must live in `src/features/<feature>/logic/` or `src/core/` (if shared across multiple features).
- **Prohibited Host Globals**: Pure logic files must never import or reference Zotero globals (`Zotero`, `Services`, `ztoolkit`, `window`, `document`).
- **Explicit Imports**: Module imports within pure logic files must include explicit `.ts` extensions (for example, `import { buildSortIndex } from "./sortIndex.ts"`).
- **Node-Testable**: Every pure logic file must be covered by fast, deterministic unit tests in `test-unit/` executed via the native Node.js test runner (`npm run test:unit`).

### 4. Window State Isolation
- **Singleton Bundles vs. Multi-Window DOM**: In Zotero's architecture, extension code bundles exist once per process, whereas main windows, reader tabs, and citation dialogs exist independently.
- **State Attachment**: Never store window-specific UI state, interaction flags, or selection indices on module singletons. Attach state directly to DOM elements (as expandos or attributes) or store them in a per-window `WeakMap<Window, State>`.

### 5. Test Surface Access via `addon.api`
- **Runtime Environment Sandbox**: Extension modules require ambient globals (such as `ztoolkit`) injected during plugin startup in the main window.
- **No Direct Module Imports in Integration Tests**: Mocha integration tests in `test/` running inside real Zotero instances must never import runtime modules directly. Instead, they interact with plugin state and features via the structured `addon.api` exposed on plugin startup in `src/hooks.ts`.

---

## Core System Architecture & Lifecycle

FlexAnnotate enforces a strict downward dependency hierarchy. Features depend on `core`, `shared`, and `utils`, but `core` and `shared` never depend on features. The plugin entrypoint `src/hooks.ts` acts as the single composition root.

```
src/hooks.ts (Composition Root & addon.api Exposure)
   |
   +---> src/features/ (print, citeOnly, citavi, reader, organizer)
   |        |
   |        +---> <feature>/logic/ (Pure logic, Node-testable, no Zotero globals)
   |
   +---> src/shared/ (feature registry, assignChecked, citationDialog watcher)
   |
   +---> src/core/ (Shared pure logic: locators, print dialog logic, label popups)
   |
   +---> src/utils/ (locale, preferences, menu wrappers, ztoolkit setup)
   |
   +---> src/prefs/ (Preference pane scripts; bundled independently)
```

### Feature Lifecycle Contract
Features implement the `Feature` interface (`src/shared/feature.ts`):
- `start?(): void | Promise<void>`: Process-level initialization (prototype patching, notifier observers, menu registration via `Zotero.MenuManager`).
- `stop?(): void`: Process-level teardown (restoring patched methods, detaching observers, closing standalone organizer windows, unregistering menus).
- `addToWindow?(win: _ZoteroTypes.MainWindow): void | Promise<void>`: Window-level UI attachment (DOM injection, toolbar buttons, item-menu entries, window event listeners).
- `removeFromWindow?(win: _ZoteroTypes.MainWindow): void`: Window-level UI cleanup (removing injected DOM nodes, cleaning window listeners).

The registry runners (`startAll`, `stopAll`, `addToWindow`, `removeFromWindow`) execute hooks sequentially. Startup runs in forward order; shutdown runs in reverse order. Every invocation is wrapped in error-handling guards that log failures without aborting remaining features.

### Native Data Model
FlexAnnotate avoids proprietary database files or hidden metadata stores. All user data is stored within native Zotero entities to guarantee full synchronization across devices and data preservation if the plugin is uninstalled:
- **Placeholders**: Generated 1-page PDF attachments marked with tag `#flexannotate-placeholder`.
- **CSL Locators**: Custom annotation tags `#flexannotate-locator-<type>` and attachment defaults `#flexannotate-default-locator-<type>`.
- **Outline Headings**: Tags formatted as `§<Heading Title>` on annotations, parent items, and outline notes.
- **Outline Trees**: Standalone Zotero notes tagged with `★outline` containing JSON trees prefixed by `LATTICE-OUTLINE-V1`. Collection-scoped outlines add `#flexannotate-outline-<collectionKey>`.
- **Preferences**: Stable persistent keys under `extensions.flexannotate.` in `addon/prefs.js`.

---

## Task-Routing Decision Flowchart

When beginning a task, consult this decision tree to determine which code layer, testing environment, and documentation guide to use.

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->
```text
flowchart TD
    Start["Incoming Agent Task"] --> TaskType{"What is the primary scope?"}

    TaskType -->|"Pure Calculation / Transformation"| PureLogic["Implement in src/features/<feature>/logic/ or src/core/<br/>Import with explicit .ts extension"]
    TaskType -->|"Zotero DOM / Main Window UI"| WindowUI["Implement in src/features/<feature>/<br/>Hook into addToWindow & removeFromWindow"]
    TaskType -->|"Gecko / Zotero Host Monkey Patch"| HostPatch["Inspect omni.ja in .zotero-reference/<br/>Patch using assignChecked in start()"]
    TaskType -->|"Word / Citation Dialog Integration"| CitDialog["Inject via shared/citationDialog.ts<br/>Handle modeSelector or dialogOutline"]
    TaskType -->|"Outline Tree / Docx / Odt"| OrgOutline["Work in src/features/organizer/<br/>Sync tags and outline notes via OutlineModel"]
    TaskType -->|"Testing / Automation / CI"| TestSuite["Write Node test in test-unit/ or Mocha in test/<br/>Run scripts/run-zotero-tests.mjs"]

    PureLogic --> RouteConventions["Read conventions.md & testing/strategy.md"]
    WindowUI --> RouteLifecycle["Read architecture/feature-lifecycle.md & overview.md"]
    HostPatch --> RoutePatching["Read architecture/patching.md & integrations/zotero-internals.md"]
    CitDialog --> RouteCiteOnly["Read features/cite-only.md & features/organizer.md"]
    OrgOutline --> RouteOrganizer["Read features/organizer.md & architecture/data-model.md"]
    TestSuite --> RouteTesting["Read testing/strategy.md & testing/commands-and-runners.md"]
```
*Decision tree routing tasks to code locations, architectural constraints, and documentation.*

---

## Comprehensive Task-Routing Matrix

Use this matrix to navigate between common engineering objectives, code ownership boundaries, verification commands, and detailed wiki guides:

| Engineering Task | Primary Source Files | Key Interfaces / Conventions | Verification Commands | Wiki Navigation Link |
| :--- | :--- | :--- | :--- | :--- |
| **Add / Edit Business Logic** | `src/features/<feature>/logic/`, `src/core/` | No host globals, explicit `.ts` imports, pure functions | `npm run test:unit` | [Conventions](conventions.md)<br/>[Testing Strategy](testing/strategy.md) |
| **Main Window UI / Menus** | `src/features/print/menus.ts`, `src/features/organizer/toolbarButton.ts`, `src/utils/menu.ts` | Idempotent DOM injection in `addToWindow`, expando cleanup in `removeFromWindow` | `npm run test:zotero` | [Feature Lifecycle](architecture/feature-lifecycle.md)<br/>[Architecture Overview](architecture/overview.md) |
| **Host Monkey-Patching** | `src/shared/patch.ts`, `src/features/citeOnly/integrationPatch.ts`, `src/features/citavi/citaviImport.ts` | Always use `assignChecked`, anchor in `docs/anchors.md`, symmetric teardown | `npm run test:zotero` | [Prototype Patching](architecture/patching.md)<br/>[Zotero Internals](integrations/zotero-internals.md) |
| **Word Citation Dialog** | `src/shared/citationDialog.ts`, `src/features/citeOnly/modeSelector.ts`, `src/features/organizer/dialog/` | Inject via `registerDialogInjector`, support persistent window & narrow layout (<750px) | `npm run test:zotero` | [Cite-Only Mode](features/cite-only.md)<br/>[Organizer & Outline](features/organizer.md) |
| **Citavi Import Processing** | `src/features/citavi/citaviImport.ts`, `src/features/citavi/citaviPrintQuotes.ts`, `citaviLinks.ts` | Second-pass execution in `finally` of file interface, quote deduplication | `npm run test:unit`<br/>`npm run test:zotero` | [Citavi Import](features/citavi-import.md) |
| **Print Annotations & PDFs** | `src/features/print/placeholder.ts`, `src/features/print/printAnnotations.ts`, `dialog.ts` | PDF reader type enforcement, sort index clamping (`00000\|000000\|00000`), `#flexannotate-placeholder` | `npm run test:unit`<br/>`npm run test:zotero` | [Print Annotations](features/print-annotations.md)<br/>[Data Model](architecture/data-model.md) |
| **Organizer & Outline Sync** | `src/features/organizer/outlineModel.ts`, `organizerTree.ts`, `docImport.ts`, `docExport.ts` | Tag synchronization (`§Title`), single-instance window factory, `LATTICE-OUTLINE-V1` sentinel | `npm run test:unit`<br/>`npm run test:zotero` | [Organizer & Outline](features/organizer.md)<br/>[Data Model](architecture/data-model.md) |
| **External Plugin API** | `src/features/organizer/externalApi.ts`, `src/hooks.ts` | Expose read-only outline tree at `Zotero.FlexAnnotate`, manage lifecycle | `npm run test:zotero` | [External API](integrations/external-api.md) |
| **Localization & Prefs** | `addon/locale/{de,en-US}/`, `addon/content/preferences.xhtml`, `src/prefs/preferences.ts` | Maintain German and English FTL files simultaneously; preference menulist lifecycle | `npm run build`<br/>`npm run lint:check` | [Conventions](conventions.md)<br/>[Build & Release](operations/build-and-release.md) |
| **Zotero Compatibility** | `src/features/organizer/toolsMenuFallback.ts`, `src/features/print/logic/printAnnotation.ts` | Feature detection over version comparison; verify across 7, 8, 9, 10 | `npm run test:versions` | [Zotero Internals](integrations/zotero-internals.md)<br/>[Commands & Runners](testing/commands-and-runners.md) |
| **Build, Package & Lint** | `package.json`, `addon/manifest.json`, `tsconfig.json`, `test/tsconfig.json` | Dual TypeScript typechecking, `strict_max_version` requirement for Zotero 10 | `npm run verify` | [Build & Release](operations/build-and-release.md) |

---

## Essential Commands & Workflow Cheatsheet

Coding agents should use the following standard commands during development, validation, and verification:

### Verification Pipeline
```bash
# Run the complete verification suite (Prettier, ESLint, dual tsc, Node tests, Zotero tests)
npm run verify
```

### Targeted Testing
```bash
# Fast Node.js unit tests for pure logic (< 1 second)
npm run test:unit

# Run Node.js unit tests with code coverage analysis
npm run test:unit:coverage

# Run Zotero integration tests in isolated .scaffold/test/ profile (~15 seconds)
npm run test:zotero

# Filter Zotero integration tests by pattern
npm run test:zotero -- --grep "citeOnly"

# Run integration suite across all installed/downloaded versions (7.0, 8.0, 9.0, 10.0)
npm run test:versions

# Filter multi-version runs by version and test title
node scripts/run-versions.mjs --versions 10.0.6,9.0.6 --grep "organizer"
```

### Build & Linting
```bash
# Compile bundle and run dual TypeScript checks (source and test tsconfig)
npm run build

# Check code formatting (Prettier) and linting (ESLint)
npm run lint:check

# Auto-fix formatting and linting errors
npm run lint:fix

# Generate updated documentation screenshots
npm run screenshots:docs
```

---

## Working Conventions & Commit Rules

1. **Language Policy**:
   - Comments, commit messages, agent notes, and end-user documentation must be written in German.
   - Code identifiers, variable names, function names, and technical log statements must be written in English.
   - `docs/architecture.md` is maintained in English as the authoritative technical reference.
2. **Dual-Locale Maintenance**: Any change to user-facing strings must be applied synchronously to both German (`addon/locale/de/*.ftl`) and English (`addon/locale/en-US/*.ftl`) localization files. Organizer window strings live in `src/features/organizer/strings.ts`.
3. **Identifier Stability**: Persistent preference keys (`extensions.flexannotate.*`) and tag formats (`#flexannotate-*`, `§Title`, `★outline`) store live user data and must never be arbitrarily renamed.
4. **Third-Party Attribution**: The Organizer component is a derived fork of Lattice (`birugit`, AGPL-3.0-or-later). License headers, copyright notices, and provenance entries in `NOTICE.md` must be strictly maintained.
5. **Git Operations**: Agents must never push branches, create tags, or initiate releases unless explicitly instructed by the user. Commits must follow Conventional Commits formatting (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
