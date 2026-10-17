# Files

- [Data Model & Storage](data-model.md) - Persistence design, annotation representations across PDF and print sources, outline trees, item relation markers, and stable preference keys in FlexAnnotate.
- [Feature Lifecycle & Registry](feature-lifecycle.md) - How FlexAnnotate starts and stops — the Feature contract in src/shared/feature.ts, the ordered feature array and dialog injectors in src/hooks.ts, error isolation and idempotency rules, the startup/teardown sequence, the addon.api test surface, and preference-pane registration.
- [Architecture & Module Layout](overview.md) - System-wide architectural overview covering module layers (core, shared, features, prefs, utils), strict layering rules, entrypoints, and esbuild bundle outputs.
- [Prototype Patching & Safe Modification](patching.md) - How FlexAnnotate safely patches Zotero internals via assignChecked, manages dialog hook injection via CitationDialogWatcher, and enforces isolation safeguards protecting host stability.
