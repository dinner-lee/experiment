'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { Maximize2, X } from 'lucide-react'

export interface GraphUser {
  id: string
  name: string
  summaryIndex: number
  color: string
}

export interface GraphConcept {
  id: string
  label: string
  summaryIndices: number[]
}

interface StaticConceptGraphProps {
  users: GraphUser[]
  concepts: GraphConcept[]
  height?: number
}

interface LayoutNode extends d3.SimulationNodeDatum {
  id: string
  type: 'user' | 'concept'
  label: string
  lines?: string[]
  color?: string
  radius: number
  isShared?: boolean
  sharedUserColors?: string[]
  rectWidth?: number
  rectHeight?: number
}

interface Layout {
  nodes: LayoutNode[]
  links: Array<{ source: LayoutNode; target: LayoutNode; shared: boolean }>
  vbX: number
  vbY: number
  vbW: number
  vbH: number
}

const LINE_HEIGHT = 19

// 긴 라벨을 2줄로 줄바꿈해 캡슐 폭을 줄인다 (레이아웃 밀집도 향상)
function wrapLabel(label: string): string[] {
  const trimmed = label.trim()
  if (trimmed.length <= 6) return [trimmed]
  const mid = trimmed.length / 2
  let splitAt = -1
  let best = Infinity
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === ' ' && Math.abs(i - mid) < best) {
      best = Math.abs(i - mid)
      splitAt = i
    }
  }
  if (splitAt === -1) return [trimmed]
  return [trimmed.slice(0, splitAt), trimmed.slice(splitAt + 1)]
}

// 그래프 SVG 렌더링 (카드/전체화면 공용)
function GraphSvg({ layout, scale }: { layout: Layout; scale: number }) {
  return (
    <svg
      viewBox={`${layout.vbX} ${layout.vbY} ${layout.vbW} ${layout.vbH}`}
      width={layout.vbW * scale}
      height={layout.vbH * scale}
      role="img"
      aria-label="콘셉트 네트워크 그래프"
    >
      {/* 링크 */}
      {layout.links.map((l, i) => (
        <line
          key={i}
          x1={l.source.x}
          y1={l.source.y}
          x2={l.target.x}
          y2={l.target.y}
          stroke={l.shared ? '#d4d4d8' : '#e4e4e7'}
          strokeWidth={2}
          strokeDasharray={l.shared ? undefined : '4,4'}
        />
      ))}

      {/* 개념 노드 (캡슐) */}
      {layout.nodes
        .filter((n) => n.type === 'concept')
        .map((n) => {
          const w = n.rectWidth || 60
          const h = n.rectHeight || 26
          const perimeter = 2 * (w - h) + Math.PI * h
          const lines = n.lines || [n.label]
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              <rect
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                rx={Math.min(h / 2, 20)}
                fill={n.isShared ? '#eff6ff' : '#f4f4f5'}
                stroke={n.isShared ? 'none' : '#d4d4d8'}
                strokeWidth={n.isShared ? 0 : 1.5}
              />
              {/* 공유 개념: 멤버 색상 분할 테두리 */}
              {n.isShared &&
                (n.sharedUserColors || []).map((color, i, arr) => {
                  const seg = perimeter / arr.length
                  return (
                    <rect
                      key={i}
                      x={-w / 2}
                      y={-h / 2}
                      width={w}
                      height={h}
                      rx={Math.min(h / 2, 20)}
                      fill="none"
                      stroke={color}
                      strokeWidth={3}
                      strokeDasharray={`${seg} ${perimeter - seg}`}
                      strokeDashoffset={-i * seg}
                    />
                  )
                })}
              <text
                textAnchor="middle"
                fontSize={n.isShared ? 16 : 15}
                fontWeight={n.isShared ? 600 : 400}
                fill={n.isShared ? '#1e40af' : '#52525b'}
              >
                {lines.map((line, i) => (
                  <tspan
                    key={i}
                    x={0}
                    y={(i - (lines.length - 1) / 2) * LINE_HEIGHT}
                    dominantBaseline="central"
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          )
        })}

      {/* 사용자 노드 */}
      {layout.nodes
        .filter((n) => n.type === 'user')
        .map((n) => (
          <g key={n.id} transform={`translate(${n.x},${n.y})`}>
            <circle
              r={n.radius}
              fill="#ffffff"
              stroke={n.color}
              strokeWidth={4}
              style={{ filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.15))' }}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={n.label.length > 2 ? 15 : 17}
              fontWeight={700}
              fill="#18181b"
            >
              {n.label.substring(0, 5)}
            </text>
          </g>
        ))}
    </svg>
  )
}

// 관리자 그래프와 동일한 시각 규칙(멤버 색상, 공유 개념 분할 테두리)을 유지하되,
// 시뮬레이션을 동기 실행해 고정된 레이아웃의 정적 SVG로 렌더링한다.
export default function StaticConceptGraph({ users, concepts, height = 420 }: StaticConceptGraphProps) {
  const layout: Layout = useMemo(() => {
    const nodes: LayoutNode[] = []
    const links: Array<{ source: string; target: string; shared: boolean }> = []

    users.forEach((user) => {
      nodes.push({
        id: `user-${user.id}`,
        type: 'user',
        label: user.name,
        color: user.color,
        radius: 34,
      })
    })

    concepts.forEach((concept) => {
      const activeUsers = users.filter((u) => concept.summaryIndices.includes(u.summaryIndex))
      if (activeUsers.length === 0) return
      const isShared = activeUsers.length > 1
      const lines = wrapLabel(concept.label)
      const maxLine = Math.max(...lines.map((l) => l.length))
      const rectWidth = Math.max(56, maxLine * 15 + 26)
      const rectHeight = lines.length * LINE_HEIGHT + (isShared ? 18 : 14)
      nodes.push({
        id: `concept-${concept.id}`,
        type: 'concept',
        label: concept.label,
        lines,
        radius: rectHeight / 2,
        isShared,
        sharedUserColors: activeUsers.map((u) => u.color),
        rectWidth,
        rectHeight,
      })
      activeUsers.forEach((user) => {
        links.push({ source: `user-${user.id}`, target: `concept-${concept.id}`, shared: isShared })
      })
    })

    if (nodes.length === 0)
      return { nodes: [] as LayoutNode[], links: [], vbX: 0, vbY: 0, vbW: 800, vbH: 400 }

    // 시뮬레이션을 동기 실행 (탄성 애니메이션 없이 최종 위치만 사용)
    const simLinks = links.map((l) => ({ ...l }))
    const simulation = d3
      .forceSimulation<LayoutNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<LayoutNode, any>(simLinks as any)
          .id((d: any) => d.id)
          .distance((d: any) => ((d.target as LayoutNode).isShared ? 80 : 48))
      )
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(0, 0))
      // 연결되지 않은 덩어리들이 흩어지지 않도록 중심으로 끌어당김 (컴팩트한 배치)
      .force('x', d3.forceX(0).strength(0.12))
      .force('y', d3.forceY(0).strength(0.16))
      .force(
        'collide',
        d3
          .forceCollide()
          .radius((d: any) =>
            d.type === 'user' ? d.radius + 8 : Math.max((d.rectWidth || 60) / 2, (d.rectHeight || 30) / 2) + 4
          )
          .iterations(6)
      )
      .stop()

    for (let i = 0; i < 300; i++) simulation.tick()

    // 노드 전체가 화면에 들어오도록 viewBox 계산
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    nodes.forEach((n) => {
      const halfW = n.type === 'user' ? n.radius : (n.rectWidth || 60) / 2
      const halfH = n.type === 'user' ? n.radius : (n.rectHeight || 26) / 2
      minX = Math.min(minX, (n.x || 0) - halfW)
      maxX = Math.max(maxX, (n.x || 0) + halfW)
      minY = Math.min(minY, (n.y || 0) - halfH)
      maxY = Math.max(maxY, (n.y || 0) + halfH)
    })
    const pad = 24
    const vbX = minX - pad
    const vbY = minY - pad
    const vbW = maxX - minX + pad * 2
    const vbH = maxY - minY + pad * 2

    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const resolvedLinks = links.map((l) => ({
      source: nodeById.get(l.source)!,
      target: nodeById.get(l.target)!,
      shared: l.shared,
    }))

    return { nodes, links: resolvedLinks, vbX, vbY, vbW, vbH }
  }, [users, concepts])

  // 컨테이너 폭 측정 (맞춤 배율 계산용)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = () => setContainerW(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 전체화면에서 ESC로 닫기
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  if (layout.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-zinc-400">
        표시할 개념이 없습니다.
      </div>
    )
  }

  // 카드 배율: 스크롤 없이 항상 전체가 보이도록 폭·높이에 맞춤 (최대 1.35배)
  // 세부를 크게 보고 싶으면 '크게 보기' 모달 사용
  const fitScale =
    containerW > 0 ? Math.min(containerW / layout.vbW, height / layout.vbH) : 1
  const scale = Math.min(fitScale, 1.35)

  // 전체화면 배율: 화면 폭에 맞추되 최소 1배 보장
  const fullScale =
    typeof window !== 'undefined'
      ? Math.min(Math.max((window.innerWidth * 0.88) / layout.vbW, 1), 1.8)
      : 1

  return (
    <div className="relative">
      <button
        onClick={() => setFullscreen(true)}
        className="absolute right-0 top-0 z-10 flex items-center gap-1 rounded-lg border border-zinc-200 bg-white/90 px-2.5 py-1.5 text-xs font-medium text-zinc-500 backdrop-blur transition-colors hover:border-zinc-300 hover:text-ink"
        title="전체화면으로 크게 보기"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        크게 보기
      </button>

      <div ref={containerRef} className="flex justify-center overflow-hidden">
        <GraphSvg layout={layout} scale={scale} />
      </div>

      {/* 전체화면 모달 */}
      {fullscreen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="relative max-h-[90vh] w-[92vw] overflow-auto rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-ink">콘셉트 네트워크</h3>
              <button
                onClick={() => setFullscreen(false)}
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-ink"
                aria-label="닫기"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex justify-center">
              <GraphSvg layout={layout} scale={fullScale} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
