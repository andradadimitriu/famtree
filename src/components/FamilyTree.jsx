import { useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import familyData from '../data/familyData'
import './FamilyTree.css'

const NODE_WIDTH = 190
const NODE_HEIGHT = 110
const CARD_WIDTH = 160
const CARD_HEIGHT = 56

// Mutates `node`, moving `children` into `_children` (d3's convention for
// "collapsed") for every node at or past `maxDepth`, so the tree opens
// partially collapsed instead of dumping every generation on screen at once.
function collapseBelowDepth(node, maxDepth, depth = 0) {
  if (!node.children) return
  if (depth >= maxDepth) {
    node._children = node.children
    node.children = undefined
  }
  ;(node.children ?? node._children ?? []).forEach((child) =>
    collapseBelowDepth(child, maxDepth, depth + 1),
  )
}

function FamilyNode({ node, onToggle }) {
  const { data, x, y } = node
  const hasChildren = Boolean(data.children || data._children)
  const isCollapsed = Boolean(data._children)

  return (
    <g
      className={`node${hasChildren ? ' node--interactive' : ''}`}
      transform={`translate(${x}, ${y})`}
      onClick={hasChildren ? () => onToggle(node) : undefined}
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
        {data.name}
      </text>
      {data.born && (
        <text className="node__meta" y={14} textAnchor="middle">
          b. {data.born}
        </text>
      )}
      {hasChildren && (
        <g
          className="node__toggle"
          transform={`translate(0, ${CARD_HEIGHT / 2 + 14})`}
        >
          <circle r={9} />
          <text textAnchor="middle" dy={4}>
            {isCollapsed ? '+' : '–'}
          </text>
        </g>
      )}
    </g>
  )
}

export default function FamilyTree() {
  const rootDataRef = useRef(null)
  if (!rootDataRef.current) {
    const data = structuredClone(familyData)
    collapseBelowDepth(data, 1)
    rootDataRef.current = data
  }

  const [version, setVersion] = useState(0)

  const handleToggle = (node) => {
    const data = node.data
    if (data.children) {
      data._children = data.children
      data.children = undefined
    } else if (data._children) {
      data.children = data._children
      data._children = undefined
    } else {
      return
    }
    setVersion((v) => v + 1)
  }

  const { nodes, links, width, height, offsetX } = useMemo(() => {
    const root = d3.hierarchy(rootDataRef.current)
    d3.tree().nodeSize([NODE_WIDTH, NODE_HEIGHT])(root)

    const descendants = root.descendants()
    const xValues = descendants.map((d) => d.x)
    const minX = Math.min(...xValues)
    const maxX = Math.max(...xValues)
    const maxY = Math.max(...descendants.map((d) => d.y))

    return {
      nodes: descendants,
      links: root.links(),
      width: maxX - minX + NODE_WIDTH,
      height: maxY + NODE_HEIGHT,
      offsetX: -minX + NODE_WIDTH / 2,
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
        <g transform={`translate(${offsetX}, ${NODE_HEIGHT / 2})`}>
          {links.map((link) => (
            <path
              key={`${link.source.x},${link.source.y}-${link.target.x},${link.target.y}`}
              className="link"
              d={linkPath(link)}
            />
          ))}
          {nodes.map((node) => (
            <FamilyNode
              key={`${node.x},${node.y},${node.data.name}`}
              node={node}
              onToggle={handleToggle}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
