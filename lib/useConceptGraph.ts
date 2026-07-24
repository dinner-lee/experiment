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
const inflight = new Map<string, Promise<GraphConcept[]>>()

function signatureOf(conversations: GraphSourceConversation[]): string {
  return JSON.stringify(
    conversations
      .map((c) => [c.id, c.revisionCount || 0, c.summary.length])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  )
}

// 색상 배정 기준: 멤버 + 의견 작성자 이름의 합집합 (가나다순)
// — 이동해 온 의견의 작성자처럼 멤버가 아닌 사람도 항상 고정 색을 갖는다
export function colorBasisOf(
  conversations: { userName: string }[],
  memberNames?: string[]
): string[] {
  return [...(memberNames || []), ...conversations.map((c) => c.userName)]
}

function buildUsers(
  conversations: GraphSourceConversation[],
  basisNames: string[]
): GraphUser[] {
  const colorMap = buildColorMap(basisNames)
  return conversations.map((conv, idx) => ({
    id: conv.id,
    name: conv.userName?.trim() || `대화 ${idx + 1}`,
    summaryIndex: idx,
    color: colorMap.get(conv.userName?.trim() || '') || USER_COLORS[idx % USER_COLORS.length],
  }))
}

async function analyze(conversations: GraphSourceConversation[]): Promise<GraphConcept[]> {
  const response = await fetch('/api/admin/analyze-similarity', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summaries: conversations.map((c) => c.summary) }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || '개념 분석에 실패했습니다')
  return data.conceptGraph?.nodes || []
}

// 공유된 의견들로부터 콘셉트 네트워크 그래프 데이터를 생성·캐시하는 훅
// memberNames: 색상 배정 기준 (세션 멤버 전체 — 아바타 색상과 일치)
export function useConceptGraph(
  sessionId: string,
  conversations: GraphSourceConversation[],
  memberNames?: string[]
) {
  const cacheKey = `cache:cgraph:${sessionId}`
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const run = useCallback(
    async (force = false) => {
      if (conversations.length < 2) return
      const sig = signatureOf(conversations)
      // 색상은 캐시하지 않고 항상 현재 기준으로 다시 계산 (아바타 색상과 불일치 방지)
      const basis = colorBasisOf(conversations, memberNames)

      if (!force) {
        try {
          const raw = sessionStorage.getItem(cacheKey)
          if (raw) {
            const cached = JSON.parse(raw)
            if (cached.sig === sig && Array.isArray(cached.concepts)) {
              setData({ users: buildUsers(conversations, basis), concepts: cached.concepts })
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
        const concepts = await promise
        setData({ users: buildUsers(conversations, basis), concepts })
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ sig, concepts }))
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
    [sessionId, cacheKey, signatureOf(conversations), (memberNames || []).join('|')]
  )

  // 공유 의견이 2개 이상이면 자동 실행 (캐시가 유효하면 즉시 표시)
  useEffect(() => {
    if (conversations.length >= 2) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  return { graph: data, loading, error, refresh: () => run(true), enough: conversations.length >= 2 }
}
