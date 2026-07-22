'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { UIMessage, DefaultChatTransport } from 'ai'
import { CheckCircle2, History, SendHorizontal, Sparkles } from 'lucide-react'

interface DebriefStepProps {
  userId: string
  sessionId: string
}

function uiMessageText(msg: UIMessage): string {
  const textParts = msg.parts?.filter((p: any) => p.type === 'text') || []
  return textParts.map((p: any) => p.text || '').join('')
}

export default function DebriefStep({ userId, sessionId }: DebriefStepProps) {
  const [input, setInput] = useState('')
  const [isFirstMessage, setIsFirstMessage] = useState(true)
  const [context, setContext] = useState<{ summary: string; teamDocument: string } | null>(null)
  const [finished, setFinished] = useState(false)
  const [saving, setSaving] = useState(false)
  const startTimeRef = useRef<number>(Date.now())
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 성찰 대화에 필요한 맥락(내 요약, 팀 공동 결론) 로드
  useEffect(() => {
    const fetchContext = async () => {
      let summary = ''
      let teamDocument = ''
      try {
        const convResponse = await fetch(`/api/conversations/${sessionId}?viewerId=${userId}`)
        if (convResponse.ok) {
          const data = await convResponse.json()
          const mine = (data.conversations || []).find((c: any) => c.isMine)
          summary = mine?.summary || ''
        }
      } catch (error) {
        console.error('Failed to fetch my summary:', error)
      }
      try {
        const docResponse = await fetch(`/api/team-document/${sessionId}`)
        if (docResponse.ok) {
          const data = await docResponse.json()
          teamDocument = data.content || ''
        }
      } catch (error) {
        console.error('Failed to fetch team document:', error)
      }
      setContext({ summary, teamDocument })
    }
    fetchContext()
  }, [sessionId, userId])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        headers: { 'Content-Type': 'application/json' },
        body: {
          data: {
            mode: 'debrief',
            isFirstMessage,
            sessionId,
            context: context || { summary: '', teamDocument: '' },
          },
        },
      }),
    [isFirstMessage, context, sessionId]
  )

  const { messages, sendMessage, status } = useChat<UIMessage>({
    transport: transport as any,
    messages: [],
    onError: (error: Error) => console.error('Debrief chat error:', error),
    onFinish: () => {
      if (isFirstMessage) setIsFirstMessage(false)
    },
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 맥락이 준비되면 AI가 먼저 성찰 질문을 시작
  useEffect(() => {
    if (context && isFirstMessage && messages.length === 0 && status === 'ready') {
      const timer = setTimeout(() => {
        try {
          sendMessage({ text: '' })
        } catch (error) {
          console.error('Failed to start debrief:', error)
        }
      }, 400)
      return () => clearTimeout(timer)
    }
  }, [context, isFirstMessage, messages.length, status, sendMessage])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    const userInput = input.trim()
    if (isFirstMessage) setIsFirstMessage(false)
    setInput('')
    sendMessage({ text: userInput })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isLoading) handleSubmit(e as any)
    }
  }

  const handleFinish = async () => {
    const cleanMessages = messages
      .map((msg) => ({ role: msg.role, content: uiMessageText(msg).trim() }))
      .filter((m) => m.content !== '')
    const userTurns = cleanMessages.filter((m) => m.role === 'user').length
    if (userTurns === 0) {
      alert('AI의 성찰 질문에 답한 뒤 완료해주세요.')
      return
    }
    setSaving(true)
    try {
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000)
      await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          messages: cleanMessages,
          kind: 'debrief',
          title: '성찰 대화',
          summary: '',
          duration,
          turnCount: userTurns,
        }),
      })
      setFinished(true)
    } catch (error) {
      console.error('Failed to save debrief:', error)
      alert('성찰 기록 저장에 실패했습니다. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  const displayMessages = messages.filter((msg) => {
    const content = uiMessageText(msg)
    return !(msg.role === 'user' && content.trim() === '')
  })

  if (finished) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-zinc-200/70 bg-white px-6 py-16 text-center shadow-sm">
        <CheckCircle2 className="mb-4 h-14 w-14 text-pine-600" strokeWidth={1.5} />
        <h2 className="mb-2 text-2xl font-bold text-ink">모든 단계를 완료했습니다!</h2>
        <p className="max-w-md leading-relaxed text-zinc-600">
          AI와의 대화, 동료와의 비교, 팀 공동 결론 작성, 성찰까지 모든 활동을 마쳤습니다. 성찰
          대화에서 정리한 &lsquo;추후 논의할 사항&rsquo;은 다음 수업/토의에서 활용해보세요.
        </p>
        <p className="mt-4 text-sm text-zinc-400">
          상단 단계 표시를 눌러 이전 단계의 내용을 언제든 다시 볼 수 있습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-10.5rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm">
      <div className="border-b border-zinc-100 px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          <History className="h-5 w-5 text-pine-700" />
          활동 돌아보기 (디브리핑)
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          AI와 함께 오늘의 활동을 점검하고, 생각의 변화와 추후 논의할 사항을 정리합니다.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto bg-zinc-50/50 p-6">
        {displayMessages.length === 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-pine-50 px-4 py-3 text-sm text-pine-800">
            <Sparkles className="h-4 w-4 shrink-0" />
            <p className="font-medium">
              {context ? 'AI가 성찰 질문을 시작합니다.' : '활동 내용을 불러오는 중…'}
            </p>
          </div>
        )}
        {displayMessages.map((message, index) => {
          const content = uiMessageText(message)
          return (
            <div
              key={message.id || index}
              className={`mb-4 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                  message.role === 'user'
                    ? 'rounded-br-md bg-pine-700 text-white'
                    : 'rounded-bl-md border border-zinc-200/70 bg-white text-zinc-800 shadow-sm'
                }`}
              >
                {content}
              </div>
            </div>
          )
        })}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-zinc-200/70 bg-white px-4 py-2.5 shadow-sm">
              <p className="text-sm text-zinc-500">AI가 입력 중…</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-zinc-100 p-4">
        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="생각을 자유롭게 적어보세요… (Enter: 전송, Shift+Enter: 줄바꿈)"
            rows={3}
            className="flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-[15px] text-ink placeholder:text-zinc-400 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl bg-pine-700 px-5 font-medium text-white transition-colors hover:bg-pine-600 disabled:bg-zinc-300"
          >
            <SendHorizontal className="h-4 w-4" />
            전송
          </button>
        </form>
        {displayMessages.filter((m) => m.role === 'user').length > 0 && (
          <button
            onClick={handleFinish}
            disabled={isLoading || saving}
            className="mt-3 w-full rounded-xl bg-ink px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {saving ? '저장 중…' : '성찰 마치고 활동 완료하기'}
          </button>
        )}
      </div>
    </div>
  )
}
