'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  ArrowRight,
  CheckCheck,
  EyeOff,
  Network,
  PenLine,
  RefreshCw,
  Users,
} from 'lucide-react'
import StaticConceptGraph from '@/components/StaticConceptGraph'
import { colorBasisOf, useConceptGraph } from '@/lib/useConceptGraph'
import { buildColorMap, USER_COLORS } from '@/lib/userColors'

interface CompareStepProps {
  userId: string
  sessionId: string
  userName: string
  onNext: () => void
}

interface SharedConversation {
  id: string
  userName: string
  isMine: boolean
  isAnonymous: boolean
  shareScope: string
  title: string
  summary: string
  createdAt: string
  duration: number
  pinCode?: string
  readerCount: number
  readerNames: string[]
  revisionCount: number
}

export default function CompareStep({ userId, sessionId, userName, onNext }: CompareStepProps) {
  const router = useRouter()
  const cacheKey = `cache:convs:${sessionId}:${userId}`
  // 마지막으로 받아둔 목록을 즉시 표시하고, 백그라운드에서 최신 데이터로 갱신
  const [cached] = useState<{ conversations: SharedConversation[]; pinCode: string | null } | null>(
    () => {
      if (typeof window === 'undefined') return null
      try {
        const raw = sessionStorage.getItem(cacheKey)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    }
  )
  const [allConversations, setAllConversations] = useState<SharedConversation[]>(
    cached?.conversations || []
  )
  const [currentPinCode, setCurrentPinCode] = useState<string | null>(cached?.pinCode || null)
  const [members, setMembers] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(!cached)

  // 동료 열람 후 수정 유도
  const viewedPeerKey = `viewedPeer:${sessionId}:${userId}`
  const [showRevisePrompt, setShowRevisePrompt] = useState(false)
  const [revising, setRevising] = useState(false)
  const [revisedSummary, setRevisedSummary] = useState('')
  const [revisionReason, setRevisionReason] = useState('')
  const [savingRevision, setSavingRevision] = useState(false)

  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch(`/api/conversations/${sessionId}?viewerId=${userId}`)
      if (!response.ok) {
        setAllConversations([])
        return
      }
      const data = await response.json()
      setAllConversations(data.conversations || [])
      setCurrentPinCode(data.currentPinCode || null)
      setMembers(data.members || [])
      try {
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify({
            conversations: data.conversations || [],
            pinCode: data.currentPinCode || null,
          })
        )
      } catch {
        // 캐시 저장 실패는 무시
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error)
    } finally {
      setLoading(false)
    }
  }, [sessionId, userId, cacheKey])

  useEffect(() => {
    fetchConversations()
    const interval = setInterval(fetchConversations, 5000)
    return () => clearInterval(interval)
  }, [fetchConversations])

  // 동료 대화 상세를 보고 돌아온 경우 수정 여부 질문
  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem(viewedPeerKey) === '1') {
      setShowRevisePrompt(true)
      localStorage.removeItem(viewedPeerKey)
    }
  }, [viewedPeerKey])

  const conversations = useMemo(
    () => (currentPinCode ? allConversations.filter((c) => c.pinCode === currentPinCode) : []),
    [allConversations, currentPinCode]
  )
  const myConversation = conversations.find((c) => c.isMine) || null

  useEffect(() => {
    if (myConversation && !revising) setRevisedSummary(myConversation.summary)
  }, [myConversation, revising])

  // 멤버 + 의견 작성자 합집합 기준 — 아바타·콘셉트 그래프 색상이 항상 일치
  const memberNames = useMemo(() => members.map((m) => m.name), [members])
  const colorMap = useMemo(
    () => buildColorMap(colorBasisOf(conversations, memberNames)),
    [memberNames, conversations]
  )
  const colorOf = (name: string, idx: number) =>
    colorMap.get(name.trim()) || USER_COLORS[idx % USER_COLORS.length]

  // 콘셉트 네트워크 그래프 (기존 공통점·차이점 비교 대체)
  const { graph, loading: graphLoading, error: graphError, refresh, enough } = useConceptGraph(
    sessionId,
    conversations,
    memberNames
  )

  const handleSaveRevision = async () => {
    if (!myConversation || !revisedSummary.trim()) return
    setSavingRevision(true)
    try {
      const response = await fetch(`/api/conversation/${myConversation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: revisedSummary.trim(),
          userId,
          revise: true,
          revisionReason: revisionReason.trim() || undefined,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || '수정에 실패했습니다')
      }
      setRevising(false)
      setRevisionReason('')
      await fetchConversations()
      alert('의견이 수정되었습니다. 이전 버전은 수정 이력으로 보관됩니다.')
    } catch (error: any) {
      alert(`수정에 실패했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setSavingRevision(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-zinc-200/70 bg-white p-16 shadow-sm">
        <p className="text-zinc-500">동료들의 의견을 불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 동료 열람 후 수정 유도 배너 */}
      {showRevisePrompt && myConversation && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pine-200 bg-pine-50 px-5 py-4">
          <p className="text-sm font-medium text-pine-800">
            동료의 생각을 확인했습니다. 새로 알게 된 점을 반영해 내 의견을 수정하시겠습니까?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setRevising(true)
                setShowRevisePrompt(false)
              }}
              className="rounded-lg bg-pine-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-pine-600"
            >
              수정하기
            </button>
            <button
              onClick={() => setShowRevisePrompt(false)}
              className="rounded-lg border border-pine-300 bg-white px-4 py-1.5 text-sm font-medium text-pine-800 hover:bg-pine-100"
            >
              지금은 유지하기
            </button>
          </div>
        </div>
      )}

      {/* 우리 팀의 의견 (카드형) */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <Users className="h-5 w-5 text-pine-700" />
              우리 팀의 의견
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              카드를 눌러 동료의 요약과 대화 기록을 자세히 살펴보세요.
            </p>
          </div>
          {currentPinCode && (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
              PIN {currentPinCode}
            </span>
          )}
        </div>
        {conversations.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-zinc-500">
            아직 공유된 의견이 없습니다. 동료들이 공유하면 여기에 나타납니다.
          </p>
        ) : (
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            {conversations.map((conv, i) => (
              <div
                key={conv.id}
                onClick={() => {
                  // 텍스트를 드래그(선택) 중이면 상세로 이동하지 않음
                  const selection = window.getSelection()
                  if (selection && !selection.isCollapsed) return
                  router.push(`/conversation/${conv.id}`)
                }}
                className="group cursor-pointer rounded-xl border border-zinc-200/70 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-pine-200 hover:shadow-md"
              >
                <div className="mb-3 flex items-center gap-2.5">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: colorOf(conv.userName, i) }}
                  >
                    {conv.userName.substring(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      {conv.userName}
                      {conv.isMine && (
                        <span className="rounded-full bg-pine-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          나
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {format(new Date(conv.createdAt), 'MM/dd HH:mm')}
                      {conv.shareScope === 'summary_only' && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5">
                          <EyeOff className="h-3 w-3" />
                          요약만 공개
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <p className="mb-1.5 font-semibold leading-snug text-ink">
                  {conv.title || '(제목 없음)'}
                </p>
                <p className="line-clamp-3 text-sm leading-relaxed text-zinc-600">{conv.summary}</p>
                <div className="mt-3 flex items-center gap-2">
                  {conv.revisionCount > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      <PenLine className="h-3 w-3" />
                      수정됨
                    </span>
                  )}
                  <span
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      conv.readerCount > 0 ? 'bg-pine-100 text-pine-800' : 'bg-zinc-100 text-zinc-400'
                    }`}
                    title={conv.readerNames.join(', ')}
                  >
                    <CheckCheck className="h-3 w-3" />
                    {conv.readerCount}명 읽음
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 콘셉트 네트워크 그래프 */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <Network className="h-5 w-5 text-pine-700" />
              콘셉트 네트워크
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              팀원들의 의견에서 추출한 핵심 개념 지도입니다. 여러 명의 색 테두리를 가진 개념은
              공통으로 언급된 것입니다.
            </p>
          </div>
          {enough && (
            <button
              onClick={() => refresh()}
              disabled={graphLoading}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-ink disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${graphLoading ? 'animate-spin' : ''}`} />
              {graphLoading ? '분석 중…' : '새로고침'}
            </button>
          )}
        </div>
        <div className="p-6">
          {!enough ? (
            <p className="py-8 text-center text-sm text-zinc-500">
              2명 이상이 의견을 공유하면 개념 지도가 생성됩니다.
            </p>
          ) : graphLoading && !graph ? (
            <p className="py-8 text-center text-sm text-zinc-500">개념을 분석하는 중…</p>
          ) : graphError ? (
            <p className="py-8 text-center text-sm text-red-500">{graphError}</p>
          ) : graph ? (
            <StaticConceptGraph users={graph.users} concepts={graph.concepts} height={560} />
          ) : null}
        </div>
      </div>

      {/* 내 의견 수정 */}
      {myConversation && (
        <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                <PenLine className="h-5 w-5 text-pine-700" />내 의견 수정하기
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                동료의 생각과 비교해보고, 내 의견을 발전시켜 보세요. 이전 버전은 이력으로
                보관됩니다.
              </p>
            </div>
            {!revising && (
              <button
                onClick={() => setRevising(true)}
                className="rounded-xl border border-pine-300 bg-white px-4 py-2 text-sm font-medium text-pine-800 transition-colors hover:bg-pine-50"
              >
                수정하기
              </button>
            )}
          </div>
          <div className="p-6">
            {revising ? (
              <div className="space-y-3">
                <textarea
                  value={revisedSummary}
                  onChange={(e) => setRevisedSummary(e.target.value)}
                  rows={6}
                  className="w-full resize-y rounded-xl border border-zinc-200 px-4 py-3 leading-relaxed text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
                />
                <input
                  type="text"
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                  placeholder="무엇을 참고해 수정했나요? (예: OO님의 동선 분리 아이디어를 반영)"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveRevision}
                    disabled={savingRevision || !revisedSummary.trim()}
                    className="rounded-xl bg-pine-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-600 disabled:bg-zinc-300"
                  >
                    {savingRevision ? '저장 중…' : '수정 저장'}
                  </button>
                  <button
                    onClick={() => {
                      setRevising(false)
                      setRevisedSummary(myConversation.summary)
                    }}
                    className="rounded-xl border border-zinc-300 bg-white px-5 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <p className="leading-relaxed text-zinc-700">{myConversation.summary}</p>
            )}
          </div>
        </div>
      )}

      {/* 다음 단계 */}
      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="flex items-center gap-2 rounded-xl bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-zinc-800"
        >
          팀 공동 결론 작성하러 가기
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
