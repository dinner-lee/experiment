'use client'

import { useMemo } from 'react'
import * as d3 from 'd3'

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
  color?: string
  radius: number
  isShared?: boolean
  sharedUserColors?: string[]
  rectWidth?: number
  rectHeight?: number
}

// 관리자 그래프와 동일한 시각 규칙(멤버 색상, 공유 개념 분할 테두리)을 유지하되,
// 시뮬레이션을 동기 실행해 고정된 레이아웃의 정적 SVG로 렌더링한다.
export default function StaticConceptGraph({ users, concepts, height = 420 }: StaticConceptGraphProps) {
  const layout = useMemo(() => {
    const nodes: LayoutNode[] = []
    const links: Array<{ source: string; target: string; shared: boolean }> = []

    users.forEach((user) => {
      nodes.push({
        id: `user-${user.id}`,
        type: 'user',
        label: user.name,
        color: user.color,
        radius: 30,
      })
    })

    concepts.forEach((concept) => {
      const activeUsers = users.filter((u) => concept.summaryIndices.includes(u.summaryIndex))
      if (activeUsers.length === 0) return
      const isShared = activeUsers.length > 1
      const capRadius = isShared ? 16 : 13
      const estimatedWidth = concept.label.length * 11 + 18
      nodes.push({
        id: `concept-${concept.id}`,
        type: 'concept',
        label: concept.label,
        radius: capRadius,
        isShared,
        sharedUserColors: activeUsers.map((u) => u.color),
        rectWidth: Math.max(60, estimatedWidth),
        rectHeight: capRadius * 2,
      })
      activeUsers.forEach((user) => {
        links.push({ source: `user-${user.id}`, target: `concept-${concept.id}`, shared: isShared })
      })
    })

    if (nodes.length === 0) return { nodes: [], links: [], viewBox: '0 0 800 400' }

    // 시뮬레이션을 동기 실행 (탄성 애니메이션 없이 최종 위치만 사용)
    const simLinks = links.map((l) => ({ ...l }))
    const simulation = d3
      .forceSimulation<LayoutNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<LayoutNode, any>(simLinks as any)
          .id((d: any) => d.id)
          .distance((d: any) => ((d.target as LayoutNode).isShared ? 85 : 50))
      )
      .force('charge', d3.forceManyBody().strength(-130))
      .force('center', d3.forceCenter(0, 0))
      .force(
        'collide',
        d3
          .forceCollide()
          .radius((d: any) =>
            d.type === 'user' ? d.radius + 8 : (d.rectWidth || 60) / 2 + 3
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
    const viewBox = `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`

    const nodeById = new Map(nodes.map((n) => [n.id, n]))
    const resolvedLinks = links.map((l) => ({
      source: nodeById.get(l.source)!,
      target: nodeById.get(l.target)!,
      shared: l.shared,
    }))

    return { nodes, links: resolvedLinks, viewBox }
  }, [users, concepts])

  if (layout.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-zinc-400">
        표시할 개념이 없습니다.
      </div>
    )
  }

  return (
    <svg viewBox={layout.viewBox} style={{ width: '100%', height }} role="img" aria-label="콘셉트 네트워크 그래프">
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
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`}>
              <rect
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                rx={h / 2}
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
                      rx={h / 2}
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
                dominantBaseline="central"
                fontSize={n.isShared ? 12 : 11}
                fontWeight={n.isShared ? 600 : 400}
                fill={n.isShared ? '#1e40af' : '#52525b'}
              >
                {n.label}
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
              fontSize={n.label.length > 2 ? 11 : 13}
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
