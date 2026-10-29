# FlexAnnotate Wiki Brief

This brief tells OpenWiki what to document and prioritize in this repository.
It is user-authored and preserved across runs. Aim for concise, source-grounded,
interlinked Markdown in **English** (technical reference language of this repo).

## Scope

Document the Zotero plugin **FlexAnnotate** (TypeScript, zotero-plugin-scaffold).
The wiki should help a coding agent understand architecture, build/test flow, and
the major feature areas without reading everything.

## Priorities (in order)

1. **Architecture & module layout** — how `src/` is organized and why:
   - `src/features/<feature>/logic/` = pure, Zotero-free logic (Node-testable)
   - `src/core/` = logic shared across features (locator, input mask, page popup)
   - `src/shared/` = feature registry, `assignChecked` patch helper, dialog watcher
   - `src/hooks.ts` = feature list and lifecycle (`start`/`stop`, `addToWindow`/`removeFromWindow`)
   - `src/prefs/` = separate settings-window bundle
   - `src/utils/` = locale, prefs, menu registration, ztoolkit wrappers
2. **The feature areas** — print annotations, cite-only mode ("Nur-Nachweis-Zitieren"),
   Citavi import, the Organizer and the citation dialog. For each: purpose, entry
   point, and how it interacts with Zotero.
3. **Build / test / verify workflow** — `npm run build`, `test:unit`, `test:zotero`,
   `test:versions`, `verify`, `lint`; where tests live (`test-unit/` Node vs `test/` real Zotero).
4. **Key conventions and constraints** — from `AGENTS.md`:
   - Prototype patches only via `assignChecked`; never touch a user's real Zotero/Word.
   - Pure logic goes in `logic/` with a `test-unit/` test; Zotero tests only over `addon.api`.
   - Zotero internals only checked against source in `.zotero-reference/`, anchors logged in `docs/anchors.md`.
   - Window state belongs on the element or in a `WeakMap`, never on the module object.
   - Comments, user-facing text, and docs are German; identifiers and log output English.

## Constraints

- Strictly exclude ignored paths (see `.openwikiignore`): `.scaffold/`, `build/`,
  `node_modules/`, `.zotero-reference/`, `.zotero-versions/`, `*.xpi`, `.env`.
- Do not expose license/attribution incorrectly: the Organizer descends from Lattice
  (birugit, AGPL-3.0-or-later); preserve the provenance noted in `NOTICE.md`.
- Prefer Mermaid diagrams where a sequence/state/flow adds clarity.
