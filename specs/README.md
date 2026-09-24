# Specs

One folder per feature: `specs/<feature-name>/spec.md`. Add design notes,
diagrams, or other supporting docs alongside `spec.md` in the same folder
as a feature grows.

## Index

- [family-tree-view](family-tree-view/spec.md) — simple React app showing a family tree with D3.js, collapsible nodes
- [marriages_data](marriages_data/spec.md) — spouses as separate cards joined by a marriage node (data shape superseded by people-and-relationships)
- [ancestors](ancestors/spec.md) — spouses (and the root) can show their own ancestry above their card
- [people-and-relationships](people-and-relationships/spec.md) — normalized `people`/`marriages`/`parentage` store, replacing the nested tree literal
- [collapse-parents](collapse-parents/spec.md) — every node with a parent gets a toggle to collapse that parent generation, not just spouses/root
- [persistence](persistence/spec.md) — move from the static `familyData.js` module to a local SQLite database (Drizzle) behind Next.js, plus file storage for scanned photos
- [person-details](person-details/spec.md) — clickable name opens a slide-in panel with an editable Markdown bio and a photo gallery, including inline image upload into the Markdown
