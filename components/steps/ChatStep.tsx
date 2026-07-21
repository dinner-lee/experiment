'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { UIMessage, DefaultChatTransport } from 'ai'
import { BotMessageSquare, CircleHelp, SendHorizontal, Sparkles } from 'lucide-react'

interface ChatStepProps {
  userId: string
  sessionId: string
  userName: string
  // 대화 종료 + 요약 생성 완료 시 conversationId를 전달
  onComplete: (conversationId: string) => void
}

function uiMessageText(msg: UIMessage): string {
  const textParts = msg.parts?.filter((p: any) => p.type === 'text') || []
  return textParts.map((p: any) => p.text || '').join('')
}

export default function ChatStep({ userId, sessionId, userName, onComplete }: ChatStepProps) {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [input, setInput] = useState('')
  const [isFirstMessage, setIsFirstMessage] = useState(true)
  const [showHelpTooltip, setShowHelpTooltip] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        headers: { 'Content-Type': 'application/json' },
        body: { data: { isFirstMessage } },
      }),
    [isFirstMessage]
  )

  const { messages, sendMessage, status } = useChat<UIMessage>({
    transport: transport as any,
    messages: [],
    onError: (error: Error) => {
      console.error('Chat error:', error)
    },
    onFinish: async () => {
      if (isFirstMessage) setIsFirstMessage(false)

      const allMessages = messages
        .map((msg) => ({ role: msg.role, content: uiMessageText(msg) }))
        .filter((m) => m.content.trim() !== '' && m.content !== '시작')

      if (!conversationId) {
        const response = await fetch('/api/conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            sessionId,
            messages: allMessages,
            startTime: startTime || Date.now(),
          }),
        })
        const data = await response.json()
        setConversationId(data.conversation.id)
        if (!startTime) setStartTime(Date.now())
      } else {
        const duration = Math.floor((Date.now() - (startTime || Date.now())) / 1000)
        await fetch('/api/conversation', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            messages: allMessages,
            duration,
            turnCount: allMessages.filter((m) => m.role === 'user').length,
          }),
        })
      }
    },
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 첫 진입 시 AI가 먼저 질문하도록 빈 메시지 전송
  useEffect(() => {
    if (isFirstMessage && messages.length === 0 && status === 'ready') {
      const timer = setTimeout(() => {
        try {
          sendMessage({ text: '' })
        } catch (error) {
          console.error('Failed to send initial message:', error)
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isFirstMessage, messages.length, status, sendMessage])

  const handleEndChat = async () => {
    const cleanMessages = messages
      .map((msg) => ({ role: msg.role, content: uiMessageText(msg).trim() }))
      .filter((m) => m.content !== '' && m.content !== '시작')

    const userTurns = cleanMessages.filter((m) => m.role === 'user').length
    if (userTurns === 0) {
      alert('대화 내용이 없습니다. 대화를 먼저 시작해주세요.')
      return
    }
    if (
      userTurns < 2 &&
      !confirm('아직 대화가 짧습니다. AI의 질문에 더 답하면 생각을 정교화할 수 있습니다.\n지금 종료하고 요약으로 넘어갈까요?')
    ) {
      return
    }

    setIsSummarizing(true)
    const actualStartTime = startTime || Date.now()
    let currentConversationId = conversationId

    try {
      if (!currentConversationId) {
        const response = await fetch('/api/conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            sessionId,
            messages: cleanMessages,
            startTime: actualStartTime,
          }),
        })
        if (!response.ok) throw new Error('대화 저장에 실패했습니다')
        const data = await response.json()
        currentConversationId = data.conversation.id
        setConversationId(currentConversationId)
      }

      const finalDuration = Math.floor((Date.now() - actualStartTime) / 1000)
      await fetch('/api/conversation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: currentConversationId,
          messages: cleanMessages,
          duration: finalDuration,
          turnCount: userTurns,
        }),
      })

      const summaryResponse = await fetch(`/api/conversation/${currentConversationId}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: cleanMessages }),
      })
      if (!summaryResponse.ok) {
        const errorData = await summaryResponse.json().catch(() => ({}))
        throw new Error(errorData.details || errorData.error || '요약 생성에 실패했습니다')
      }

      onComplete(currentConversationId!)
    } catch (error: any) {
      console.error('Failed to end chat:', error)
      alert(`처리에 실패했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setIsSummarizing(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.length > 0 && !startTime) setStartTime(Date.now())
    setInput(e.target.value)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    const userInput = input.trim()
    if (isFirstMessage) setIsFirstMessage(false)
    setInput('')
    try {
      sendMessage({ text: userInput })
    } catch (error) {
      console.error('Failed to send message:', error)
      setInput(userInput)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() && !isLoading) handleSubmit(e as any)
    }
  }

  const displayMessages = messages.filter((msg) => {
    const content = uiMessageText(msg)
    return !(msg.role === 'user' && (content === '시작' || content.trim() === ''))
  })

  return (
    <div className="flex h-[calc(100vh-10.5rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <BotMessageSquare className="h-5 w-5 text-pine-700" />
            AI와 대화하며 생각 정교화하기
          </h2>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowHelpTooltip(!showHelpTooltip)}
              onMouseEnter={() => setShowHelpTooltip(true)}
              onMouseLeave={() => setShowHelpTooltip(false)}
              className="flex h-5 w-5 items-center justify-center text-zinc-400 transition-colors hover:text-pine-700"
              aria-label="도움말"
            >
              <CircleHelp className="h-5 w-5" />
            </button>
            {showHelpTooltip && (
              <div className="absolute left-0 top-8 z-50 w-72 rounded-xl border border-zinc-200 bg-white p-3 text-sm leading-relaxed text-zinc-700 shadow-lg">
                챗봇은 생각을 정교화하는 데 도움이 될 만한 질문을 제시함으로써, 여러분의 아이디어
                발전을 돕도록 설계되었습니다. 특정 주제에 대한 아이디어를 충분히 정교화했다면,
                &lsquo;다른 주제&rsquo;라고 입력하면 다른 주제에 대해서 질문합니다.
              </div>
            )}
          </div>
        </div>
        <span className="text-sm text-zinc-500">{userName}</span>
      </div>

      <div className="flex-1 overflow-y-auto bg-zinc-50/50 p-6">
        {displayMessages.length === 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-pine-50 px-4 py-3 text-sm text-pine-800">
            <Sparkles className="h-4 w-4 shrink-0" />
            <p className="font-medium">AI가 먼저 질문을 시작합니다.</p>
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
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요… (Enter: 전송, Shift+Enter: 줄바꿈)"
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
        {displayMessages.length > 0 && (
          <button
            onClick={handleEndChat}
            disabled={isLoading || isSummarizing}
            className="mt-3 w-full rounded-xl bg-ink px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isSummarizing ? '대화를 요약하는 중…' : '대화 종료하고 요약 검토하기 →'}
          </button>
        )}
      </div>
    </div>
  )
}
