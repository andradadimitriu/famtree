import { useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { people, marriages as marriageData, parentage, rootId } from '../data/familyData'
import { buildFamilyTree } from '../data/familyGraph'
import './FamilyTree.css'

const NODE_WIDTH = 190
const NODE_HEIGHT = 110
const CARD_WIDTH = 150
const CARD_HEIGHT = 56

// Married nodes render extra cards (one per spouse) joined to the person
// by a marriage node, so they need more horizontal room than a single card.
const MARRIAGE_GAP = 46
const STEP = CARD_WIDTH + MARRIAGE_GAP

// Multiple marriages alternate sides of the person (1st to the right, 2nd
// to the left, 3rd further right, ...) so a common remarriage (one spouse
// each side) never crosses lines. 3+ marriages on the same side will
// visually crowd — an acceptable simplification for this sample app.
const unionSide = (i) => (i % 2 === 0 ? 1 : -1)
const unionRank = (i) => Math.floor(i / 2) + 1
const spouseCenterX = (i) => unionSide(i) * unionRank(i) * STEP
const connectorX = (i) =>
  spouseCenterX(i) - unionSide(i) * (CARD_WIDTH / 2 + MARRIAGE_GAP / 2)

// Minimum breathing room between the edges of two adjacent nodes' cards,
// matching what unmarried siblings/cousins got before marriages existed.
const SIBLING_GAP = NODE_WIDTH - CARD_WIDTH
const COUSIN_GAP = NODE_WIDTH * 2 - CARD_WIDTH

function personHalfWidth(marriages) {
  const half = CARD_WIDTH / 2
  if (!marriages) return half
  return marriages.reduce(
    (max, _, i) => Math.max(max, Math.abs(spouseCenterX(i)) + half),
    half,
  )
}

const halfWidth = (d) => personHalfWidth(d.data.marriages)

// How many *expanded* ancestor generations sit above a person (0 if
// collapsed/absent). Ancestor stacks aren't part of the d3.hierarchy
// layout, so nothing else accounts for the vertical room they need —
// without this, a deep enough expansion renders above the SVG's
// viewBox and is invisible rather than merely crowded.
function ancestorDepth(person) {
  if (!person.parents) return 0
  return 1 + Math.max(...person.parents.map(ancestorDepth))
}

// Collapse state lives per marriage (`marriage.children` vs
// `marriage._children`, d3's convention), not on the person — so
// expanding/collapsing one marriage never touches another. This is the
// `d3.hierarchy` children accessor: it flattens whichever marriages are
// currently expanded into one list, tagging each child with the index of
// the marriage it came from so links can be drawn from that marriage's own
// connector rather than the person's card.
function childrenAccessor(node) {
  if (!node.marriages) return node.children
  const order = node.marriages
    .map((_, i) => i)
    .sort((a, b) => connectorX(a) - connectorX(b))
  const flatChildren = order.flatMap((i) => {
    const kids = node.marriages[i].children
    if (!kids) return []
    kids.forEach((child) => {
      child.__unionIndex = i
    })
    return kids
  })
  return flatChildren.length > 0 ? flatChildren : undefined
}

// Mutates `node`, moving each marriage's `children` into `_children` for
// every marriage at or past `maxDepth`, so the tree opens partially
// collapsed instead of dumping every generation on screen at once.
function collapseBelowDepth(node, maxDepth, depth = 0) {
  node.marriages?.forEach((marriage) => {
    if (!marriage.children) return
    if (depth >= maxDepth) {
      marriage._children = marriage.children
      marriage.children = undefined
    }
    ;(marriage.children ?? marriage._children ?? []).forEach((child) =>
      collapseBelowDepth(child, maxDepth, depth + 1),
    )
  })
}

function PersonCard({ person, x, y = 0, isSpouse, isAncestor }) {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      className={`node__person${isSpouse ? ' node__person--spouse' : ''}${isAncestor ? ' node__person--ancestor' : ''}`}
    >
      <rect
        className="node__card"
        x={-CARD_WIDTH / 2}
        y={-CARD_HEIGHT / 2}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        rx={8}
      />
      <text className="node__name" y={-6} textAnchor="middle">
        {person.name}
      </text>
      {person.born && (
        <text className="node__meta" y={14} textAnchor="middle">
          b. {person.born}
        </text>
      )}
    </g>
  )
}

// Renders a person's parents as a small pair above their card, joined by
// the same marriage-dot connector style used for spouses, recursing
// upward for grandparents-in-law. This is *not* part of the d3.hierarchy
// layout `FamilyNode` sits in — it's a fixed local offset above whichever
// card it's attached to, so (per specs/ancestors/spec.md) it can visually
// overlap a neighboring node in a wide/deep tree. Accepted for now.
function AncestorStack({ person, x, y, onToggle }) {
  const hasAncestors = Boolean(person.parents || person._parents)
  if (!hasAncestors) return null

  const isCollapsed = Boolean(person._parents)
  const toggleY = y - CARD_HEIGHT / 2 - 14

  return (
    <g className="node__ancestors">
      <g
        className="node__toggle node__toggle--interactive"
        transform={`translate(${x}, ${toggleY})`}
        onClick={() => onToggle(person)}
      >
        <circle r={9} />
        <text textAnchor="middle" dy={4}>
          {isCollapsed ? '+' : '–'}
        </text>
      </g>
      {!isCollapsed &&
        (() => {
          const parents = person.parents
          const parentY = y - NODE_HEIGHT
          const positions =
            parents.length === 2 ? [x - STEP / 2, x + STEP / 2] : [x]

          return (
            <>
              <line
                className="node__marriage-line"
                x1={x}
                x2={x}
                y1={parentY}
                y2={toggleY}
              />
              {parents.length === 2 && (
                <>
                  <line
                    className="node__marriage-line"
                    x1={positions[0] + CARD_WIDTH / 2}
                    x2={positions[1] - CARD_WIDTH / 2}
                    y1={parentY}
                    y2={parentY}
                  />
                  <circle className="node__marriage" cx={x} cy={parentY} r={5} />
                </>
              )}
              {parents.map((parent, i) => (
                <g key={i}>
                  <PersonCard person={parent} x={positions[i]} y={parentY} isAncestor />
                  <AncestorStack
                    person={parent}
                    x={positions[i]}
                    y={parentY}
                    onToggle={onToggle}
                  />
                </g>
              ))}
            </>
          )
        })()}
    </g>
  )
}

// A person and, for each marriage, their spouse — rendered as separate
// cards joined by a small marriage node. Clicking a marriage's connector
// expands/collapses only that marriage's children, independent of any
// other marriage this person has.
function FamilyNode({ node, onToggleMarriage, onToggleAncestors }) {
  const { data, x, y } = node
  const marriages = data.marriages ?? []

  return (
    <g className="node" transform={`translate(${x}, ${y})`}>
      {marriages.map((marriage, i) => {
        const hasChildren = Boolean(marriage.children || marriage._children)
        const isCollapsed = Boolean(marriage._children)
        const connX = marriage.spouse ? connectorX(i) : 0

        return (
          <g
            key={i}
            className={`node__union${hasChildren ? ' node__union--interactive' : ''}`}
            onClick={hasChildren ? () => onToggleMarriage(node, i) : undefined}
          >
            {marriage.spouse && (
              <line
                className="node__marriage-line"
                x1={unionSide(i) * (CARD_WIDTH / 2)}
                x2={spouseCenterX(i) - unionSide(i) * (CARD_WIDTH / 2)}
                y1={0}
                y2={0}
              />
            )}
            {marriage.spouse && (
              <circle className="node__marriage" cx={connX} cy={0} r={5} />
            )}
            {hasChildren && (
              <g
                className="node__toggle"
                transform={`translate(${connX}, ${CARD_HEIGHT / 2 + 14})`}
              >
                <circle r={9} />
                <text textAnchor="middle" dy={4}>
                  {isCollapsed ? '+' : '–'}
                </text>
              </g>
            )}
          </g>
        )
      })}
      <PersonCard person={data} x={0} />
      <AncestorStack person={data} x={0} y={0} onToggle={onToggleAncestors} />
      {marriages.map(
        (marriage, i) =>
          marriage.spouse && (
            <g key={i}>
              <PersonCard person={marriage.spouse} x={spouseCenterX(i)} isSpouse />
              <AncestorStack
                person={marriage.spouse}
                x={spouseCenterX(i)}
                y={0}
                onToggle={onToggleAncestors}
              />
            </g>
          ),
      )}
    </g>
  )
}

export default function FamilyTree() {
  const rootDataRef = useRef(null)
  if (!rootDataRef.current) {
    const data = buildFamilyTree(people, marriageData, parentage, rootId)
    collapseBelowDepth(data, 1)
    rootDataRef.current = data
  }

  const [version, setVersion] = useState(0)

  const handleToggleMarriage = (node, unionIndex) => {
    const marriage = node.data.marriages[unionIndex]
    if (marriage.children) {
      marriage._children = marriage.children
      marriage.children = undefined
    } else if (marriage._children) {
      marriage.children = marriage._children
      marriage._children = undefined
    } else {
      return
    }
    setVersion((v) => v + 1)
  }

  const handleToggleAncestors = (person) => {
    if (person.parents) {
      person._parents = person.parents
      person.parents = undefined
    } else if (person._parents) {
      person.parents = person._parents
      person._parents = undefined
    } else {
      return
    }
    setVersion((v) => v + 1)
  }

  const { nodes, links, width, height, offsetX, topMargin } = useMemo(() => {
    const root = d3.hierarchy(rootDataRef.current, childrenAccessor)
    d3
      .tree()
      .nodeSize([NODE_WIDTH, NODE_HEIGHT])
      .separation((a, b) => {
        const gap = a.parent === b.parent ? SIBLING_GAP : COUSIN_GAP
        return (halfWidth(a) + halfWidth(b) + gap) / NODE_WIDTH
      })(root)

    const descendants = root.descendants()
    const minX = Math.min(...descendants.map((d) => d.x - halfWidth(d)))
    const maxX = Math.max(...descendants.map((d) => d.x + halfWidth(d)))
    const maxY = Math.max(...descendants.map((d) => d.y))

    const maxAncestorDepth = Math.max(
      0,
      ...descendants.flatMap((d) => {
        const spouses = (d.data.marriages ?? []).map((m) => m.spouse).filter(Boolean)
        return [d.data, ...spouses].map(ancestorDepth)
      }),
    )
    const topMargin = NODE_HEIGHT / 2 + maxAncestorDepth * NODE_HEIGHT

    return {
      nodes: descendants,
      links: root.links(),
      width: maxX - minX,
      height: maxY + NODE_HEIGHT + maxAncestorDepth * NODE_HEIGHT,
      offsetX: -minX,
      topMargin,
    }
    // `version` is the re-render trigger: toggling a node mutates the plain
    // data object in place, so the hierarchy is rebuilt from scratch here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const linkPath = d3
    .linkVertical()
    .x((d) => d.x)
    .y((d) => d.y)

  return (
    <div className="family-tree">
      <svg
        className="family-tree__svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Family tree"
      >
        <g transform={`translate(${offsetX}, ${topMargin})`}>
          {links.map((link) => {
            // A child links to the connector of the specific marriage it
            // came from, not to the person's own card position.
            const unionIndex = link.target.data.__unionIndex
            const source =
              unionIndex === undefined
                ? link.source
                : {
                    x: link.source.x + connectorX(unionIndex),
                    y: link.source.y,
                  }
            return (
              <path
                key={`${link.source.x},${link.source.y}-${link.target.x},${link.target.y}`}
                className="link"
                d={linkPath({ source, target: link.target })}
              />
            )
          })}
          {nodes.map((node) => (
            <FamilyNode
              key={`${node.x},${node.y},${node.data.name}`}
              node={node}
              onToggleMarriage={handleToggleMarriage}
              onToggleAncestors={handleToggleAncestors}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
