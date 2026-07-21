'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import {
  ArrowRight,
  CheckCheck,
  GitCompareArrows,
  Lightbulb,
  MessageCircleQuestion,
  PenLine,
  RefreshCw,
  Users,
} from 'lucide-react'

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

interface Analysis {
  commonPoints?: { point: string; users: string[] }[]
  differences?: { topic: string; stances: { user: string; position: string }[] }[]
  uniquePoints?: { user: string; points: string[] }[]
  discussionQuestions?: string[]
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
  const [loading, setLoading] = useState(!cached)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState('')

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

  const handleAnalyze = async () => {
    setAnalyzing(true)
    setAnalysisError('')
    try {
      const response = await fetch(`/api/session/${sessionId}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId: userId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '비교 분석에 실패했습니다')
      if (data.status === 'not_enough') {
        setAnalysisError(data.message)
        setAnalysis(null)
      } else {
        setAnalysis(data.analysis)
      }
    } catch (error: any) {
      setAnalysisError(error.message || '비교 분석에 실패했습니다')
    } finally {
      setAnalyzing(false)
    }
  }

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

  const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}분 ${seconds % 60}초`

  // 분석 결과에서 내 이름 강조용
  const isMe = (name: string) => name === userName

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

      {/* 공유된 의견 목록 */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <Users className="h-5 w-5 text-pine-700" />
              우리 팀의 의견
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              동료의 이름을 눌러 요약과 대화 기록을 자세히 살펴보세요.
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
          <ul className="divide-y divide-zinc-100">
            {conversations.map((conv) => (
              <li
                key={conv.id}
                onClick={() => router.push(`/conversation/${conv.id}`)}
                className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 transition-colors hover:bg-pine-50/50"
              >
                <div className="flex w-32 shrink-0 items-center gap-1.5">
                  <span className="font-semibold text-ink">{conv.userName}</span>
                  {conv.isMine && (
                    <span className="rounded-full bg-pine-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      나
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-800">
                    {conv.title || '(제목 없음)'}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {format(new Date(conv.createdAt), 'MM/dd HH:mm')} · {formatDuration(conv.duration)}
                    {conv.shareScope === 'summary_only' && ' · 요약만 공개'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {conv.revisionCount > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      <PenLine className="h-3 w-3" />
                      {conv.revisionCount}회 수정됨
                    </span>
                  )}
                  <span
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      conv.readerCount > 0
                        ? 'bg-pine-100 text-pine-800'
                        : 'bg-zinc-100 text-zinc-400'
                    }`}
                    title={conv.readerNames.join(', ')}
                  >
                    <CheckCheck className="h-3 w-3" />
                    {conv.readerCount}명 읽음
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 비교 분석 */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <GitCompareArrows className="h-5 w-5 text-pine-700" />
              의견 비교 분석
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              AI가 팀원들의 의견에서 공통점, 관점 차이, 각자의 고유한 아이디어를 찾아드립니다.
            </p>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={analyzing || conversations.length < 2}
            className="flex items-center gap-1.5 rounded-xl bg-pine-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-600 disabled:bg-zinc-300"
          >
            <RefreshCw className={`h-4 w-4 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? '분석 중…' : analysis ? '다시 분석하기' : '비교 분석 실행'}
          </button>
        </div>

        <div className="p-6">
          {conversations.length < 2 && (
            <p className="text-center text-sm text-zinc-500">
              2명 이상이 의견을 공유하면 비교 분석을 실행할 수 있습니다.
            </p>
          )}
          {analysisError && <p className="text-center text-sm text-red-600">{analysisError}</p>}
          {!analysis && conversations.length >= 2 && !analysisError && (
            <p className="text-center text-sm text-zinc-500">
              위의 &lsquo;비교 분석 실행&rsquo; 버튼을 눌러보세요.
            </p>
          )}

          {analysis && (
            <div className="space-y-6">
              {/* 공통점 */}
              {(analysis.commonPoints?.length || 0) > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold text-pine-800">우리가 공통으로 생각한 것</h3>
                  <div className="space-y-2">
                    {analysis.commonPoints!.map((cp, i) => (
                      <div key={i} className="rounded-xl bg-pine-50 px-4 py-3">
                        <p className="text-sm leading-relaxed text-zinc-800">{cp.point}</p>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {cp.users.map((u) => (
                            <span
                              key={u}
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                isMe(u)
                                  ? 'bg-pine-700 text-white'
                                  : 'bg-white text-pine-800 ring-1 ring-pine-200'
                              }`}
                            >
                              {u}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 차이점 비교표 */}
              {(analysis.differences?.length || 0) > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-bold text-amber-800">관점이 갈리는 지점</h3>
                  <div className="overflow-x-auto rounded-xl border border-zinc-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50 text-left">
                          <th className="px-4 py-2.5 font-semibold text-zinc-600">주제</th>
                          <th className="px-4 py-2.5 font-semibold text-zinc-600">입장 비교</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {analysis.differences!.map((diff, i) => (
                          <tr key={i} className="align-top">
                            <td className="w-40 px-4 py-3 font-medium text-ink">{diff.topic}</td>
                            <td className="px-4 py-3">
                              <ul className="space-y-1.5">
                                {diff.stances.map((s, j) => (
                                  <li key={j} className="flex gap-2 leading-snug">
                                    <span
                                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                        isMe(s.user)
                                          ? 'bg-pine-700 text-white'
                                          : 'bg-zinc-100 text-zinc-700'
                                      }`}
                                    >
                                      {s.user}
                                    </span>
                                    <span className="text-zinc-700">{s.position}</span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 고유 포인트 */}
              {(analysis.uniquePoints?.length || 0) > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-zinc-800">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    각자만 언급한 아이디어
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {analysis.uniquePoints!.map((up, i) => (
                      <div
                        key={i}
                        className={`rounded-xl border px-4 py-3 ${
                          isMe(up.user) ? 'border-pine-300 bg-pine-50' : 'border-zinc-200 bg-white'
                        }`}
                      >
                        <p className="mb-1 text-xs font-bold text-zinc-600">
                          {up.user}
                          {isMe(up.user) && ' (나)'}
                        </p>
                        <ul className="list-inside list-disc space-y-1 text-sm leading-snug text-zinc-700">
                          {up.points.map((p, j) => (
                            <li key={j}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 논의 질문 */}
              {(analysis.discussionQuestions?.length || 0) > 0 && (
                <div className="rounded-xl border border-dashed border-pine-300 bg-pine-50/50 px-4 py-3">
                  <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-bold text-pine-800">
                    <MessageCircleQuestion className="h-4 w-4" />
                    팀 토의에서 다뤄볼 질문
                  </h3>
                  <ul className="list-inside list-decimal space-y-1 text-sm leading-relaxed text-zinc-700">
                    {analysis.discussionQuestions!.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
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
