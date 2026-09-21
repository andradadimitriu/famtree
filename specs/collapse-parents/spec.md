# famtree — Spec

## Summary

Every person card that has a parent — not just spouses and the root, per
[ancestors](../ancestors/spec.md) — gets a small `+`/`–` toggle that
collapses (hides) that person's parent generation and everything above it.
This generalizes the ancestors toggle: instead of applying only where a
parent pair isn't already on screen, it now applies wherever a parent
exists at all, with the toggle's behavior adapting to whether that parent
is already visible or not.

Collapsing is a *focus* operation, not just a hide-the-row-above one, and
it's recursive: it collapses away the rest of that parent's family — every
sibling of the person who clicked, and everything under each of those
siblings — and then repeats the same thing one generation up, and the one
above that, all the way to the root, hiding every ancestor along the way
exactly as a single-level collapse already did. The result is that only
one line of the tree stays visible: the person who clicked, plus their
own descendants. Every ancestor above them, and every aunt/uncle, cousin,
and unrelated branch off of that ancestor line at *any* generation, is
gone — not just the clicked person's own siblings. See **Rendering**.

## Goals

1. Any person with a resolvable `parentMarriageByChild` entry gets the
   toggle above their card — spouses and the root (already covered by
   [ancestors](../ancestors/spec.md)), *and* ordinary tree members reached
   by the downward walk from the current root, whose parents already
   render as the real row above them via `d3.hierarchy`.
2. For a person whose parents are **not** currently rendered (the existing
   ancestors case: spouses, or anyone whose parents were already
   collapsed), the toggle keeps doing exactly what [ancestors](../ancestors/spec.md)
   specifies — expand a local, recursively-fetched ancestor stack.
3. For a person whose parents **are** currently rendered as the real
   `d3.hierarchy` row above them, the toggle does the new thing this spec
   adds: hide that row, plus every ancestor further up, **and** — at
   *every* generation between this person and the root, not just their
   own — collapse away every branch that isn't on the direct line down to
   this person, while leaving the person's own card and their own
   descendants exactly where they are. See **Rendering** for why siblings
   (and aunts/uncles, and cousins) collapse along with the parent rather
   than staying put.
4. Both cases use one consistent affordance and default state, so from the
   user's point of view there's a single rule: *has a parent → has a
   toggle above the card*, regardless of which code path renders that
   parent underneath.

## Relationship to the ancestors spec

[ancestors](../ancestors/spec.md) and
[people-and-relationships](../people-and-relationships/spec.md) both
carve out an explicit exception: an ordinary tree child does *not* get a
toggle, because their parent already renders as the real row above them,
and adding another toggle would either be redundant or (per the ancestors
spec) render the same couple twice.

That exception was about *expanding* — there was nothing useful to expand
when the parent's already shown. This spec doesn't reopen that: it adds
the other half, a way to *collapse* a parent row that's already showing.
The two specs together now cover the full toggle:

| Parents currently visible? | Toggle action                              | Spec                          |
| --------------------------- | ------------------------------------------- | ----------------------------- |
| No                           | Expand (fetch + render ancestor stack)      | [ancestors](../ancestors/spec.md) |
| Yes                          | Collapse (hide the row and everything above)| this spec                      |

A person only ever has one toggle above their card at a time — which
branch of the table applies is derived from state, not chosen by the user.

## Default state

Ordinary tree parents start **expanded** (unchanged from today — this
spec doesn't hide anything by default, it just makes hiding possible).
Spouse/root ancestor stacks keep defaulting to **collapsed**, per
[ancestors](../ancestors/spec.md). Collapsing is purely opt-in either way.

## Rendering

- The toggle sits inside the card, in a reserved strip above the name
  (`node__toggle`/`node__toggle--inline`) — not floating outside the
  card's border. This is a shared treatment: the
  [ancestors](../ancestors/spec.md) toggle (spouses/root) was updated to
  match, so every such toggle in the tree now occupies real space inside
  its card rather than being positioned on top of existing content.
- Collapsing on person P hides, going up generation by generation from P
  to the root:
  - P's parent generation's card(s) and marriage connector, and the link
    from P into that row.
  - **Every one of P's siblings** — every other child of that same
    parent — along with each sibling's own spouses and descendants.
  - Then the same thing one level up: P's parent's own parent generation,
    and every one of *P's parent's* siblings (P's aunts/uncles) with all
    of *their* descendants (P's cousins).
  - This repeats all the way to the root — great-aunts/uncles, second
    cousins, whatever branches exist — so the entire tree collapses down
    to nothing but P and P's own descendants. There's no depth limit: the
    recursion always runs to the root, not just one or two generations up.
- Collapsing does **not** hide or move P's own card, P's own spouses, or
  P's own descendants — that whole line stays exactly where it was.
- Every branch off the direct line collapses along with the ancestor it
  hangs off of, rather than staying visible with no parent above it,
  because a parent row is shared by every child of that marriage: there's
  no such thing as "the parent is hidden for one child but shown for
  another." Once a given ancestor's row is gone, the choice at that level
  is either every one of their children loses it (equivalent to the
  existing below-card marriage toggle — see **Data model**) or exactly
  one keeps its line and the rest fold away. This spec takes the second
  option at *every* level on the way up, so the toggle is genuinely
  useful for focusing on one branch while browsing, rather than just
  duplicating the below-card toggle from a different spot.
- Because every other branch is hidden entirely, so are all of their
  above-card toggles — the *only* control left for this collapsed state
  is the toggle on the person who triggered it, now showing `+`. Clicking
  it again walks back down the same chain, restoring every generation and
  every branch exactly as it was before collapsing (no state is lost).
- Only one line can be "focused" at a time from a given ancestor down,
  precisely because focusing hides every other branch's toggles along
  with the branches themselves — there's nothing left to click to focus
  on a different branch without first re-expanding. See **Out of scope**.

## Layout

Collapsing a parent row is a rendering-only change, the same way the
[ancestors](../ancestors/spec.md) stack and spouse cards are rendering-only
additions on top of `d3.tree()`'s layout: the underlying hierarchy and its
computed positions are untouched, so the person's own card and everything
below it stay exactly where they were before or after collapsing. The
space the hidden parent row used to occupy is simply left blank, rather
than triggering a re-layout that would shift sibling/cousin columns
sideways to reclaim it. This is the same simplification already accepted
in [ancestors](../ancestors/spec.md)'s "Layout — known limitation" section,
applied in the opposite direction.

## Data model

- **Ancestors case (unchanged):** toggling flips a `parents`/`_parents`
  pair fetched via `parentMarriageByChild`, as
  [ancestors](../ancestors/spec.md) already specifies.
- **Real-row case (new):** this is a different operation from the existing
  `children`/`_children` collapse on a marriage, which hides *every*
  child with no exception — here, one specific child (whichever the user
  clicked) stays. So a plain boolean flag on the parent isn't enough; the
  parent needs to remember *which* child to keep. The built tree nodes
  (`familyGraph.js`) don't carry a stable id — only `name`/`born`/
  `marriages`/`parents` — so this can't be a childId string the way
  `parentMarriageByChild` is keyed. Instead, store a direct reference to
  the focused child's own data object, e.g. `_focusedChild` set on the
  parent person's data object (the same object every one of their
  marriages/children reference), written by the child's above-card click,
  read at render time off the parent. Reference equality (`===`) is
  enough to tell the focused child apart from its siblings, the same way
  the rest of this component already compares mutated plain objects
  rather than ids.
- Because this recurses to the root (see **Rendering**), one `_focusedChild`
  isn't enough either — it has to be set at *every* generation between P
  and the root, each one pointing to whichever of its own children leads
  back down to P. Toggling on: walk up from P through every ancestor,
  and at each step set that ancestor's own parent's `_focusedChild` to
  that ancestor (i.e. "the child that leads to P"), stopping at the root.
  Toggling off (clicking the same, now-`+`, toggle again): walk the exact
  same chain clearing each one, so the whole thing is restored in one
  click. Since only P's own toggle is ever reachable while collapsed
  (everything else is hidden — see **Rendering**), there's no path to
  *changing* the focused line without first clearing it from P.
- This state only ever affects rendering (see **Layout**): `d3.hierarchy`
  and `d3.tree()` still walk and position the full data as if nothing were
  collapsed. At render time, for any node N:
  - N is skipped if it carries `_focusedChild` itself (i.e. it's a
    collapsed ancestor somewhere on the chain), **or** if it's a strict
    ancestor of a node that does — this hides the whole chain from the
    topmost collapsed ancestor up to the root.
  - N is *also* skipped if any of its own ancestors has `_focusedChild`
    set to something other than the (data object of the) child on the
    path down to N — this is what hides every off-line branch, at every
    generation, while leaving P's own path untouched. Because the flag is
    set at every level (not just the one nearest P), this check alone
    prunes aunts/uncles and cousins the same way it prunes siblings — no
    separate recursion is needed at render time, only when the toggle
    itself is set or cleared.

## Out of scope

- Re-laying-out the tree to reclaim blank space left by a collapsed row
  (see **Layout** above).
- Focusing on more than one line of the tree at a time (see
  **Rendering**/**Data model**) — since collapsing recurses to the root,
  at most one person tree-wide can be focused at once; a different branch
  can only be focused after re-expanding the first, since focusing hides
  every other branch's toggles along with the branches themselves.
- Any way to re-expand a collapsed group other than the focused child's
  own toggle — e.g. there's no "show everything" control elsewhere on the
  tree. If the user navigates away from that one visible line, the only
  way back is re-collapsing/expanding from it.
- Changing anything about how spouse/root ancestor stacks themselves
  render once expanded — that's still fully specified by
  [ancestors](../ancestors/spec.md).
