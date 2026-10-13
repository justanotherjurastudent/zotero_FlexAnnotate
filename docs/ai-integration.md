# Assigning annotations to the outline with an AI tool

## Introduction

FlexAnnotate has no AI features. This page describes the data a tool needs to
assign annotations to the headings of the organizer outline, for developers of
MCP servers and Zotero plugins that connect a language model to Zotero. Nothing
here requires the plugin to be running; everything is stored as ordinary Zotero
tags and notes.

## Data model

| Thing            | Representation                                            |
| ---------------- | --------------------------------------------------------- |
| Heading          | A Zotero tag `§` + title (trimmed), e.g. `§Introduction`. |
| Assignment       | The annotation item carries the heading tag.              |
| Several headings | The annotation carries several `§` tags.                  |
| Outline tree     | JSON inside one standalone note tagged `★outline`.        |

The tree gives hierarchy and order only. Assigning never touches the note.
Numbers such as `1.2.3` are computed for display and are not stored.

### Which outline applies: one tree per top-level collection

A library can hold several outlines, each one a note tagged `★outline`:

| Outline         | Marker on the note                                | Used for                                                              |
| --------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| Library tree    | no `#flexannotate-outline-<key>` tag              | work without a collection chosen                                      |
| Collection tree | extra tag `#flexannotate-outline-<collectionKey>` | the top-level collection `<collectionKey>` and all its subcollections |

To pick the tree for a run:

1. Take the collection the user names. If it is a subcollection, walk up to its
   top-level ancestor (the "main collection"). Its Zotero collection key is
   `<collectionKey>`. Collection keys are part of the synced data, so they are
   the same on every device.
2. Use the note tagged `★outline` **and** `#flexannotate-outline-<collectionKey>`.
   If no such note exists, the collection has no tree yet. Do not fall back to
   the library tree or to another collection's tree; the organizer starts with
   an empty tree here. Report "no outline for this collection" and stop.
3. Only assign annotations whose work lies in that main collection or one of its
   subcollections (annotation, attachment, work, collection membership).
   Annotations of works without a collection have no tree and are skipped.

Consequences:

- Tags are library-wide. Two trees may contain the same title and then share the
  tag `§Title`. Limiting a run to one collection keeps the trees apart.
- A work can sit in several main collections and then belongs to several trees.
  Make `collection` a required parameter of your tools, so the caller decides
  which tree a run uses and the tool never has to guess.

### Finding and reading the outline note

Search for the tag `★outline` among notes, then keep the one that carries the
marker tag from the table above.

- Zotero JS API: `Zotero.Search` with the condition `tag` `is` `★outline`.
- Web or local API: the `tag` query parameter of the items endpoint with
  `itemType=note` (standard Zotero API; not checked against the local API
  source).

If several notes match (for example after a sync conflict), the organizer takes
the one with the latest `dateModified`; on a tie the higher item id.

The tree is in the note HTML, after the line `LATTICE-OUTLINE-V1`, inside a
`<pre><code>` block. Zotero may rewrite that block to `<pre>` when the note is
saved again, so accept both closing tags:

```js
const m = html.match(/LATTICE-OUTLINE-V1\s*([\s\S]*?)<\/(?:code|pre)>/);
const json = m[1]
  .trim()
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&"); // &amp; last
const roots = JSON.parse(json).roots;
```

If the sentinel is missing or the JSON does not parse, treat the outline as
empty. The result looks like this:

```json
{
  "v": 1,
  "roots": [
    { "id": "k3x90", "title": "Introduction", "children": [] },
    {
      "id": "k3x9a",
      "title": "Main Part",
      "children": [
        { "id": "k3x9b", "title": "Background", "children": [] },
        { "id": "k3x9c", "title": "Analysis", "children": [] }
      ]
    },
    { "id": "k3x9d", "title": "Conclusion", "children": [] }
  ]
}
```

The tag for a node is `"§" + node.title.trim()`. Titles are unique across the
whole tree (case-insensitive), never empty and contain no line break, so the
title identifies the heading. Give the model the path (`Main Part > Analysis`),
not only the title. A large tree is fine to send whole; headings are short.

### Reading annotations

Annotations are child items of an attachment (PDF, EPUB, snapshot), which is a
child of the work. For each annotation the model should get:

- `annotationText` (the quote), `annotationComment`, `annotationPageLabel`,
  `annotationType` (`highlight`, `underline`, `note`, `text`, `image`, `ink`)
  and `annotationColor`
- the work's title and creators (the parent of the attachment)
- its current tags; existing `§` tags are existing assignments
- ideally the text around it, from the attachment's full text near the
  annotation's page

Image and ink annotations have no quote. If they also have no comment, skip
them rather than letting the model guess from nothing.

On Zotero 7, item search does not return annotations (see `itemsWithTag` in
`outlineModel.ts`). Collect them from the attachments instead:
`attachment.getAnnotations()` in the JS API, or the `/children` endpoint of the
attachment. This was not checked for 8 to 10, so the same route is the safe
choice there too.

### Writing an assignment

Add the heading tag to the annotation item and save it. Remove the tag to undo.
This is what the organizer does (`fileMany` and `unfileMany` in
`organizerData.ts`): it skips items that already carry the tag and items that
are not editable, such as annotations of other users in a group library.

Rules the tool should enforce:

- Use only titles of the tree that belongs to the annotation's main collection.
- Use only titles that exist in that tree. A `§` tag that is not in the tree is
  not a heading; the organizer shows it as an orphan.
- Do not create, rename or delete headings through tags. Tree changes belong to
  the user, in the organizer.
- Leave other tags alone, in particular `#flexannotate-*` tags.
- Add `§` tags freely, but remove them only through an explicit unassign request
  from the user.
- Do not rename or delete annotations.

## Suggested tools (names are free)

| Tool                   | Input                                                                     | Output                                                                 |
| ---------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `outline_get`          | `collection`                                                              | List of `{ title, path, depth }` from that collection's tree           |
| `annotations_list`     | `collection`; `unassignedOnly` (no tag that matches a title of this tree) | Annotations with text, comment, page, type, color, work, `§` tags, key |
| `annotation_context`   | annotation key, `radius` pages                                            | Full text around the annotation                                        |
| `annotations_assign`   | `collection`, `assignments: [{ key, headings }]`, `dryRun`                | `{ assigned, skipped, unknownHeadings }`                               |
| `annotations_unassign` | `collection`, `assignments: [{ key, headings }]`                          | The tags that were removed                                             |

A minimal version needs only `outline_get`, `annotations_list` and
`annotations_assign`. If your tool only offers generic tag tools ("add tag to
item"), the same result works: read the note yourself and add the `§Title` tags
to the annotation items.

Example call and result of `annotations_assign`:

```json
{
  "collection": "ABCD1234",
  "assignments": [
    { "key": "XYZ98765", "headings": ["Analysis", "Conclusion"] },
    { "key": "QWE45678", "headings": [] }
  ],
  "dryRun": false
}
```

```json
{
  "assigned": [{ "key": "XYZ98765", "added": ["§Analysis", "§Conclusion"] }],
  "skipped": [{ "key": "QWE45678", "reason": "no heading" }],
  "unknownHeadings": []
}
```

Per entry the tool:

1. Resolves the collection's tree.
2. Checks that the annotation's work lies in that collection and that the
   annotation is editable; skips it otherwise.
3. Maps every title to `"§" + title.trim()` and reports titles that are not in
   the tree under `unknownHeadings`.
4. Adds the tags the annotation does not yet carry and saves, ideally the whole
   batch in one transaction.

### Writing from inside and outside Zotero

Inside Zotero (a plugin), as the organizer does it:

```js
const item = Zotero.Items.getByLibraryAndKey(libraryID, annotationKey);
item.addTag("§Analysis"); // once per heading
await item.saveTx();
```

From outside Zotero:

- Zotero 10 (checked in 10.0.5): the local API accepts `PATCH` on
  `/api/users/0/items/<annotationKey>` (groups: `/api/groups/<groupID>/items/...`).
  Requirements:
  - The user must enable the local API (preference
    `extensions.zotero.httpServer.localAPI.enabled`, off by default). Otherwise
    every request returns 403 "Local API is not enabled". The port is
    `extensions.zotero.httpServer.port` (23119 by default).
  - Writes need the header `Zotero-Server-ID`, otherwise they return 428. Every
    response carries this header, so read it from a first `GET /api/` and send
    it back.
  - Writes need a local API key in the `Zotero-API-Key` header. Get one with
    `POST /api/local/authorize` and the body `{ "appName": "<your tool>" }`
    (also with `Zotero-Server-ID`); Zotero then asks the user to allow or deny.
    The answer "Allow" gives a single-use key that the first write consumes;
    "Always Allow" gives a key you can keep. A tool that writes many
    annotations should send them in one `POST` to `/api/users/0/items` (an
    array of objects with `key` and `version`, as in the web API; the endpoint
    exists, the update semantics were not tested), or ask the user for
    "Always Allow".
  - Send the item JSON with the complete `tags` array (existing tags plus the
    new `§` tags) and optionally `version`; a stale version returns 412.
- Zotero 7 to 9 (checked in 7.0.32, 8.0.4, 9.0.6): the local API has no write
  methods. Use the zotero.org web API with a normal API key (the change reaches
  the desktop client through sync) or run code inside Zotero.

## Suggested workflow and prompt

1. The user names a collection. Call `outline_get` and give the model the whole
   tree with paths.
2. Call `annotations_list` for that collection with `unassignedOnly: true`, in
   batches of about 20 to 50. A later run then only handles new annotations.
3. For unclear quotes call `annotation_context`.
4. The model returns, per annotation, one or more headings or none. One heading
   should be the normal case; several only when the quote supports each.
5. Show the plan with `dryRun: true`, then call `annotations_assign`.

Prompt sketch:

> You assign reading annotations to the headings of an outline. For each
> annotation choose the heading whose meaning the quote fits best, judging by
> the quote, the comment and the surrounding text. Use more than one heading
> only if the quote really supports each. If several headings fit, choose the
> best one. If nothing fits, return no heading rather than guessing. Use only
> headings from the list, spelled exactly. Return JSON:
> `[{ "key": "...", "headings": ["..."], "reason": "one short sentence" }]`.

Ask for the `reason`; it speeds up review.

## Caveats

- The `LATTICE-OUTLINE-V1` format is internal to FlexAnnotate and Lattice. Read
  it, do not write it.
- Match heading titles as exact strings.
- Not tested with a specific MCP server or plugin. This page describes the data
  and the Zotero interfaces, not an integration that was run end to end.

## Verified against

- FlexAnnotate: `src/features/organizer/logic/outline.ts`, `outlineModel.ts`,
  `logic/collections.ts`, `panel/organizerData.ts`, `panel/organizerState.ts`,
  `panel/organizerFiling.ts`.
- Zotero 10.0.5: `xpcom/server/server_localAPI.js` (authorization, write
  methods, version check), `xpcom/data/dataObjects.js` (`getByLibraryAndKey`),
  `xpcom/data/item.js` (annotation fields), `elements/zoteroSearch.js`
  (annotation types).
- Zotero 7.0.32, 8.0.4, 9.0.6: `server_localAPI.js` has no `PATCH`.
- Not checked: the zotero.org web API write format and the `tag` parameter of
  the local API.
