# famtree — Spec

## Summary

Replace the raw-Markdown `<textarea>` used for editing a person's bio
(added in [person-details](../person-details/spec.md)) with
[MDXEditor](https://github.com/mdx-editor/editor), a WYSIWYG rich-text
editor for Markdown. Typing bold text, a heading, or a list now looks
formatted immediately, instead of showing `**`/`#`/`-` characters that
only render after Save. What's stored doesn't change — `people.bio` is
still a plain Markdown string, read and written exactly as before.

## Why

[person-details](../person-details/spec.md)'s bio editor is a bare
`<textarea>` holding raw Markdown source — functional, but it asks the
user to know Markdown syntax and never shows formatted output while
typing, only afterward in the separate read-only `react-markdown` view.
MDXEditor closes that gap by rendering formatted text live, in the editor
itself.

## Scope

- **Edit mode only.** The read-only view (`react-markdown`, the pencil
  icon to enter edit mode, Save/Cancel behavior) is unchanged — see
  [person-details](../person-details/spec.md).
- MDXEditor's built-in image plugin replaces the hand-rolled
  cursor-splicing insert-image logic from person-details — see **Image
  uploads**.
- No schema/DB/Server Action changes: `people.bio` stays a Markdown
  string; `updatePersonBio` still receives and writes a plain Markdown
  string, unaware of which editor produced it.

## Editor

- New dependency: `@mdxeditor/editor` (MIT licensed).
- Configured plugins: headings, lists, bold/italic, link, image — enough
  for a personal bio, not a general-purpose document editor. Table/
  code-block/embed plugins are not enabled (see **Out of scope**).
- Replaces the `<textarea ref={textareaRef} ...>` in `PersonPanel.jsx`'s
  edit-mode branch with an `<MDXEditor ref={editorRef} markdown={details.bio}
  plugins={[...]} />`.
- **Reading the edited value at save time.** MDXEditor manages its own
  internal editing state — it isn't a plain controlled input the way
  `<textarea>` is. The current Markdown is pulled out imperatively via its
  ref API, `editorRef.current.getMarkdown()`, mirroring how `handleSaveBio`
  today reads `textareaRef.current.value`. This is the one code-level
  change to `handleSaveBio` itself.

## Image uploads

MDXEditor's image plugin takes an `imageUploadHandler(file) =>
Promise<string>` callback: when the user inserts an image — via its own
toolbar button, paste, or drag-and-drop — MDXEditor calls this handler and
inserts the returned URL as a real image node in the document. This
directly replaces `handleInsertImageFile`'s manual cursor-splicing code
from [person-details](../person-details/spec.md):

- The handler still calls the same `uploadPersonPhoto` Server Action
  (unchanged) and returns `result.photo.url`.
- An image inserted this way is still an ordinary `photos` row and still
  also appears in the gallery — same "two entry points into one upload"
  behavior as before, just reached through MDXEditor's own UI (toolbar
  button, paste, drag-and-drop) instead of a bespoke icon + hidden file
  input. Paste/drag-and-drop is new — the hand-rolled version only
  supported the explicit icon button.
- The same accepted rough edge from person-details still applies:
  deleting a photo from the gallery that's referenced inline in the bio
  leaves a broken image in the rendered Markdown.

## Styling

MDXEditor ships its own stylesheet (`@mdxeditor/editor/style.css`),
imported alongside `PersonPanel.css`. The toolbar/editor chrome gets light
overrides in `PersonPanel.css` to match the app's existing palette (the
`#6c8ebf` / `#1f2933` / `#616e7c` colors already used throughout
`FamilyTree.css`) rather than MDXEditor's own default theme.

## Out of scope

- Any change to the read-only rendered view, the photo gallery, delete,
  or the separate gallery upload form — all unchanged from
  [person-details](../person-details/spec.md).
- Tables, code blocks, embeds, or other advanced Markdown features beyond
  headings/bold/italic/lists/links/images.
- Collaborative or multi-cursor editing.
- Any schema or Server Action change — this is purely a client-side
  editing UI swap.
