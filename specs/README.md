# Specs

One folder per feature: `specs/<feature-name>/spec.md`. Add design notes,
diagrams, or other supporting docs alongside `spec.md` in the same folder
as a feature grows.

## Index

- [family-tree-view](family-tree-view/spec.md) — simple React app showing a family tree with D3.js, collapsible nodes
- [marriages_data](marriages_data/spec.md) — spouses as separate cards joined by a marriage node (data shape superseded by people-and-relationships)
- [ancestors](ancestors/spec.md) — spouses (and the root) can show their own ancestry above their card
- [people-and-relationships](people-and-relationships/spec.md) — normalized `people`/`marriages`/`parentage` store, replacing the nested tree literal
