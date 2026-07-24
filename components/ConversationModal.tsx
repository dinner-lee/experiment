'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { EyeOff, X } from 'lucide-react'
import RichText from '@/components/RichText'

interface ModalConversationItem {
  id: string
  userName: string
  isMine: boolean
}

interface ConversationDetail {
  id: string
  user: { name: string }
  title: string
  summary: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  createdAt: string
  isOwner?: boolean
  messagesHidden?: boolean
  revisions?: { summary: string; editedAt: string }[]
}

interface ConversationModalProps {
  conversations: ModalConversationItem[] // 배지로 전환 가능한 대화 목록
  initialId: string
  viewerId: string
  sessionId: string
  colorOf: (name: string, idx: number) => string
  onClose: () => void
}

// 멤버별 의견을 페이지 이동 없이 보는 팝업 모달.
// 상단 멤버 배지를 눌러 다른 멤버의 로그로 바로 전환할 수 있다.
export default function ConversationModal({
  conversations,
  initialId,
  viewerId,
  sessionId,
  colorOf,
  onClose,
}: ConversationModalProps) {
  const [activeId, setActiveId] = useState(initialId)
  const [details, setDetails] = useState<Record<string, ConversationDetail>>({})
  const [loading, setLoading] = useState(false)

  // 열람 시간 기록 (연구 데이터): 대화 전환/닫기 시점에 직전 열람을 기록
  const viewRef = useRef<{ id: string; isMine: boolean; start: number } | null>(null)
  const flushView = useCallback(() => {
    const view = viewRef.current
    if (!view) return
    viewRef.current = null
    const duration = Math.floor((Date.now() - view.start) / 1000)
    if (!view.isMine && duration > 0) {
      fetch('/api/view-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewerId, conversationId: view.id, duration }),
      }).catch(console.error)
      // 동료 열람 표시 → 비교 단계의 수정 유도에 사용
      localStorage.setItem(`viewedPeer:${sessionId}:${viewerId}`, '1')
    }
  }, [viewerId, sessionId])

  useEffect(() => {
    const item = conversations.find((c) => c.id === activeId)
    flushView()
    viewRef.current = { id: activeId, isMine: !!item?.isMine, start: Date.now() }
  }, [activeId, conversations, flushView])

  useEffect(() => {
    return () => flushView()
  }, [flushView])

  // 상세 로드 (모달 내 캐시)
  useEffect(() => {
    if (details[activeId]) return
    let cancelled = false
    const fetchDetail = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/conversation/${activeId}?viewerId=${viewerId}`)
        const data = await response.json()
        if (cancelled || !data.conversation) return
        const conv = data.conversation
        if (!Array.isArray(conv.messages)) conv.messages = []
        setDetails((prev) => ({ ...prev, [activeId]: conv }))
      } catch (error) {
        console.error('Failed to fetch conversation detail:', error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchDetail()
    return () => {
      cancelled = true
    }
  }, [activeId, viewerId, details])

  // ESC로 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const detail = details[activeId]
  const revisions = Array.isArray(detail?.revisions) ? detail!.revisions! : []

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더: 멤버 전환 배지 */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {conversations.map((conv, i) => {
              const active = conv.id === activeId
              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-ink text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ backgroundColor: colorOf(conv.userName, i) }}
                  >
                    {conv.userName.substring(0, 1)}
                  </span>
                  {conv.userName}
                  {conv.isMine && <span className="text-[10px] opacity-70">(나)</span>}
                </button>
              )
            })}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-ink"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto p-6">
          {!detail && loading ? (
            <p className="py-16 text-center text-sm text-zinc-500">불러오는 중…</p>
          ) : !detail ? (
            <p className="py-16 text-center text-sm text-zinc-500">대화를 찾을 수 없습니다.</p>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl leading-snug text-ink">{detail.title}</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  <span className="font-semibold text-zinc-700">{detail.user.name}</span>
                  {' · '}
                  {format(new Date(detail.createdAt), 'yyyy년 MM월 dd일 HH:mm')}
                </p>
              </div>

              <div className="rounded-xl bg-pine-50/60 p-4">
                <h3 className="mb-1.5 text-sm font-bold text-pine-800">요약</h3>
                <p className="leading-relaxed text-zinc-700">{detail.summary}</p>
                {revisions.length > 0 && (
                  <details className="mt-3 rounded-lg bg-white/70 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-zinc-500">
                      최초 버전 보기
                    </summary>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                      {revisions[0].summary}
                    </p>
                  </details>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-sm font-bold text-ink">대화 로그</h3>
                {detail.messagesHidden ? (
                  <div className="flex items-center gap-2.5 rounded-xl bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
                    <EyeOff className="h-4 w-4 shrink-0" />
                    작성자가 요약만 공개하도록 설정했습니다.
                  </div>
                ) : detail.messages.length === 0 ? (
                  <p className="text-sm text-zinc-500">대화 로그가 없습니다.</p>
                ) : (
                  <div className="space-y-3">
                    {detail.messages.map((message, i) => {
                      const content = message.content || ''
                      if (!content.trim()) return null
                      return (
                        <div
                          key={i}
                          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                              message.role === 'user'
                                ? 'rounded-br-md bg-pine-700 text-white'
                                : 'rounded-bl-md border border-zinc-200/70 bg-zinc-50 text-zinc-800'
                            }`}
                          >
                            <RichText text={content} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
