# Assigning annotations to outline headings

FlexAnnotate contains no AI. This page describes how a tool, such as an MCP
server or a Zotero plugin that connects a language model, assigns annotations
to the headings of the organizer outline.

## Requirements

- **Zotero 10 or later to write.** Zotero 10 adds write methods to the local
  API ([changelog 10.0](http://www.zotero.org/support/changelog): "Local API
  write support"). Without write access a tool can list and suggest, but not
  assign.
- **Zotero 8 or later to read annotations** through the local API. On 7.x the
  annotation queries below return no items, and there is no fulltext route.
- The user enables the local API with `extensions.zotero.httpServer.localAPI.enabled`
  (off by default). The default port is `extensions.zotero.httpServer.port` (23119).

## Data model

| Thing            | Representation                                     |
| ---------------- | -------------------------------------------------- |
| Heading          | A tag `§` + title (trimmed), e.g. `§Introduction`. |
| Assignment       | The annotation item carries the heading tag.       |
| Several headings | The annotation carries several `§` tags.           |
| Outline tree     | JSON in a standalone note tagged `★outline`.       |

The tree stores hierarchy and order. Assigning never changes the note. Numbers
such as `1.2.3` are computed for display and are not stored.

Every heading's `§`-tag is also anchored on the `★outline` note itself
(`OutlineModel.save()` → `syncAnchorTags`; `load()` runs the same sync, so
existing notes get their `§`-tags backfilled on open). That way the tag exists
in the library and Zotero's PDF-reader tag box suggests it when you type `§` —
even before any item is filed. You therefore never need to create a heading tag
yourself; assign it to an item and it already exists. The note never counts as
a filed item for `gather`/`buildCountMap`.

The note's `<h1>` heading carries the scope — the library name for the
library-wide tree or the name of the main collection — so several outline notes
are distinguishable in the item list (Zotero derives a note's list title from
its first line). It is localized (`de`/`en`). This heading is **irrelevant for
reading the tree**: `parseOutline` only looks for `LATTICE-OUTLINE-V1` + JSON,
never at the `<h1>`, so the scope name does not affect the external API,
Confucius or any other consumer.

## Choosing the outline tree

A library can hold several outlines. Each is a note tagged `★outline`:

| Outline         | Marker on the note                                | Covers                                        |
| --------------- | ------------------------------------------------- | --------------------------------------------- |
| Library tree    | no `#flexannotate-outline-<key>` tag              | works without a collection                    |
| Collection tree | extra tag `#flexannotate-outline-<collectionKey>` | a top-level collection and its subcollections |

1. Take the collection the user names. If it is a subcollection, walk up to its
   top-level ancestor (the main collection). Use its collection key, not its name.
2. Use the note with `★outline` **and** `#flexannotate-outline-<collectionKey>`.
   If none exists, the collection has no tree. Report that and stop. Do not
   fall back to the library tree or to another collection's tree.
3. Assign only annotations whose work is in that main collection or one of its
   subcollections. Skip works without a collection.

Consequences:

- Tags are library-wide and the PDF-reader tag autocomplete is too (Zotero
  filters it only by `libraryID`, not by collection). Two trees can share a
  heading title, and then both use the tag `§Title`. Limiting a run to one
  collection keeps them apart; `§`-tags from other main collections with their
  own tree will still be offered in the tag box.
- A work can belong to several main collections, and so to several trees. Make
  `collection` required: the caller picks the tree.

## Reading the outline

Find the note by its `★outline` tag, then keep the one with the marker tag from
the table above. If several match (for example after a sync conflict), take the
latest `dateModified`, and on a tie the higher item id.

- JS API: `Zotero.Search` with the condition `tag` `is` `★outline`.
- Local API: `GET /api/users/0/items?tag=%E2%98%85outline&itemType=note`.

The tree is in the note HTML, after the line `LATTICE-OUTLINE-V1`, inside a
`<pre><code>` block. Zotero may rewrite that block to `<pre>` when it saves the
note, so accept both closing tags:

```js
const m = html.match(/LATTICE-OUTLINE-V1\s*([\s\S]*?)<\/(?:code|pre)>/);
if (!m) return []; // no outline in this note
const json = m[1]
  .trim()
  .replace(/&quot;/g, '"')
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&"); // &amp; last
const roots = JSON.parse(json).roots;
```

If the JSON does not parse, treat the outline as empty. The structure:

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

The tag of a node is `"§" + node.title.trim()`. Titles are unique across the
tree (case-insensitive), never empty, and contain no line break. Give the model
the path (`Main Part > Analysis`), not only the title.

## Reading annotations

Annotations are child items of an attachment (PDF, EPUB, snapshot), which is a
child of the work. Per annotation, pass the model:

- `annotationText`, `annotationComment`, `annotationPageLabel`,
  `annotationType` (`highlight`, `underline`, `note`, `text`, `image`, `ink`),
  `annotationColor`
- the work's title and creators
- its current tags; existing `§` tags are current assignments
- the surrounding text from the attachment's fulltext (see below)

Image and ink annotations have no quote. Skip them if they also have no comment.

Local API (Zotero 8 and later):

- `GET /api/users/0/items?itemType=annotation&limit=100&start=0`: all
  annotations. Page with `start`; the `Total-Results` header gives the count.
- `GET /api/users/0/items/<attachmentKey>/children?itemType=annotation`: the
  annotations of one attachment. Without `itemType=annotation` the list is empty.
- `GET /api/users/0/items?itemType=annotation&tag=%C2%A7Introduction`: the
  annotations with that exact heading tag. There is no wildcard.
- `GET /api/users/0/items/<attachmentKey>/fulltext`: the indexed text of the
  attachment.
- `GET /api/users/0/tags`: all tags. Filter `§` tags on the client.

The `parentItem` parameter of the items endpoint does not filter; it returns all
annotations.

JS API: `attachment.getAnnotations()`.

## Writing an assignment

Add the heading tag to the annotation and save it. Remove it to undo. The
organizer does the same (`fileMany` and `unfileMany` in `organizerData.ts`). It
skips items that already carry the tag and items that are not editable, such as
annotations of other users in a group library.

Rules for a tool:

- Use only titles of the tree of the annotation's main collection.
- Use only titles that exist in that tree. A `§` tag without a matching node
  shows as an orphan in the organizer.
- Do not create, rename or delete headings through tags. Tree changes belong to
  the user, in the organizer.
- Leave other tags alone, in particular `#flexannotate-*`.
- Remove `§` tags only on an explicit unassign request.
- Do not rename or delete annotations.

How the organizer shows an assignment: a heading lists the annotations with its
tag and, by default, those of all its subheadings (`itemsUnder` in
`logic/outline.ts`, `includeSub = true`). An annotation under a subheading also
appears under each parent. Choose the most specific heading that fits.

### Inside Zotero (plugin)

```js
const item = Zotero.Items.getByLibraryAndKey(libraryID, annotationKey);
item.addTag("§Analysis"); // once per heading
await item.saveTx();
```

### Local API (Zotero 10)

- `PATCH /api/users/0/items/<annotationKey>` with the full `tags` array (existing
  tags plus the new `§` tags). Returns 204. Groups use
  `/api/groups/<groupID>/items/...`.
- `POST /api/users/0/items` with an array of up to 50 objects, each with `key`,
  `version` and the full `tags` array. Returns 200 with the result per entry.
  More than 50 entries return 413.
- Send the item's current `version` in the body, or as the header
  `If-Unmodified-Since-Version`. A stale version returns 412.
- Writes need the header `Zotero-Server-ID`, otherwise 428. Every response
  carries it, so read it from `GET /api/` first.
- Writes need a key in the `Zotero-API-Key` header. Get one with
  `POST /api/local/authorize` and `{ "appName": "<your tool>" }`, sent with
  `Zotero-Server-ID`. The user allows or denies in a dialog. Denial returns 403.
  Rate limit: 429 with `Retry-After`.
- "Allow" gives a key for one use. The key is used up when it is checked, even if
  the write then fails. "Always Allow" gives a key that stays valid. A key that
  is not registered returns 401.
- Requests with a browser `User-Agent` (starting with `Mozilla/`) or an `Origin`
  header get no response unless they also send `Zotero-Allowed-Request: 1`.
- A write to a read-only library returns 403.

Source: `xpcom/server/server_localAPI.js` and `server/server.js` in Zotero 10.0.5.

## Tools, workflow and prompt

Suggested tools (names are free):

| Tool                   | Input                                                                    | Output                                                |
| ---------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| `outline_get`          | `collection` (key)                                                       | `{ title, path, depth }` for each node of the tree    |
| `annotations_list`     | `collection`; `unassignedOnly` (no tag that matches a title of the tree) | Text, comment, page, type, color, work, `§` tags, key |
| `annotation_context`   | annotation key                                                           | Fulltext near the annotation's quote                  |
| `annotations_assign`   | `collection`, `assignments: [{ key, headings }]`, `dryRun`               | `{ assigned, skipped, unknownHeadings }`              |
| `annotations_unassign` | `collection`, `assignments: [{ key, headings }]`                         | The tags that were removed                            |

Minimal set: `outline_get`, `annotations_list`, `annotations_assign`.

Per entry, `annotations_assign`:

1. Resolves the tree of the collection.
2. Checks that the annotation's work is in that collection and that the item is
   editable; skips it otherwise.
3. Maps each title to `"§" + title.trim()`. Unknown titles go to
   `unknownHeadings`.
4. Adds the missing tags and saves. The `version` comes from the item's `GET`
   response.

Example:

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

Workflow:

1. The user names a collection. Call `outline_get` and pass the full tree with
   paths to the model.
2. Call `annotations_list` with `unassignedOnly: true`, in batches of 20 to 50.
3. For unclear quotes, call `annotation_context`.
4. The model returns one or more headings per annotation, or none.
5. Show the plan with `dryRun: true`, then call `annotations_assign`.

Prompt:

> You assign reading annotations to the headings of an outline. For each
> annotation choose the heading whose meaning the quote fits best, judging by
> the quote, the comment and the surrounding text. Use more than one heading
> only if the quote really supports each. If several headings fit, choose the
> best one. If nothing fits, return no heading rather than guessing. Use only
> headings from the list, spelled exactly. Return JSON:
> `[{ "key": "...", "headings": ["..."], "reason": "one short sentence" }]`.

## API support by version

| Route or method                                | 7.x | 8.x | 9.x | 10.x |
| ---------------------------------------------- | --- | --- | --- | ---- |
| Annotations by exact `§` tag                   | no  | yes | yes | yes  |
| Annotations under an attachment (`children`)   | no  | yes | yes | yes  |
| Attachment fulltext (`/fulltext`)              | no  | yes | yes | yes  |
| Write: `PATCH` item, `POST` batch, auth routes | no  | no  | no  | yes  |

## Caveats

- `LATTICE-OUTLINE-V1` is an internal format of FlexAnnotate and Lattice. Read
  it. Do not write it.
- Match heading titles as exact strings.
- A tool that uses the zotero.org web API instead of the local API follows the
  web API rules. The tag format is the same.

## References

- [Zotero local API](https://www.zotero.org/support/dev/web_api/v3/local_api)
- [Zotero Web API, write requests](https://www.zotero.org/support/dev/web_api/v3/write_requests)
- [Zotero changelog](http://www.zotero.org/support/changelog) (10.0)
- Plugin source: `src/features/organizer/logic/outline.ts`, `outlineModel.ts`,
  `logic/collections.ts`, `panel/organizerData.ts`, `panel/organizerState.ts`
- Zotero 10.0.5 source: `xpcom/server/server_localAPI.js`, `server/server.js`
