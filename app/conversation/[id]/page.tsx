'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ArrowLeft, EyeOff, PenLine } from 'lucide-react'
import RichText from '@/components/RichText'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Conversation {
  id: string
  sessionId: string
  user: {
    name: string
  }
  title: string
  summary: string
  messages: Message[]
  createdAt: string
  duration: number
  isOwner?: boolean
  messagesHidden?: boolean
  revisions?: { summary: string; editedAt: string; reason?: string | null }[]
}

export default function ConversationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const conversationId = params.id as string
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewStartTime, setViewStartTime] = useState<number | null>(null)
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null

  // 수정 모드 상태 (작성자 본인)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isEditingSummary, setIsEditingSummary] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [editedSummary, setEditedSummary] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const isAuthor = !!conversation?.isOwner

  useEffect(() => {
    setViewStartTime(Date.now())
    fetchConversation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  useEffect(() => {
    // 컴포넌트 언마운트 시 열람 시간 기록
    return () => {
      if (viewStartTime && userId) {
        const duration = Math.floor((Date.now() - viewStartTime) / 1000)
        if (duration > 0) {
          fetch('/api/view-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ viewerId: userId, conversationId, duration }),
          }).catch(console.error)
        }
      }
    }
  }, [viewStartTime, userId, conversationId])

  // 동료의 대화를 열람했음을 기록 → 비교 단계로 돌아가면 수정 여부를 물어봄
  useEffect(() => {
    if (conversation && !conversation.isOwner && userId && conversation.sessionId) {
      localStorage.setItem(`viewedPeer:${conversation.sessionId}:${userId}`, '1')
    }
  }, [conversation, userId])

  const fetchConversation = async () => {
    try {
      const viewerParam = userId ? `?viewerId=${userId}` : ''
      const response = await fetch(`/api/conversation/${conversationId}${viewerParam}`)
      const data = await response.json()

      if (data.conversation) {
        if (data.conversation.messages && !Array.isArray(data.conversation.messages)) {
          if (typeof data.conversation.messages === 'string') {
            try {
              data.conversation.messages = JSON.parse(data.conversation.messages)
            } catch {
              data.conversation.messages = []
            }
          } else {
            data.conversation.messages = []
          }
        }
        if (!data.conversation.messages) data.conversation.messages = []

        setConversation(data.conversation)
        setEditedTitle(data.conversation.title)
        setEditedSummary(data.conversation.summary)
      }
    } catch (error) {
      console.error('Failed to fetch conversation:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (field: 'title' | 'summary') => {
    if (!conversation || !userId) return
    const value = field === 'title' ? editedTitle.trim() : editedSummary.trim()
    if (!value) return

    setIsSaving(true)
    try {
      const response = await fetch(`/api/conversation/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value, userId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '저장에 실패했습니다')
      setConversation({ ...conversation, ...data.conversation, isOwner: true })
      if (field === 'title') setIsEditingTitle(false)
      else setIsEditingSummary(false)
    } catch (error: any) {
      alert(`저장에 실패했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const goBack = () => {
    const sessionId =
      conversation?.sessionId ||
      (typeof window !== 'undefined' ? localStorage.getItem('sessionId') : null)
    if (sessionId) {
      router.push(`/session/${sessionId}?step=3`)
    } else {
      router.back()
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="text-zinc-500">로딩 중…</p>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="text-zinc-500">대화를 찾을 수 없습니다.</p>
      </div>
    )
  }

  const messages: Message[] = Array.isArray(conversation.messages) ? conversation.messages : []
  const revisions = Array.isArray(conversation.revisions) ? conversation.revisions : []

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <button
          onClick={goBack}
          className="mb-5 flex items-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          비교 단계로 돌아가기
        </button>

        {/* 헤더 */}
        <div className="mb-5 rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm">
          {isEditingTitle && isAuthor ? (
            <div className="mb-4">
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-4 py-2 text-2xl font-bold text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
                placeholder="제목을 입력하세요"
                disabled={isSaving}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => handleSave('title')}
                  disabled={isSaving || !editedTitle.trim()}
                  className="rounded-lg bg-pine-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-pine-600 disabled:bg-zinc-300"
                >
                  저장
                </button>
                <button
                  onClick={() => {
                    setEditedTitle(conversation.title)
                    setIsEditingTitle(false)
                  }}
                  disabled={isSaving}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-3 flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold leading-snug text-ink">{conversation.title}</h1>
              {isAuthor && (
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="shrink-0 rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 transition-colors hover:border-zinc-300 hover:text-ink"
                  title="제목 수정"
                >
                  <PenLine className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <p className="text-sm text-zinc-500">
            <span className="font-semibold text-zinc-700">{conversation.user.name}</span>
            {' · '}
            {format(new Date(conversation.createdAt), 'yyyy년 MM월 dd일 HH:mm')}
          </p>
        </div>

        {/* 요약 */}
        <div
          className="mb-5 rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm"
        >
          <div className="mb-3 flex items-start justify-between">
            <h2 className="text-lg font-bold text-ink">요약</h2>
            {isAuthor && !isEditingSummary && (
              <button
                onClick={() => setIsEditingSummary(true)}
                className="rounded-lg border border-zinc-200 bg-white p-2 text-zinc-500 transition-colors hover:border-zinc-300 hover:text-ink"
                title="요약 수정"
              >
                <PenLine className="h-4 w-4" />
              </button>
            )}
          </div>
          {isEditingSummary && isAuthor ? (
            <div>
              <textarea
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                className="w-full resize-y rounded-xl border border-zinc-200 px-4 py-3 leading-relaxed text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
                rows={6}
                disabled={isSaving}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => handleSave('summary')}
                  disabled={isSaving || !editedSummary.trim()}
                  className="rounded-lg bg-pine-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-pine-600 disabled:bg-zinc-300"
                >
                  저장
                </button>
                <button
                  onClick={() => {
                    setEditedSummary(conversation.summary)
                    setIsEditingSummary(false)
                  }}
                  disabled={isSaving}
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <p className="leading-relaxed text-zinc-700">{conversation.summary}</p>
          )}

          {/* 최초 버전 (수정된 경우에만 표시, 위 요약이 최종 버전) */}
          {revisions.length > 0 && (
            <details className="mt-4 rounded-xl bg-zinc-50 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-600">
                최초 버전 보기
              </summary>
              <div className="mt-3 border-l-2 border-zinc-300 pl-3">
                <p className="text-xs text-zinc-400">
                  {format(new Date(revisions[0].editedAt), 'MM/dd HH:mm')} 작성된 최초 버전
                </p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-600">{revisions[0].summary}</p>
              </div>
            </details>
          )}
        </div>

        {/* 대화 로그 */}
        <div
          className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm"
        >
          <h2 className="mb-4 text-lg font-bold text-ink">대화 로그</h2>
          {conversation.messagesHidden ? (
            <div className="flex items-center gap-2.5 rounded-xl bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
              <EyeOff className="h-4 w-4 shrink-0" />
              작성자가 요약만 공개하도록 설정했습니다.
            </div>
          ) : messages.length === 0 ? (
            <p className="text-zinc-500">대화 로그가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => {
                const content = message.content || ''
                if (!content.trim()) return null
                return (
                  <div
                    key={index}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
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

        {/* 동료 열람 시: 내 의견 수정 유도 (플로팅 패널은 루트 레이아웃에서 상시 표시) */}
        {!isAuthor && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pine-200 bg-pine-50 px-5 py-4">
            <p className="text-sm font-medium text-pine-800">
              동료의 생각에서 새로 알게 된 점이 있나요? 내 의견에 반영해보세요.
            </p>
            <button
              onClick={goBack}
              className="rounded-lg bg-pine-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-pine-600"
            >
              내 의견 수정하러 가기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
