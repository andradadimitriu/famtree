# famtree — Spec

## Summary

Replace the nested tree literal (`familyData.js`) with a normalized store:
a flat table of people, plus separate relationship records referencing
them by id. This replaces the shape described in
[marriages_data](../marriages_data/spec.md), and is what
[ancestors](../ancestors/spec.md) builds on instead of a `parents` field.

## Why

- **No duplicate people.** Today, a person can only exist in one place in
  the nested tree. Once spouses have their own parents (grandparents-in-law,
  possibly shared across two branches of the family), the same physical
  person may need to be reachable from more than one place. A flat table
  keyed by id, referenced everywhere by that id, means each person is
  written once no matter how many relationships point at them.
- **Future editing/persistence.** Normalized records (one row per person,
  one row per relationship) are what you'd want if this ever grows a form
  to add/edit people, or moves into a real database — much easier to CRUD
  than a deeply nested literal.
- **Clearer modeling.** "Who exists" (people) and "how they're related"
  (marriages, parentage) become two separate, much simpler concerns
  instead of one recursive nested shape doing both jobs.

## Data model

Three top-level collections:

```js
// people: id -> { id, name, born }
const people = {
  'eleanor-whitfield': { id: 'eleanor-whitfield', name: 'Eleanor Whitfield', born: 1930 },
  'henry-whitfield':   { id: 'henry-whitfield',   name: 'Henry Whitfield',   born: 1928 },
  'margaret-hayes':    { id: 'margaret-hayes',    name: 'Margaret Hayes',    born: 1952 },
  'david-hayes':       { id: 'david-hayes',       name: 'David Hayes',       born: 1950 },
  'walter-hayes':      { id: 'walter-hayes',      name: 'Walter Hayes',      born: 1922 },
  // ...
}

// marriages: an edge between 1–2 person ids (1 = other spouse unknown/unrecorded)
const marriages = [
  { id: 'eleanor-henry',  spouses: ['eleanor-whitfield', 'henry-whitfield'] },
  { id: 'margaret-david', spouses: ['margaret-hayes', 'david-hayes'] },
  { id: 'walter-unknown', spouses: ['walter-hayes'] }, // David's father, mother unrecorded
  // ...
]

// parentage: which marriage a person was born from (at most one entry per childId)
const parentage = [
  { marriageId: 'eleanor-henry',  childId: 'margaret-hayes' },
  { marriageId: 'eleanor-henry',  childId: 'robert-whitfield' },
  { marriageId: 'margaret-david', childId: 'sophie-hayes' },
  { marriageId: 'walter-unknown', childId: 'david-hayes' },
  // ...
]
```

- **id**: a slug derived from the name (e.g. `david-hayes`). Two people
  sharing a name need a disambiguated slug (e.g. `david-hayes-2`) — an
  accepted rough edge for sample data, not solved with a generator here.
- **marriages** replaces the old per-person nested `marriages: [{ spouse,
  children }]` array. A person's marriages (and their left/right/order for
  rendering) are found by filtering this array for entries whose `spouses`
  includes their id, in array order — same ordering guarantee the old
  nested array gave implicitly.
- **parentage** replaces both the old `marriage.children` array *and* the
  new `parents` field from the ancestors spec. "Children of a marriage"
  and "parents of a spouse" are the same relationship now, just walked in
  opposite directions — there's no longer a special case for ancestors.
  A person has at most one parentage record as a child (one set of
  biological parents).

## How existing + new features read this

The rendering code (`FamilyTree.jsx`) currently consumes one nested object
literal directly via `d3.hierarchy`. That stays, but gets built from the
normalized store instead of being hand-written:

- **Downward (the existing marriages/children tree)**: starting from a
  root person id, recursively resolve `marriagesByPerson[id]` → for each
  marriage, the *other* spouse plus `childrenByMarriage[marriage.id]` →
  recurse into each child id the same way. This produces the exact same
  `{ name, born, marriages: [{ spouse, children }] }` shape the component
  already walks — only the *source* of that shape changes, not how
  `childrenAccessor`/`d3.tree()` consume it.
- **Upward (ancestors feature)**: given any person id, look up
  `parentMarriageByChild[id]` → that marriage's `spouses` are the parents
  pair to render above the card. Recursing on each parent's own id gives
  grandparents-in-law. This lookup is what powers the above-card toggle
  in [ancestors](../ancestors/spec.md) — same rendering/layout rules
  described there still apply, just sourced from `parentage` instead of a
  `parents` field.
- A person only gets an ancestors toggle if `parentMarriageByChild[id]`
  exists **and** they weren't already reached going downward from the
  current root (i.e. spouses, and the root itself, per the "where parents
  gets populated" rule in the ancestors spec) — otherwise the same couple
  would render twice: once as the real row above, once as a redundant
  ancestor toggle.

## Sample data migration

`familyData.js` is rewritten as `people` / `marriages` / `parentage`
covering the same family as today, plus the ancestor data from the
ancestors spec (David Hayes's parents, etc.). The rendering component
builds its working tree from these three collections rooted at Eleanor
Whitfield, so the on-screen result is unchanged except for the new
ancestor toggles.
