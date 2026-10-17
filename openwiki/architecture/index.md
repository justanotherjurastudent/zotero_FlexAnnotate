# Files

- [Data Model & Storage](data-model.md) - Persistence design, annotation representations across PDF and print sources, outline trees, item relation markers, and stable preference keys in FlexAnnotate.
- [Feature Lifecycle & Registry](feature-lifecycle.md) - How FlexAnnotate starts and stops — the Feature contract in src/shared/feature.ts, the ordered feature array in src/hooks.ts, error isolation and idempotency rules, the startup/teardown sequence, the addon.api test surface, and preference-pane registration.
- [Architecture & Module Layout](overview.md) - Core architectural structure and module layers of FlexAnnotate (core, shared, features, prefs, utils), strict layering and dependency rules, entrypoints, and esbuild bundle outputs.
- [Prototype Patching & Safe Modification](patching.md) - How FlexAnnotate safely patches Zotero internals via assignChecked, manages dialog hook injection via CitationDialogWatcher, and enforces isolation safeguards protecting user environments and Word processes.
