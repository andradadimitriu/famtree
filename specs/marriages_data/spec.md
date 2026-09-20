# famtree — Spec

> **Superseded data model.** The nested `marriages`/`children` shape below
> describes the concept (a marriage as its own node, children belonging to
> a specific marriage) but the concrete storage shape was later replaced
> by a normalized `people`/`marriages`/`parentage` store — see
> [people-and-relationships](../people-and-relationships/spec.md). The
> **Rendering** and **Layout / spacing** sections below still describe the
> current UI.

## Summary
add marriages to the data

## Goals

1. have also married people in the data
2. the nodes should be completly separate , and have a node between them to represent the marriage from which children are born

## Data model

A person can optionally have `marriages`, an array (so a person can have
more than one marriage — e.g. after a divorce or widowhood):

```js
{
  name: 'Robert Whitfield',
  born: 1955,
  marriages: [
    { spouse: { name: 'Susan Whitfield', born: 1957 }, children: [ /* ... */ ] },
    { spouse: { name: 'Diane Whitfield', born: 1962 }, children: [ /* ... */ ] },
  ],
}
```

- Each entry is `{ spouse: { name, born }, children }`. `children` are the
  children of that specific marriage — with more than one marriage, they
  are half-siblings.
- `spouse` is just `{ name, born }` — it never has `children` of its own.
- A person without `marriages` renders and behaves exactly as before
  (unmarried leaf, or a single parent if it still has a bare `children`
  array — not used in the sample data, but not disallowed).

## Rendering

- Each marriage renders as **two separate cards** (person + spouse) joined
  by a small marriage node (a dot on the connecting line) — never merged
  into one box. The spouse's card is styled with a dashed border to
  distinguish "married in" from blood relatives.
- Children links drop from their own marriage's connector, not from the
  person's card directly — so children from different marriages
  (half-siblings) visually trace back to the correct spouse.
- With multiple marriages, spouses alternate sides of the person (1st to
  the right, 2nd to the left, 3rd further right, ...) so the common case —
  one earlier and one later marriage — never crosses lines. 3+ marriages
  on the same side will visually crowd; accepted as a simplification for
  this sample app.
- Collapse state lives **per marriage**, not per person: clicking a
  marriage's connector expands/collapses only that marriage's children.
  A person with two marriages has two independent toggles, each covering
  only its own half-siblings — collapsing one never touches the other.

## Layout / spacing

- Each marriage needs roughly one extra card-width of horizontal room
  beyond the person's own card; a node's total half-width is computed from
  the outermost spouse it has (`personHalfWidth` in `FamilyTree.jsx`).
- Sibling/cousin spacing is computed from each node's actual half-width
  plus a fixed gap (`SIBLING_GAP` / `COUSIN_GAP`), not a flat multiplier —
  a flat multiplier was tried first and produced zero gap between two
  adjacent married nodes (e.g. Marcus Cook and Daniel Hayes ended up
  edge-to-edge before this fix).
