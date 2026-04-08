'use client'

import React, { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'

export interface UserData {
  id: string
  name: string
  summaryIndex: number
  color: string
}

export interface ConceptNode {
  id: string
  label: string
  summaryIndices: number[]
}

interface ForceNode extends d3.SimulationNodeDatum {
  id: string
  type: 'user' | 'concept'
  label: string
  color?: string
  radius: number
  isShared?: boolean
  sharedUsers?: string[]
  sharedUserColors?: string[]
}

interface ForceLink extends d3.SimulationLinkDatum<ForceNode> {
  source: string | ForceNode
  target: string | ForceNode
}

interface ConceptNetworkGraphProps {
  users: UserData[]
  concepts: ConceptNode[]
}

export default function ConceptNetworkGraph({ users, concepts }: ConceptNetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number; content: React.ReactNode }>({
    visible: false,
    x: 0,
    y: 0,
    content: null,
  })

  // Set up D3 simulation
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const width = containerRef.current.clientWidth || 800
    const height = containerRef.current.clientHeight || 600

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove() // Clear previous render

    // Graph Data Preparation
    const nodes: ForceNode[] = []
    const links: ForceLink[] = []

    // 1. Add User Nodes
    users.forEach((user) => {
      nodes.push({
        id: `user-${user.id}`,
        type: 'user',
        label: user.name,
        color: user.color,
        radius: 35,
      })
    })

    // 2. Add Concept Nodes & Links
    concepts.forEach((concept) => {
      const activeUsers = users.filter((u) => concept.summaryIndices.includes(u.summaryIndex))
      // Filter out concepts not attached to any selected user
      if (activeUsers.length === 0) return

      const isShared = activeUsers.length > 1
      const sharedUsers = activeUsers.map((u) => u.name)
      const sharedUserColors = activeUsers.map((u) => u.color)

      nodes.push({
        id: `concept-${concept.id}`,
        type: 'concept',
        label: concept.label,
        radius: isShared ? 18 : 14,
        isShared,
        sharedUsers,
        sharedUserColors,
        color: isShared ? '#3b82f6' : '#71717a', // blue-500 or zinc-500
      })

      // Link to users
      activeUsers.forEach((user) => {
        links.push({
          source: `user-${user.id}`,
          target: `concept-${concept.id}`,
        })
      })
    })

    // 3. Define Simulation
    const simulation = d3
      .forceSimulation<ForceNode>(nodes)
      .force(
        'link',
        d3.forceLink<ForceNode, ForceLink>(links)
          .id((d) => d.id)
          .distance((d) => {
            const isTargetConceptShared = (d.target as ForceNode).isShared
            return isTargetConceptShared ? 120 : 60
          })
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius((d: any) => d.radius + 20).iterations(4))

    // Container group
    const g = svg.append('g')

    // Optional Zooming
    const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', (event) => {
      g.attr('transform', event.transform)
    })
    svg.call(zoom as any)

    // Draw Links
    const link = g
      .append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', (d: any) => {
        // Darker lines for links in dark mode can be done by a generic class structure
        return d.target.isShared ? '#d4d4d8' : '#e4e4e7' // zinc-300 vs zinc-200
      })
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', (d: any) => (d.target.isShared ? 'none' : '4,4'))

    // Draw Nodes
    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'cursor-pointer')

    // Drag behavior
    const drag = d3.drag<any, ForceNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    node.call(drag as any)

    // User Nodes style
    node.each(function (d) {
      const el = d3.select(this)
      if (d.type === 'user') {
        el.append('circle')
          .attr('r', d.radius)
          .attr('fill', '#ffffff')
          .attr('stroke', d.color as string)
          .attr('stroke-width', 4)
          .attr('stroke-dasharray', '0')

        // Add a subtle drop shadow
        el.style('filter', 'drop-shadow(0 4px 6px rgba(0,0,0,0.15))')

        // User Avatar Initial/Name in center
        const chars = d.label.substring(0, 5) || 'U'
        el.append('text')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', '#18181b') // zinc-900
          .style('font-weight', 'bold')
          .style('font-size', chars.length > 2 ? '12px' : '14px')
          .text(chars)
      } else {
        // Concept Nodes Style
        const padding = 20
        // approximate width calculation
        const estimatedWidth = d.label.length * 12 + padding
        const rectWidth = Math.max(70, estimatedWidth)
        const rectHeight = d.radius * 2

        if (d.isShared) {
          // Base rect (fill only, filter)
          el.append('rect')
            .attr('x', -rectWidth / 2)
            .attr('y', -rectHeight / 2)
            .attr('width', rectWidth)
            .attr('height', rectHeight)
            .attr('rx', rectHeight / 2)
            .attr('fill', '#eff6ff') // blue-50
            .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.05))')

          // Segmented stroke border based on shared users
          if (d.sharedUserColors && d.sharedUserColors.length > 0) {
            const N = d.sharedUserColors.length
            // Perimeter of capsule = 2 * (width - height) + pi * height
            const perimeter = 2 * (rectWidth - rectHeight) + Math.PI * rectHeight
            const segmentLength = perimeter / N

            d.sharedUserColors.forEach((color, i) => {
              el.append('rect')
                .attr('x', -rectWidth / 2)
                .attr('y', -rectHeight / 2)
                .attr('width', rectWidth)
                .attr('height', rectHeight)
                .attr('rx', rectHeight / 2)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', 3.5)
                .attr('stroke-dasharray', `${segmentLength} ${perimeter - segmentLength}`)
                .attr('stroke-dashoffset', -i * segmentLength)
            })
          } else {
            // Default border fallback
            el.append('rect')
              .attr('x', -rectWidth / 2)
              .attr('y', -rectHeight / 2)
              .attr('width', rectWidth)
              .attr('height', rectHeight)
              .attr('rx', rectHeight / 2)
              .attr('fill', 'none')
              .attr('stroke', '#93c5fd')
              .attr('stroke-width', 2)
          }

          el.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.33em')
            .attr('fill', '#1e40af') // blue-800
            .style('font-weight', '600')
            .style('font-size', '13px')
            .text(d.label)
        } else {
          el.append('rect')
            .attr('x', -rectWidth / 2)
            .attr('y', -rectHeight / 2)
            .attr('width', rectWidth)
            .attr('height', rectHeight)
            .attr('rx', rectHeight / 2)
            .attr('fill', '#f4f4f5') // zinc-100
            .attr('stroke', '#d4d4d8') // zinc-300
            .attr('stroke-width', 1.5)

          el.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('fill', '#52525b') // zinc-600
            .style('font-size', '12px')
            .text(d.label)
        }
      }
    })

    // Interactions
    node
      .on('mouseenter', (event, d) => {
        // Highlight logic
        const connectedNodes = new Set<string>([d.id])
        links.forEach((l: any) => {
          if (l.source.id === d.id) connectedNodes.add(l.target.id)
          if (l.target.id === d.id) connectedNodes.add(l.source.id)
        })

        node.style('opacity', (o: any) => (connectedNodes.has(o.id) ? 1 : 0.2))
          .style('transition', 'opacity 0.2s')
        link.style('opacity', (l: any) => (l.source.id === d.id || l.target.id === d.id ? 1 : 0.1))
          .attr('stroke-width', (l: any) => (l.source.id === d.id || l.target.id === d.id ? 3 : 2))
          .style('transition', 'opacity 0.2s')

        // Tooltip for shared concepts
        if (d.type === 'concept' && d.isShared) {
          setTooltip({
            visible: true,
            x: event.clientX,
            y: event.clientY - 40,
            content: (
              <div>
                <strong className="block mb-1 text-xs text-blue-300">공유됨:</strong>
                <span className="text-white text-sm">{d.sharedUsers?.join(', ')}</span>
              </div>
            ),
          })
        }
      })
      .on('mousemove', (event, d) => {
        if (d.type === 'concept' && d.isShared) {
          setTooltip((prev) => ({ ...prev, x: event.clientX, y: event.clientY - 40 }))
        }
      })
      .on('mouseleave', () => {
        node.style('opacity', 1)
        link.style('opacity', 1).attr('stroke-width', 2)
        setTooltip((prev) => ({ ...prev, visible: false }))
      })

    simulation.on('tick', () => {
      // Bounding constraints
      node.attr('cx', (d: any) => {
        d.x = Math.max(d.radius, Math.min(width - d.radius, d.x))
        return d.x
      })
      node.attr('cy', (d: any) => {
        d.y = Math.max(d.radius, Math.min(height - d.radius, d.y))
        return d.y
      })

      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    // Auto fit into bounds on load (optional visual pop-in)
    d3.select(svgRef.current).select('g').attr('transform', 'scale(0.9) translate(50, 50)')

    return () => {
      simulation.stop()
    }
  }, [users, concepts])

  return (
    <div className="relative w-full h-[650px] border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950 overflow-hidden shadow-inner" ref={containerRef}>
      <svg ref={svgRef} className="w-full h-full" />

      {/* Legend Info Overlay */}
      <div className="absolute top-4 left-4 p-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md rounded-xl border border-zinc-200/50 dark:border-zinc-800/50 shadow-sm text-sm space-y-3 pointer-events-none transition-all">
        <p className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          인터랙티브 맵 가이드
        </p>
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-[3px] border-blue-500 bg-white shadow-sm" />
          <span className="text-zinc-700 dark:text-zinc-300 font-medium">학습자(드래그 가능)</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-5 rounded-full bg-blue-50 border-2 border-blue-200" />
          <span className="text-zinc-700 dark:text-zinc-300 font-medium">공유된 키워드</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-5 rounded-full bg-zinc-100 border border-zinc-300" />
          <span className="text-zinc-500 dark:text-zinc-400 font-medium">개별 키워드</span>
        </div>
        <p className="text-zinc-400 text-xs pt-2 mt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
          마우스 휠 스크롤로 지도 축소/확대가 가능합니다.
          <br />노드 위에 마우스를 올려 연결을 확인하세요.
        </p>
      </div>

      {tooltip.visible && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg bg-zinc-900/95 border border-zinc-700 p-3 text-sm shadow-2xl backdrop-blur-xl transform -translate-x-1/2 -translate-y-full transition-transform"
          style={{ top: tooltip.y, left: tooltip.x }}
        >
          {tooltip.content}
          <div className="absolute top-full left-1/2 -ml-[6px] border-6 border-transparent border-t-zinc-900/95" />
        </div>
      )}
    </div>
  )
}
