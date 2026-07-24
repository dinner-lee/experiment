'use client'

import { useCallback, useEffect, useState } from 'react'
import { buildColorMap, USER_COLORS } from '@/lib/userColors'
import type { GraphUser, GraphConcept } from '@/components/StaticConceptGraph'

export interface GraphSourceConversation {
  id: string
  userName: string
  summary: string
  revisionCount?: number
}

interface GraphData {
  users: GraphUser[]
  concepts: GraphConcept[]
}

// 동시 요청 중복 방지 (대시보드·3단계가 동시에 마운트되어도 분석은 1회만)
const inflight = new Map<string, Promise<GraphData>>()

function signatureOf(conversations: GraphSourceConversation[]): string {
  return JSON.stringify(
    conversations
      .map((c) => [c.id, c.revisionCount || 0, c.summary.length])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  )
}

async function analyze(conversations: GraphSourceConversation[]): Promise<GraphData> {
  const response = await fetch('/api/admin/analyze-similarity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summaries: conversations.map((c) => c.summary) }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '개념 분석에 실패했습니다')

  const colorMap = buildColorMap(conversations.map((c) => c.userName))
  const users: GraphUser[] = conversations.map((conv, idx) => ({
    id: conv.id,
    name: conv.userName?.trim() || `대화 ${idx + 1}`,
    summaryIndex: idx,
    color: colorMap.get(conv.userName?.trim() || '') || USER_COLORS[idx % USER_COLORS.length],
  }))
  const concepts: GraphConcept[] = data.conceptGraph?.nodes || []
  return { users, concepts }
}

// 공유된 의견들로부터 콘셉트 네트워크 그래프 데이터를 생성·캐시하는 훅
export function useConceptGraph(sessionId: string, conversations: GraphSourceConversation[]) {
  const cacheKey = `cache:cgraph:${sessionId}`
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = useCallback(
    async (force = false) => {
      if (conversations.length < 2) return
      const sig = signatureOf(conversations)

      if (!force) {
        try {
          const raw = sessionStorage.getItem(cacheKey)
          if (raw) {
            const cached = JSON.parse(raw)
            if (cached.sig === sig) {
              setData({ users: cached.users, concepts: cached.concepts })
              return
            }
          }
        } catch {
          // 캐시 파싱 실패 시 새로 분석
        }
      }

      setLoading(true)
      setError('')
      try {
        const flightKey = `${sessionId}:${sig}`
        let promise = inflight.get(flightKey)
        if (!promise || force) {
          promise = analyze(conversations)
          inflight.set(flightKey, promise)
          promise.finally(() => inflight.delete(flightKey))
        }
        const result = await promise
        setData(result)
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ sig, ...result }))
        } catch {
          // 캐시 저장 실패는 무시
        }
      } catch (e: any) {
        setError(e.message || '개념 분석에 실패했습니다')
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, cacheKey, signatureOf(conversations)]
  )

  // 공유 의견이 2개 이상이면 자동 실행 (캐시가 유효하면 즉시 표시)
  useEffect(() => {
    if (conversations.length >= 2) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  return { graph: data, loading, error, refresh: () => run(true), enough: conversations.length >= 2 }
}
