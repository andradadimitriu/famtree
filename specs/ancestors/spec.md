# famtree — Spec

## Summary

Let people with no incoming blood link in the visible tree — spouses (e.g.
David Hayes) and, in principle, the root — show their own ancestry above
their card.

Data-model note: this spec originally proposed a `parents` field on the
person shape. That's superseded by
[people-and-relationships](../people-and-relationships/spec.md): parents
are now just the other side of the same `parentage` relationship that
already produces children, looked up via
`parentMarriageByChild`/`marriages` rather than stored as a dedicated
field. Everything below about *rendering* still applies; only the data
source changed.

## Goals

1. Add David Hayes's parents to the sample data, plus one or two more
   spouses (one of them with only one known parent), to exercise the
   feature.
2. The ancestors lookup works for any person id, not just spouses — but
   see **Where ancestors actually show up** for why that in practice means
   spouses (and, later, the root) rather than ordinary children.
3. Parents resolve to full person records, and a parent can themselves
   have a `parentMarriageByChild` entry (grandparents-in-law), so the
   ancestor chain can recurse upward as far as `parentage` data goes.

## Data model

See [people-and-relationships](../people-and-relationships/spec.md) for
the full shape. In short: `parentage` records connect a `marriage` (the
two parents) to a `childId`. Given any person id, their parents pair is:

```js
const marriageId = parentMarriageByChild[personId]
const parents = marriageId ? marriages.find((m) => m.id === marriageId).spouses : []
```

Recursing on each parent's own id gives grandparents-in-law. As with the
downward tree, a parent's own *other* marriage (a remarriage that would
produce half-siblings-in-law) is representable in the data but not
rendered in this iteration — out of scope for now.

### Where ancestors actually show up

The lookup works for anyone, but it's only *useful* to surface for a
person who has no parent already visible in the tree:

- **Spouses** — a spouse isn't reached by the downward walk from the root
  at all, so this toggle is how their ancestry gets attached. This is the
  main use case and what the sample data additions cover.
- **The root person** — also isn't anyone's child in the current view, so
  this would let the tree extend upward beyond today's top (Eleanor
  Whitfield). The rendering supports this, but no sample data is added for
  it in this pass.
- **Ordinary children** (anyone reached via `childrenByMarriage` while
  walking down from the root) already have their parent shown as the real
  row above them. Don't show the ancestors toggle for these — it would
  render the same couple twice, once as the actual row above and once as
  a redundant toggle.

## Rendering

- A person whose id has a `parentMarriageByChild` entry gets a small
  `+`/`–` toggle **above** their card, mirroring the existing below-card
  children toggle
  (`node__toggle`, same circle-plus-glyph style) — but centered above the
  card instead of below the union connector.
- Collapsed is the default (consistent with `collapseBelowDepth`, which
  already opens the tree partially collapsed rather than dumping every
  generation at once). Clicking the toggle expands/collapses just that
  person's parents, independent of any children toggle on the same card
  or any sibling's parents toggle.
- Expanded, the 1–2 parent cards render directly above the owning card,
  joined to each other by the same marriage-dot connector style used
  between spouses (`node__marriage` circle + `node__marriage-line`) when
  there are two, with a single line dropping from that connector down to
  the owning card. One known parent renders as a single card with no
  connector, centered above.
- Parent cards get their own visual treatment — a new `node__person
  --ancestor` modifier — rather than reusing the dashed
  `node__person--spouse` style. "Spouse" dashing means "married in, not
  blood"; a spouse's parents are that spouse's own blood line, so
  borrowing the in-law styling would send the wrong signal. (Exact
  look — e.g. a muted/solid variant — is an implementation detail, not
  fixed by this spec.)
- If an expanded parent's own id also resolves via `parentMarriageByChild`
  (grandparents-in-law), that pair renders the same way, one more
  card-height up, with its own independent toggle.

## Layout — known limitation

The existing layout is computed entirely by `d3.tree()`, which sizes and
separates nodes by depth going **down** from the root; `personHalfWidth`
already extends a node's footprint sideways for spouses. Parent cards
introduce a **new upward direction** that `d3.tree()` has no concept of:

- Parent cards are positioned as a fixed local offset above their owning
  card (own x, `y - NODE_HEIGHT`-ish), not as part of the `d3.hierarchy`
  layout — same spirit as how spouse cards already sit at a computed
  offset from the person rather than being separate hierarchy nodes.
- Because `d3.tree()`'s `separation()` doesn't know these cards exist, an
  expanded parents pair can visually overlap a neighboring node in the row
  above (e.g. a cousin's row) in a wide or deep tree. Accepted as a
  simplification for this sample app, same as the existing "3+ marriages
  crowd on one side" note in [marriages_data](../marriages_data/spec.md)
  — not solved in this iteration.

## Sample data changes

- David Hayes (spouse of Margaret Hayes) gets two parents.
- One or two more spouses get parents added as well, to show the feature
  in more than one spot — including one case with only a single known
  parent (the other presumably unknown/unrecorded).
