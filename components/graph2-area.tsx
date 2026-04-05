"use client"

import * as React from "react"
import { CONTENT_TYPE_CONFIG, type ContentType } from "@/lib/content-types"
import type { TextBlock } from "@/components/tile-card"
import { Graph2DetailPanel } from "./graph2-detail-panel"
import { useModKey } from "@/lib/utils"

interface Graph2AreaProps {
  blocks: TextBlock[]
  ghostNote?: { id: string; text: string; category: string; isGenerating: boolean }
  projectName: string
  onReEnrich: (id: string) => void
  onChangeType: (id: string, newType: ContentType) => void
  onTogglePin: (id: string) => void
  onEdit: (id: string, text: string) => void
  onEditAnnotation: (id: string, annotation: string) => void
  highlightedBlockId?: string | null
  onHighlight?: (id: string | null) => void
}

const BLOCKSCAPE_CATEGORY_MAP = {
  entity: { id: "entity", title: "Entities" },
  idea: { id: "idea", title: "Ideas" },
  question: { id: "question", title: "Questions" },
  comparison: { id: "comparison", title: "Comparisons" },
  opinion: { id: "opinion", title: "Opinions" },
  reference: { id: "reference", title: "References" },
} as const

const BLOCKSCAPE_CATEGORY_ORDER = [
  "entity",
  "idea",
  "question",
  "comparison",
  "opinion",
  "reference",
] as const

type BlockscapeCategoryId = typeof BLOCKSCAPE_CATEGORY_ORDER[number]

interface BlockscapeNode {
  id: string
  block: TextBlock
  categoryId: BlockscapeCategoryId
  deps: string[]
  dependents: string[]
  label: string
  x: number
  y: number
  baseX: number
  targetX: number
  laneIndex: number
}

interface BlockscapeLane {
  id: BlockscapeCategoryId
  title: string
  items: BlockscapeNode[]
  top: number
  centerY: number
}

interface BlockscapeLink {
  source: BlockscapeNode
  target: BlockscapeNode
}

interface BlockscapeLayout {
  nodes: BlockscapeNode[]
  lanes: BlockscapeLane[]
  links: BlockscapeLink[]
  sceneWidth: number
  sceneHeight: number
  contentStartX: number
  contentWidth: number
  hiddenCount: number
}

const CARD_WIDTH = 132
const CARD_HEIGHT = 140
const NODE_GAP = CARD_WIDTH + 28
const LABEL_GUTTER = 168
const RIGHT_PADDING = 88
const TOP_PADDING = 42
const BOTTOM_PADDING = 52
const LANE_HEIGHT = 172
const LETTER_COLOR_PALETTE: Record<string, string> = {
  A: "#0284c7",
  B: "#3b82f6",
  C: "#06b6d4",
  D: "#a855f7",
  E: "#f59e0b",
  F: "#f97316",
  G: "#22c55e",
  H: "#84cc16",
  I: "#10b981",
  J: "#14b8a6",
  K: "#0ea5e9",
  L: "#60a5fa",
  M: "#8b5cf6",
  N: "#d946ef",
  O: "#e879f9",
  P: "#67e8f9",
  Q: "#4ade80",
  R: "#facc15",
  S: "#eab308",
  T: "#a3e635",
  U: "#22d3ee",
  V: "#38bdf8",
  W: "#818cf8",
  X: "#a78bfa",
  Y: "#f472b6",
  Z: "#fb7185",
}
const LETTER_COLOR_FALLBACK = "#9ca3af"

function truncate(text: string, length = 80): string {
  return text.slice(0, length)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function isBlockscapeType(type: ContentType): type is BlockscapeCategoryId {
  return (BLOCKSCAPE_CATEGORY_ORDER as readonly string[]).includes(type)
}

function getBadgeLetter(text: string): string {
  const match = text.trim().match(/[A-Za-z0-9]/)
  return match ? match[0].toUpperCase() : "•"
}

function getBadgeColor(letter: string): string {
  return LETTER_COLOR_PALETTE[letter] ?? LETTER_COLOR_FALLBACK
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function compareLaneOrder(a: BlockscapeNode, b: BlockscapeNode): number {
  const aConfidence = a.block.confidence
  const bConfidence = b.block.confidence
  const aMissing = aConfidence == null
  const bMissing = bConfidence == null

  if (aMissing !== bMissing) return aMissing ? -1 : 1
  if (!aMissing && !bMissing && aConfidence !== bConfidence) return aConfidence - bConfidence
  if (a.block.timestamp !== b.block.timestamp) return a.block.timestamp - b.block.timestamp

  return a.id.localeCompare(b.id)
}

function distributeLane(
  nodes: BlockscapeNode[],
  minX: number,
  maxX: number,
  gap: number,
) {
  if (nodes.length === 0) return

  const sorted = [...nodes].sort((a, b) => {
    if (a.x === b.x) return a.baseX - b.baseX
    return a.x - b.x
  })

  const usable = maxX - minX
  const required = (sorted.length - 1) * gap
  if (required > usable) {
    const step = sorted.length === 1 ? 0 : usable / (sorted.length - 1)
    sorted.forEach((node, index) => {
      node.x = minX + step * index
    })
    return
  }

  sorted[0].x = clamp(sorted[0].x, minX, maxX)
  for (let i = 1; i < sorted.length; i++) {
    sorted[i].x = Math.max(sorted[i].x, sorted[i - 1].x + gap)
  }

  const overflow = sorted[sorted.length - 1].x - maxX
  if (overflow > 0) {
    sorted.forEach(node => { node.x -= overflow })
  }

  const underflow = minX - sorted[0].x
  if (underflow > 0) {
    sorted.forEach(node => { node.x += underflow })
  }

  const targetCenter = clamp(
    average(sorted.map(node => node.targetX)),
    minX + required / 2,
    maxX - required / 2,
  )
  const currentCenter = (sorted[0].x + sorted[sorted.length - 1].x) / 2
  const shift = clamp(
    targetCenter - currentCenter,
    minX - sorted[0].x,
    maxX - sorted[sorted.length - 1].x,
  )
  sorted.forEach(node => { node.x += shift })
}

function buildBlockscapeLayout(
  blocks: TextBlock[],
  dims: { w: number; h: number },
): BlockscapeLayout {
  const visibleBlocks = blocks.filter(
    (block): block is TextBlock & { contentType: BlockscapeCategoryId } =>
      isBlockscapeType(block.contentType),
  )
  const hiddenCount = blocks.length - visibleBlocks.length

  if (visibleBlocks.length === 0) {
    return {
      nodes: [],
      lanes: [],
      links: [],
      sceneWidth: dims.w,
      sceneHeight: dims.h,
      contentStartX: LABEL_GUTTER,
      contentWidth: Math.max(0, dims.w - LABEL_GUTTER - RIGHT_PADDING),
      hiddenCount,
    }
  }

  const visibleIds = new Set(visibleBlocks.map(block => block.id))
  const nodes = visibleBlocks.map((block): BlockscapeNode => ({
    id: block.id,
    block,
    categoryId: block.contentType,
    deps: (block.influencedBy || []).filter(id => visibleIds.has(id)),
    dependents: [],
    label: truncate(block.text || ""),
    x: 0,
    y: 0,
    baseX: 0,
    targetX: 0,
    laneIndex: 0,
  }))

  const nodeById = new Map(nodes.map(node => [node.id, node]))
  nodes.forEach(node => {
    node.deps.forEach(depId => {
      const dep = nodeById.get(depId)
      if (dep) dep.dependents.push(node.id)
    })
  })

  const lanes = BLOCKSCAPE_CATEGORY_ORDER
    .map((id): BlockscapeLane => ({
      id,
      title: BLOCKSCAPE_CATEGORY_MAP[id].title,
      items: nodes.filter(node => node.categoryId === id).sort(compareLaneOrder),
      top: 0,
      centerY: 0,
    }))
    .filter(lane => lane.items.length > 0)

  const widestLane = Math.max(...lanes.map(lane => lane.items.length), 1)
  const contentWidth = Math.max(
    dims.w - LABEL_GUTTER - RIGHT_PADDING,
    Math.max(900, widestLane * NODE_GAP + 260),
  )
  const sceneWidth = LABEL_GUTTER + contentWidth + RIGHT_PADDING
  const sceneHeight = TOP_PADDING + lanes.length * LANE_HEIGHT + BOTTOM_PADDING
  const minCenterX = LABEL_GUTTER + CARD_WIDTH / 2 + 18
  const maxCenterX = sceneWidth - RIGHT_PADDING - CARD_WIDTH / 2 - 18

  lanes.forEach((lane, laneIndex) => {
    lane.top = TOP_PADDING + laneIndex * LANE_HEIGHT
    lane.centerY = lane.top + LANE_HEIGHT * 0.58

    const laneNodes = lane.items
    const available = maxCenterX - minCenterX
    const naturalSpan = Math.max(0, (laneNodes.length - 1) * NODE_GAP)
    const step = laneNodes.length <= 1
      ? 0
      : naturalSpan > available
        ? available / (laneNodes.length - 1)
        : NODE_GAP
    const span = step * Math.max(0, laneNodes.length - 1)
    const startX = clamp(sceneWidth / 2 - span / 2, minCenterX, maxCenterX - span)

    laneNodes.forEach((node, index) => {
      const baseX = startX + step * index
      node.laneIndex = laneIndex
      node.x = baseX
      node.y = lane.centerY
      node.baseX = baseX
      node.targetX = baseX
    })
  })

  for (let pass = 0; pass < 14; pass++) {
    nodes.forEach(node => {
      const relatedX = [...node.deps, ...node.dependents]
        .map(id => nodeById.get(id)?.x)
        .filter((value): value is number => typeof value === "number")

      const targetX = relatedX.length > 0 ? average(relatedX) : node.baseX
      node.targetX = clamp(targetX, minCenterX, maxCenterX)

      const strength = relatedX.length > 0 ? 0.42 : 0.18
      node.x += (node.targetX - node.x) * strength
    })

    lanes.forEach(lane => {
      distributeLane(lane.items, minCenterX, maxCenterX, NODE_GAP)
    })
  }

  const links: BlockscapeLink[] = []
  nodes.forEach(node => {
    node.deps.forEach(depId => {
      const source = nodeById.get(depId)
      if (source) links.push({ source, target: node })
    })
  })

  return {
    nodes,
    lanes,
    links,
    sceneWidth,
    sceneHeight,
    contentStartX: LABEL_GUTTER,
    contentWidth,
    hiddenCount,
  }
}

function linkPath(source: BlockscapeNode, target: BlockscapeNode): string {
  const sx = source.x
  const sy = source.y + CARD_HEIGHT / 2 - 12
  const tx = target.x
  const ty = target.y - CARD_HEIGHT / 2 + 12
  const curve = Math.max(42, Math.abs(ty - sy) * 0.52)
  const downward = ty >= sy
  const c1y = sy + (downward ? curve : -curve)
  const c2y = ty - (downward ? curve : -curve)
  return `M ${sx} ${sy} C ${sx} ${c1y}, ${tx} ${c2y}, ${tx} ${ty}`
}

export function Graph2Area({
  blocks,
  ghostNote,
  projectName,
  onReEnrich,
  onChangeType,
  onTogglePin,
  onEdit,
  onEditAnnotation,
  highlightedBlockId,
}: Graph2AreaProps) {
  const mod = useModKey()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const svgRef = React.useRef<SVGSVGElement>(null)
  const [dims, setDims] = React.useState({ w: 900, h: 600 })
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const [tooltip, setTooltip] = React.useState<{ id: string; x: number; y: number } | null>(null)
  const [transform, setTransform] = React.useState({ x: 0, y: 0, k: 1 })

  const isPanning = React.useRef(false)
  const didPan = React.useRef(false)
  const panStart = React.useRef({ mx: 0, my: 0, tx: 0, ty: 0 })

  React.useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setDims({ w: width, h: height })
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const layout = React.useMemo(() => buildBlockscapeLayout(blocks, dims), [blocks, dims])
  const nodeMap = React.useMemo(
    () => new Map(layout.nodes.map(node => [node.id, node])),
    [layout.nodes],
  )
  const visibleBlocks = React.useMemo(
    () => layout.nodes.map(node => node.block),
    [layout.nodes],
  )

  React.useEffect(() => {
    if (selectedId && !nodeMap.has(selectedId)) setSelectedId(null)
  }, [selectedId, nodeMap])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedId(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const updateTooltip = React.useCallback((id: string, clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setTooltip({ id, x: clientX - rect.left, y: clientY - rect.top })
  }, [])

  const handleWheel = React.useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.08 : 0.92
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    setTransform(prev => {
      const nextK = clamp(prev.k * factor, 0.45, 2.2)
      return {
        x: mx - (mx - prev.x) * (nextK / prev.k),
        y: my - (my - prev.y) * (nextK / prev.k),
        k: nextK,
      }
    })
  }, [])

  const handleCanvasMouseDown = React.useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    isPanning.current = true
    didPan.current = false
    panStart.current = { mx: e.clientX, my: e.clientY, tx: transform.x, ty: transform.y }
  }, [transform])

  const handleCanvasMouseMove = React.useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!isPanning.current) return
    didPan.current = true
    setTransform(prev => ({
      ...prev,
      x: panStart.current.tx + (e.clientX - panStart.current.mx),
      y: panStart.current.ty + (e.clientY - panStart.current.my),
    }))
  }, [])

  const handleCanvasMouseUp = React.useCallback(() => {
    isPanning.current = false
  }, [])

  const focalId = hoveredId ?? selectedId ?? highlightedBlockId ?? null

  const connectedToFocal = React.useMemo(() => {
    if (!focalId) return null
    const focal = nodeMap.get(focalId)
    if (!focal) return null

    const ids = new Set<string>([focalId])
    focal.deps.forEach(id => ids.add(id))
    focal.dependents.forEach(id => ids.add(id))
    return ids
  }, [focalId, nodeMap])

  const selectedBlock = React.useMemo(
    () => nodeMap.get(selectedId ?? "")?.block ?? null,
    [nodeMap, selectedId],
  )

  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      <div
        ref={containerRef}
        style={{ width: selectedId ? "70%" : "100%" }}
        className="relative h-full overflow-hidden bg-[#0b1020] transition-all duration-300"
      >
        {layout.nodes.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-10 text-center">
            <div className="max-w-xl space-y-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/35">
                blockscape view
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Blockscape maps only six note types into fixed lanes:
                {" "}
                <span className="text-foreground/80">entity, idea, question, comparison, opinion, reference</span>.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Add notes in those categories to build the map, then hover a node to dim unrelated branches and click any card to inspect it.
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/55">
                {`type anything · #type to classify · ${mod}K for commands`}
              </p>
            </div>
          </div>
        ) : (
          <>
            <svg
              ref={svgRef}
              width="100%"
              height="100%"
              className="select-none"
              style={{ cursor: isPanning.current ? "grabbing" : "grab" }}
              onWheel={handleWheel}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
              onClick={() => {
                if (!didPan.current) setSelectedId(null)
              }}
            >
              <defs>
                <linearGradient id="blockscape-bg" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(12, 18, 32, 0.99)" />
                  <stop offset="100%" stopColor="rgba(15, 23, 41, 0.97)" />
                </linearGradient>
                <radialGradient id="blockscape-glow-a" cx="0%" cy="0%" r="100%">
                  <stop offset="0%" stopColor="rgba(70, 111, 220, 0.16)" />
                  <stop offset="100%" stopColor="rgba(70, 111, 220, 0)" />
                </radialGradient>
                <radialGradient id="blockscape-glow-b" cx="100%" cy="100%" r="100%">
                  <stop offset="0%" stopColor="rgba(59, 130, 246, 0.12)" />
                  <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
                </radialGradient>
              </defs>

              <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
                <rect
                  x={0}
                  y={0}
                  width={layout.sceneWidth}
                  height={layout.sceneHeight}
                  fill="url(#blockscape-bg)"
                />
                <rect
                  x={0}
                  y={0}
                  width={layout.sceneWidth}
                  height={layout.sceneHeight}
                  fill="url(#blockscape-glow-a)"
                />
                <rect
                  x={0}
                  y={0}
                  width={layout.sceneWidth}
                  height={layout.sceneHeight}
                  fill="url(#blockscape-glow-b)"
                />

                {Array.from({ length: 5 }).map((_, index) => {
                  const x = layout.contentStartX + (layout.contentWidth / 4) * index
                  return (
                    <line
                      key={`guide-${index}`}
                      x1={x}
                      y1={0}
                      x2={x}
                      y2={layout.sceneHeight}
                      stroke="rgba(132, 152, 188, 0.18)"
                      strokeDasharray="6 8"
                      strokeWidth={1}
                    />
                  )
                })}

                {layout.lanes.map(lane => (
                  <g key={lane.id}>
                    <line
                      x1={0}
                      y1={lane.top}
                      x2={layout.sceneWidth}
                      y2={lane.top}
                      stroke="rgba(132, 152, 188, 0.22)"
                      strokeDasharray="4 6"
                      strokeWidth={1}
                    />
                    <text
                      x={8}
                      y={lane.top - 12}
                      fontSize={11}
                      fontFamily="monospace"
                      fill="rgba(212, 221, 239, 0.86)"
                      style={{ letterSpacing: "0.14em", userSelect: "none" }}
                    >
                      <tspan>{lane.title.toUpperCase()}</tspan>
                      <tspan dx={8} fill="rgba(163, 177, 206, 0.58)">
                        {lane.items.length} items
                      </tspan>
                    </text>
                  </g>
                ))}

                <line
                  x1={0}
                  y1={layout.sceneHeight - BOTTOM_PADDING}
                  x2={layout.sceneWidth}
                  y2={layout.sceneHeight - BOTTOM_PADDING}
                  stroke="rgba(132, 152, 188, 0.22)"
                  strokeDasharray="4 6"
                  strokeWidth={1}
                />

                {layout.links.map(link => {
                  const related = connectedToFocal?.has(link.source.id) && connectedToFocal?.has(link.target.id)
                  const dimmed = focalId != null && !related
                  return (
                    <path
                      key={`${link.source.id}-${link.target.id}`}
                      d={linkPath(link.source, link.target)}
                      fill="none"
                      stroke="rgba(121, 158, 255, 0.82)"
                      strokeWidth={related ? 5 : 4}
                      strokeOpacity={dimmed ? 0.09 : related ? 0.74 : 0.34}
                      strokeLinecap="round"
                      style={{ transition: "stroke-opacity 0.16s, stroke-width 0.16s" }}
                    />
                  )
                })}
              </g>
            </svg>

            <div className="pointer-events-none absolute inset-0">
              <div
                className="relative"
                style={{
                  width: layout.sceneWidth,
                  height: layout.sceneHeight,
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
                  transformOrigin: "0 0",
                }}
              >
                {layout.nodes.map(node => {
                  const isSelected = node.id === selectedId
                  const isHovered = node.id === hoveredId
                  const isHighlighted = node.id === highlightedBlockId
                  const isActive = isSelected || isHovered || isHighlighted
                  const isDimmed = focalId != null &&
                    !isSelected &&
                    node.id !== focalId &&
                    (!connectedToFocal || !connectedToFocal.has(node.id))
                  const cardFilter = isActive
                    ? "none"
                    : isDimmed
                      ? "saturate(0.42) brightness(0.52)"
                      : focalId != null
                        ? "saturate(0.6) brightness(0.72)"
                        : "saturate(0.64) brightness(0.78)"
                  const badgeOpacity = isActive
                    ? 1
                    : isDimmed
                      ? 0.34
                      : focalId != null
                        ? 0.56
                        : 0.62
                  const textColor = isActive
                    ? "rgba(241, 245, 249, 1)"
                    : isDimmed
                      ? "rgba(148, 163, 184, 0.34)"
                      : focalId != null
                        ? "rgba(203, 213, 225, 0.58)"
                        : "rgba(203, 213, 225, 0.68)"
                  const cardBorderColor = isActive
                    ? "rgba(121, 142, 176, 0.34)"
                    : isDimmed
                      ? "rgba(121, 142, 176, 0.18)"
                      : "rgba(121, 142, 176, 0.24)"

                  const config = CONTENT_TYPE_CONFIG[node.block.contentType]
                  const accent = config.accentVar
                  const badgeLetter = getBadgeLetter(node.label)
                  const badgeColor = getBadgeColor(badgeLetter)

                  return (
                    <button
                      key={node.id}
                      type="button"
                      className="blockscape-node pointer-events-auto absolute rounded-[24px] border text-left transition-all duration-150"
                      style={{
                        left: node.x - CARD_WIDTH / 2,
                        top: node.y - CARD_HEIGHT / 2,
                        width: CARD_WIDTH,
                        height: CARD_HEIGHT,
                        borderColor: cardBorderColor,
                        background: "linear-gradient(180deg, #182134, #0f1522)",
                        boxShadow: isSelected
                          ? `0 0 0 3px color-mix(in oklch, ${accent} 28%, transparent), 0 18px 40px rgba(2, 6, 23, 0.5), 0 0 28px color-mix(in oklch, ${accent} 16%, transparent)`
                          : isHovered || isHighlighted
                            ? `0 0 0 2px color-mix(in oklch, ${accent} 20%, transparent), 0 14px 30px rgba(2, 6, 23, 0.42)`
                            : "0 10px 24px rgba(2, 6, 23, 0.32)",
                        filter: cardFilter,
                        transform: isSelected || isHovered ? "translateY(-2px)" : "translateY(0)",
                      }}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation()
                        setSelectedId(prev => prev === node.id ? null : node.id)
                      }}
                      onMouseEnter={e => {
                        setHoveredId(node.id)
                        updateTooltip(node.id, e.clientX, e.clientY)
                      }}
                      onMouseMove={e => updateTooltip(node.id, e.clientX, e.clientY)}
                      onMouseLeave={() => {
                        setHoveredId(null)
                        setTooltip(null)
                      }}
                    >
                      <div
                        className="absolute inset-[4px] rounded-[20px] border"
                        style={{ borderColor: "rgba(255,255,255,0.05)" }}
                      />

                      {(isSelected || isHovered || isHighlighted) && (
                        <div
                          className="absolute inset-[-6px] rounded-[28px] border"
                          style={{
                            borderColor: accent,
                            opacity: isSelected ? 0.46 : 0.28,
                          }}
                        />
                      )}

                      {node.block.isEnriching && (
                        <div
                          className="absolute inset-[-8px] rounded-[30px] border border-dashed"
                          style={{
                            borderColor: accent,
                            opacity: 0.4,
                            animation: "spin 4s linear infinite",
                          }}
                        />
                      )}

                      <div
                        className="absolute left-1/2 top-[-18px] flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full text-[23px] font-black"
                        style={{
                          background: badgeColor,
                          color: "rgba(15, 23, 42, 0.72)",
                          boxShadow: `0 8px 22px color-mix(in srgb, ${badgeColor} 28%, transparent)`,
                          opacity: badgeOpacity,
                        }}
                      >
                        {badgeLetter}
                      </div>

                      {node.block.isPinned && (
                        <div
                          className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full"
                          style={{ background: accent }}
                        />
                      )}

                      <div className="flex h-full items-center justify-center px-4 pt-8 pb-4 text-center">
                        <p
                          className="overflow-hidden text-[13px] font-medium leading-[1.08] tracking-[-0.02em]"
                          style={{
                            display: "-webkit-box",
                            WebkitLineClamp: 6,
                            WebkitBoxOrient: "vertical",
                            color: textColor,
                          }}
                        >
                          {node.label}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {tooltip && (() => {
              const node = nodeMap.get(tooltip.id)
              if (!node) return null

              const config = CONTENT_TYPE_CONFIG[node.block.contentType]
              const accent = config.accentVar
              const maxWidth = 300
              const tipX = Math.min(tooltip.x + 14, dims.w - maxWidth - 16)
              const tipY = tooltip.y - 16

              return (
                <div
                  className="absolute z-50 pointer-events-none"
                  style={{ left: tipX, top: tipY, transform: "translateY(-100%)" }}
                >
                  <div
                    className="overflow-hidden rounded-sm border shadow-[0_8px_32px_rgba(0,0,0,0.55)]"
                    style={{ minWidth: 190, maxWidth }}
                  >
                    <div className="flex items-center gap-2 px-2.5 py-1.5" style={{ background: accent }}>
                      <span className="font-mono text-[9px] font-black uppercase tracking-widest text-black/70">
                        {config.label}
                      </span>
                      <span className="ml-auto font-mono text-[8px] text-black/50">
                        {node.deps.length} deps
                      </span>
                    </div>
                    <div className="bg-[#111827]/95 px-3 py-2.5 backdrop-blur-sm">
                      <p className="text-sm font-semibold leading-snug text-foreground">
                        {node.block.text}
                      </p>
                    </div>
                  </div>
                  <div
                    className="mx-4 h-2 w-2 rotate-45 border-b border-r border-white/10 bg-card/95"
                    style={{ marginTop: -1 }}
                  />
                </div>
              )
            })()}

            <div className="absolute left-4 top-4 pointer-events-none flex flex-col gap-1">
              <span className="font-mono text-[8px] uppercase tracking-widest text-slate-300/70">
                {projectName.toUpperCase()} · {layout.nodes.length} mapped nodes
              </span>
              {layout.hiddenCount > 0 && (
                <span className="font-mono text-[8px] uppercase tracking-widest text-slate-400/70">
                  {layout.hiddenCount} hidden outside blockscape
                  {ghostNote ? " · synthesis hidden" : ""}
                </span>
              )}
            </div>

            <div className="absolute bottom-4 left-4 pointer-events-none">
              <span className="font-mono text-[8px] uppercase tracking-widest text-slate-400/75">
                scroll to zoom · drag to pan · hover to isolate branches
              </span>
            </div>
          </>
        )}
      </div>

      {selectedId && (
        <div className="h-full overflow-hidden transition-all duration-300" style={{ width: "30%" }}>
          <Graph2DetailPanel
            block={selectedBlock}
            allBlocks={visibleBlocks}
            onClose={() => setSelectedId(null)}
            onSelectNode={id => setSelectedId(id)}
            onReEnrich={onReEnrich}
            onChangeType={onChangeType}
            onTogglePin={onTogglePin}
            onEdit={onEdit}
            onEditAnnotation={onEditAnnotation}
          />
        </div>
      )}
    </div>
  )
}
