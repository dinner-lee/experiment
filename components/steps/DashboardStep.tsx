'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  CalendarDays,
  ChevronDown,
  MessagesSquare,
  RefreshCw,
  Share2,
} from 'lucide-react'
import StaticConceptGraph from '@/components/StaticConceptGraph'
import { colorBasisOf, useConceptGraph } from '@/lib/useConceptGraph'
import { buildColorMap, USER_COLORS } from '@/lib/userColors'

interface DashboardStepProps {
  userId: string
  sessionId: string
  userName: string
  onOpenCompare: () => void // 현재 세션의 3단계(동료와 비교하기)로 이동
  onJoin: () => void // 현재 진행해야 하는 단계로 이동 (참여하기)
}

interface DashboardConversation {
  id: string
  userName: string
  isMine: boolean
  title: string
  summary: string
  createdAt: string
  revisionCount: number
}

interface DashboardSession {
  id: string
  name: string | null
  createdAt: string
  isActive: boolean
  isCurrent: boolean
  members: { id: string; name: string }[]
  conversations: DashboardConversation[]
}

// 세션(회차) 하나의 가로형 카드 + 확장 영역
function SessionCard({
  session,
  pinCode,
  onOpenCompare,
  onJoin,
}: {
  session: DashboardSession
  pinCode: string | null
  onOpenCompare?: () => void // 현재 참여 중인 세션에만 제공
  onJoin?: () => void // 현재 참여 중인 세션에만 제공
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)

  // 멤버 + 의견 작성자 합집합 기준 — 콘셉트 그래프 색상과 항상 일치
  const colorMap = useMemo(
    () =>
      buildColorMap(
        colorBasisOf(
          session.conversations,
          session.members.map((m) => m.name)
        )
      ),
    [session.members, session.conversations]
  )
  const colorOf = (name: string, idx: number) =>
    colorMap.get(name.trim()) || USER_COLORS[idx % USER_COLORS.length]

  const { graph, loading: graphLoading, error: graphError, refresh, enough } = useConceptGraph(
    session.id,
    session.conversations,
    session.members.map((m) => m.name)
  )

  const handleCardClick = () => {
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return
    if (onOpenCompare) onOpenCompare()
    else setExpanded(!expanded)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div
        onClick={handleCardClick}
        className="flex cursor-pointer flex-wrap items-center gap-x-8 gap-y-3 px-6 py-5"
      >
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
            session.isCurrent ? 'bg-pine-100 text-pine-800' : 'bg-zinc-100 text-zinc-500'
          }`}
        >
          <MessagesSquare className="h-6 w-6" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-ink">
              {session.name || `PIN ${pinCode ?? '—'} 세션`}
            </span>
            {session.name && (
              <span className="text-sm text-zinc-400">PIN {pinCode ?? '—'}</span>
            )}
            {session.isCurrent && (
              <span className="rounded-full bg-pine-700 px-2 py-0.5 text-[11px] font-bold text-white">
                현재 참여 중
              </span>
            )}
            {!session.isActive && (
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                종료됨
              </span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-zinc-500">
            <CalendarDays className="h-3.5 w-3.5" />
            {format(new Date(session.createdAt), 'yyyy년 MM월 dd일')} 개설
          </p>
        </div>

        {/* 멤버 아이콘 */}
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {session.members.map((m, i) => (
              <span
                key={m.id}
                title={m.name}
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white"
                style={{ backgroundColor: colorOf(m.name, i) }}
              >
                {m.name.substring(0, 1)}
              </span>
            ))}
          </div>
          <span className="text-sm text-zinc-500">{session.members.length}명 참여</span>
        </div>

        <span className="flex items-center gap-1.5 rounded-full bg-pine-50 px-3 py-1 text-sm font-medium text-pine-800">
          <Share2 className="h-3.5 w-3.5" />
          공유된 의견 {session.conversations.length}개
        </span>

        <div className="ml-auto flex items-center gap-2">
          {onJoin && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onJoin()
              }}
              className="flex items-center gap-1.5 rounded-xl bg-pine-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-pine-600"
            >
              참여하기
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-ink"
          >
            {expanded ? '접기' : '자세히 보기'}
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* 확장 영역: 멤버별 의견 카드 + 콘셉트 네트워크 그래프 */}
      {expanded && (
        <div className="border-t border-zinc-100 bg-zinc-50/50 p-6">
          {session.conversations.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">아직 공유된 의견이 없습니다.</p>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[1fr_520px]">
              {/* 멤버별 의견 카드 (2열) */}
              <div className="grid content-start gap-4 sm:grid-cols-2">
                {session.conversations.map((conv, i) => (
                  <div
                    key={conv.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      // 텍스트를 드래그(선택) 중이면 상세로 이동하지 않음
                      const selection = window.getSelection()
                      if (selection && !selection.isCollapsed) return
                      router.push(`/conversation/${conv.id}`)
                    }}
                    className="cursor-pointer rounded-xl border border-zinc-200/70 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: colorOf(conv.userName, i) }}
                      >
                        {conv.userName.substring(0, 1)}
                      </span>
                      <span className="text-sm font-semibold text-zinc-700">{conv.userName}</span>
                      {conv.isMine && (
                        <span className="rounded-full bg-pine-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          나
                        </span>
                      )}
                    </div>
                    <p className="mb-1.5 font-semibold leading-snug text-ink">
                      {conv.title || '(제목 없음)'}
                    </p>
                    <p className="line-clamp-3 text-sm leading-relaxed text-zinc-600">
                      {conv.summary}
                    </p>
                  </div>
                ))}
              </div>

              {/* 콘셉트 네트워크 그래프 */}
              <div className="rounded-xl border border-zinc-200/70 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-ink">콘셉트 네트워크</h3>
                  {enough && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        refresh()
                      }}
                      disabled={graphLoading}
                      className="flex items-center gap-1 text-xs font-medium text-zinc-400 transition-colors hover:text-pine-700"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${graphLoading ? 'animate-spin' : ''}`} />
                      새로고침
                    </button>
                  )}
                </div>
                {!enough ? (
                  <p className="py-12 text-center text-sm text-zinc-400">
                    2명 이상 공유하면 개념 지도가 생성됩니다.
                  </p>
                ) : graphLoading && !graph ? (
                  <p className="py-12 text-center text-sm text-zinc-400">개념을 분석하는 중…</p>
                ) : graphError ? (
                  <p className="py-12 text-center text-sm text-red-500">{graphError}</p>
                ) : graph ? (
                  <StaticConceptGraph users={graph.users} concepts={graph.concepts} height={480} />
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DashboardStep({
  userId,
  sessionId,
  onOpenCompare,
  onJoin,
}: DashboardStepProps) {
  const [sessions, setSessions] = useState<DashboardSession[]>([])
  const [pinCode, setPinCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`/api/session/${sessionId}/dashboard?viewerId=${userId}`)
      if (!response.ok) return
      const data = await response.json()
      setPinCode(data.pinCode || null)
      // 공유된 의견이 없는 세션은 숨김 (현재 참여 중인 세션은 항상 표시)
      setSessions(
        (data.sessions || []).filter(
          (s: DashboardSession) => s.isCurrent || s.conversations.length > 0
        )
      )
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [sessionId, userId])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-zinc-200/70 bg-white p-16 shadow-sm">
        <p className="text-zinc-500">세션 정보를 불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl text-ink">내 학습 공간</h1>

      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          pinCode={pinCode}
          onOpenCompare={session.isCurrent ? onOpenCompare : undefined}
          onJoin={session.isCurrent ? onJoin : undefined}
        />
      ))}
    </div>
  )
}
