'use client'

import { useState, useRef, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { useRouter } from 'next/navigation'
// import { format } from 'date-fns'
// import { ko } from 'date-fns/locale'

interface ChatTabProps {
  userId: string
  sessionId: string
  userName: string
}

export default function ChatTab({ userId, sessionId, userName }: ChatTabProps) {
  const router = useRouter()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [showSummary, setShowSummary] = useState(false)
  const [summary, setSummary] = useState('')
  const [isSharing, setIsSharing] = useState(false)
  const [isSummarizing, setIsSummarizing] = useState(false)
  const [editMetadata, setEditMetadata] = useState({ charsDeleted: 0, charsAdded: 0 })
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [isFirstMessage, setIsFirstMessage] = useState(true)

  const { messages, sendMessage, isLoading, setMessages, status } =
    useChat({
      api: '/api/chat',
      initialMessages: [],
      body: {
        isFirstMessage,
      },
      onResponse: (response) => {
        console.log('API response received:', response.status)
      },
      onError: (error) => {
        console.error('Chat error:', error)
      },
      onFinish: async (message) => {
        // 첫 메시지 이후로 플래그 변경
        if (isFirstMessage) {
          setIsFirstMessage(false)
        }

        // 대화 저장/업데이트 (시작 메시지 제외)
        // onFinish 시점에서 messages에는 이미 사용자 메시지와 AI 응답이 모두 포함됨
        const allMessages = messages
          .filter((msg) => {
            // UIMessage는 parts 배열을 사용
            const textParts = msg.parts?.filter((p: any) => p.type === 'text') || []
            const content = textParts.map((p: any) => p.text || '').join('')
            return !(msg.role === 'user' && content === '시작')
          })
          .map((msg) => {
            // UIMessage는 parts 배열을 사용
            const textParts = msg.parts?.filter((p: any) => p.type === 'text') || []
            const content = textParts.map((p: any) => p.text || '').join('')
            return {
              role: msg.role,
              content: content,
            }
          })
        
        if (!conversationId) {
          // 새 대화 생성
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
          // 대화 업데이트
          const duration = Math.floor((Date.now() - (startTime || Date.now())) / 1000)
          await fetch('/api/conversation', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId,
              messages: allMessages,
              duration,
              turnCount: allMessages.filter(m => m.role === 'user').length,
            }),
          })
        }
      },
    })

  useEffect(() => {
    console.log('Messages updated:', messages.length, messages)
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleEndChat = async () => {
    const filteredMessages = messages.filter((msg) => {
      // UIMessage는 parts 배열을 사용
      const textParts = msg.parts?.filter((p: any) => p.type === 'text') || []
      const content = textParts.map((p: any) => p.text || '').join('').trim()
      // 시작 메시지나 빈 메시지 제외
      return content !== '시작' && content !== ''
    })
    
    if (filteredMessages.length === 0) {
      alert('대화 내용이 없습니다. 대화를 먼저 시작해주세요.')
      return
    }

    // 요약 생성 시작
    setIsSummarizing(true)
    
    // conversationId가 없으면 먼저 대화를 저장
    let currentConversationId = conversationId
    const actualStartTime = startTime || Date.now()
    
    if (!currentConversationId) {
      try {
        const allMessages = filteredMessages.map((msg) => {
          const textParts = msg.parts?.filter((p: any) => p.type === 'text') || []
          const content = textParts.map((p: any) => p.text || '').join('').trim()
          return {
            role: msg.role,
            content: content,
          }
        }).filter((msg) => msg.content !== '') // 빈 메시지 제거
        
        console.log('Saving conversation with messages:', allMessages)
        
        if (allMessages.length === 0) {
          alert('저장할 대화 내용이 없습니다.')
          return
        }
        
        const response = await fetch('/api/conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            sessionId,
            messages: allMessages,
            startTime: actualStartTime,
          }),
        })
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || errorData.details || '대화 저장에 실패했습니다')
        }
        
        const data = await response.json()
        console.log('Conversation saved:', data)
        currentConversationId = data.conversation.id
        setConversationId(currentConversationId)
        if (!startTime) {
          setStartTime(actualStartTime)
        } else {
          setStartTime(Date.now())
        }
      } catch (error: any) {
        console.error('Failed to save conversation:', error)
        alert(`대화 저장에 실패했습니다: ${error.message || '알 수 없는 오류'}`)
        setIsSummarizing(false)
        return
      }
    }

    // 최종 duration 계산 및 업데이트
    const finalDuration = Math.floor((Date.now() - actualStartTime) / 1000)
    console.log('Calculated final duration:', finalDuration, 'seconds')
    
    try {
      // duration 업데이트
      await fetch('/api/conversation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: currentConversationId,
          messages: filteredMessages.map((msg) => {
            const textParts = msg.parts?.filter((p: any) => p.type === 'text') || []
            const content = textParts.map((p: any) => p.text || '').join('').trim()
            return {
              role: msg.role,
              content: content,
            }
          }).filter((msg) => msg.content !== ''),
          duration: finalDuration,
          turnCount: filteredMessages.filter((msg) => msg.role === 'user').length,
        }),
      })
      console.log('Duration updated:', finalDuration)
    } catch (error) {
      console.error('Failed to update duration:', error)
      // duration 업데이트 실패해도 계속 진행
    }

    try {
      // 클라이언트에서 직접 메시지 전달 (DB에 저장되지 않았을 수 있으므로)
      const messagesToSummarize = filteredMessages.map((msg) => {
        const textParts = msg.parts?.filter((p: any) => p.type === 'text') || []
        const content = textParts.map((p: any) => p.text || '').join('').trim()
        return {
          role: msg.role,
          content: content,
        }
      }).filter((msg) => msg.content !== '' && msg.content !== '시작')
      
      console.log('Sending messages to summary API:', messagesToSummarize)
      
      // 요약 생성 - 메시지를 직접 전달
      const response = await fetch(`/api/conversation/${currentConversationId}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesToSummarize,
        }),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.details || errorData.error || `HTTP ${response.status}: 요약 생성에 실패했습니다`
        console.error('Summary API error:', errorData)
        throw new Error(errorMessage)
      }
      
      const data = await response.json()
      console.log('Summary response:', data)
      
      if (!data.conversation) {
        console.error('Invalid response structure:', data)
        throw new Error('서버 응답 형식이 올바르지 않습니다')
      }
      
      if (!data.conversation.summary || data.conversation.summary.trim() === '') {
        console.error('Empty summary in response:', data)
        throw new Error('생성된 요약이 비어있습니다')
      }
      
      setSummary(data.conversation.summary)
      setOriginalSummary(data.conversation.summary)
      setShowSummary(true)
    } catch (error: any) {
      console.error('Failed to generate summary:', error)
      const errorMessage = error.message || '알 수 없는 오류가 발생했습니다'
      alert(`요약 생성에 실패했습니다: ${errorMessage}`)
    } finally {
      // 요약 생성 완료 (성공 또는 실패)
      setIsSummarizing(false)
    }
  }

  const handleShare = async () => {
    if (!conversationId) return

    setIsSharing(true)
    try {
      // 현재 세션의 PIN 번호 가져오기
      let currentPinCode: string | null = null
      try {
        const sessionResponse = await fetch(`/api/session/${sessionId}/pin`)
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json()
          currentPinCode = sessionData.pinCode || null
          console.log('Current PIN code:', currentPinCode)
        }
      } catch (error) {
        console.error('Failed to fetch PIN code:', error)
      }

      // 대화 로그 필터링 및 변환 (요약 생성 시와 동일한 로직)
      const filteredMessages = messages.filter((msg) => {
        const textParts = msg.parts?.filter((p: any) => p.type === 'text') || []
        const content = textParts.map((p: any) => p.text || '').join('').trim()
        return content !== '시작' && content !== ''
      })

      const messagesToShare = filteredMessages.map((msg) => {
        const textParts = msg.parts?.filter((p: any) => p.type === 'text') || []
        const content = textParts.map((p: any) => p.text || '').join('').trim()
        return {
          role: msg.role,
          content: content,
        }
      }).filter((msg) => msg.content !== '' && msg.content !== '시작')

      // 최종 duration 계산
      const actualStartTime = startTime || Date.now()
      const finalDuration = Math.floor((Date.now() - actualStartTime) / 1000)
      console.log('Calculated final duration for share:', finalDuration, 'seconds')
      console.log('Sharing conversation with messages:', messagesToShare)
      console.log('Sharing with PIN code:', currentPinCode)

      const response = await fetch(`/api/conversation/${conversationId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary,
          editMetadata,
          messages: messagesToShare,
          pinCode: currentPinCode, // PIN 번호 함께 전송
          duration: finalDuration, // 최종 duration 전송
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || '대화 공유에 실패했습니다')
      }

      const data = await response.json()
      console.log('Conversation shared successfully:', data.conversation?.id)
      console.log('Shared conversation data:', {
        id: data.conversation?.id,
        isShared: data.conversation?.isShared,
        title: data.conversation?.title,
        pinCode: data.conversation?.session?.pinCode,
      })

      // 대화 초기화
      setMessages([])
      setConversationId(null)
      setStartTime(null)
      setShowSummary(false)
      setSummary('')
      setEditMetadata({ charsDeleted: 0, charsAdded: 0 })
      setIsFirstMessage(true)

      // 공유 성공 알림 및 대화 로그 탭으로 이동
      alert('대화가 성공적으로 공유되었습니다!')
      // 대화 로그 공유 탭으로 이동하여 새로 공유된 대화 확인
      router.push(`/session/${sessionId}?tab=logs`)
    } catch (error: any) {
      console.error('Failed to share:', error)
      alert(`대화 공유에 실패했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setIsSharing(false)
    }
  }

  const [originalSummary, setOriginalSummary] = useState('')

  const handleSummaryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    setSummary(newValue)
    
    // 원본 요약과 비교하여 수정 메타데이터 계산
    if (originalSummary) {
      // 간단한 차이 계산 (더 정교한 diff 알고리즘을 사용할 수도 있음)
      const originalLength = originalSummary.length
      const newLength = newValue.length
      const lengthDiff = newLength - originalLength
      
      // 공통 부분을 제외한 추가/삭제 글자 수 추정
      let commonChars = 0
      const minLength = Math.min(originalLength, newLength)
      for (let i = 0; i < minLength; i++) {
        if (originalSummary[i] === newValue[i]) {
          commonChars++
        } else {
          break
        }
      }
      
      const charsDeleted = Math.max(0, originalLength - commonChars)
      const charsAdded = Math.max(0, newLength - commonChars)
      
      setEditMetadata({
        charsDeleted,
        charsAdded,
      })
    }
  }

  // 첫 메시지 자동 전송 - 빈 메시지를 보내서 API가 자동으로 질문을 시작하도록 함
  useEffect(() => {
    if (isFirstMessage && messages.length === 0 && !isLoading && status === 'ready') {
      console.log('Auto-triggering first AI message...', { status, isLoading, messagesLength: messages.length })
      const timer = setTimeout(() => {
        console.log('Sending empty message to trigger AI response')
        try {
          // 빈 메시지를 보내서 API가 자동으로 첫 질문을 시작하도록 함
          sendMessage({
            role: 'user',
            text: '',
          })
          console.log('Empty message sent successfully')
        } catch (error) {
          console.error('Failed to send initial message:', error)
        }
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isFirstMessage, messages.length, isLoading, sendMessage, status])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    
    const userInput = input.trim()
    console.log('Submitting message:', userInput)
    setInput('')
    try {
      sendMessage({
        role: 'user',
        text: userInput,
      })
      console.log('Message sent:', userInput)
    } catch (error) {
      console.error('Failed to send message:', error)
      setInput(userInput) // 실패 시 입력 복원
    }
  }

  // 실제 대화 메시지만 필터링 (시작 메시지 제외)
  const displayMessages = messages.filter((msg) => {
    // UIMessage는 parts 배열을 사용
    const textParts = msg.parts?.filter((p: any) => p.type === 'text') || []
    const content = textParts.map((p: any) => p.text).join('') || ''
    return !(msg.role === 'user' && content === '시작')
  })

  return (
    <div className="flex h-[calc(100vh-200px)] flex-col rounded-lg bg-white shadow-lg dark:bg-zinc-900">
      {showSummary ? (
        <div className="flex flex-1 flex-col p-6">
          <h2 className="mb-4 text-xl font-bold text-black dark:text-zinc-50">
            대화 요약 검토 및 수정
          </h2>
          <textarea
            value={summary}
            onChange={handleSummaryChange}
            className="mb-4 flex-1 rounded-md border border-zinc-300 p-4 text-black dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
            placeholder="요약 내용을 검토하고 수정하세요"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setShowSummary(false)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              취소
            </button>
            <button
              onClick={handleShare}
              disabled={isSharing}
              className="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
            >
              {isSharing ? '공유 중...' : '공유하기'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-6">
            {displayMessages.length === 0 && (
              <div className="mb-4 rounded-lg bg-blue-50 p-4 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                <p className="font-medium">AI가 먼저 질문을 시작합니다.</p>
              </div>
            )}
            {displayMessages.map((message, index) => {
              // UIMessage는 parts 배열을 사용 - 텍스트 파트만 추출
              const textParts = message.parts?.filter((p: any) => p.type === 'text') || []
              const content = textParts.map((p: any) => p.text || '').join('')
              
              return (
                <div
                  key={message.id || index}
                  className={`mb-4 flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{content}</p>
                  </div>
                </div>
              )
            })}
            {isLoading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-zinc-100 px-4 py-2 dark:bg-zinc-800">
                  <p className="text-zinc-600 dark:text-zinc-400">AI가 입력 중...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                value={input}
                onChange={handleInputChange}
                placeholder="메시지를 입력하세요..."
                className="flex-1 rounded-md border border-zinc-300 px-4 py-2 text-black dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="rounded-md bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
              >
                전송
              </button>
            </form>
            {displayMessages.length > 0 && (
              <button
                onClick={handleEndChat}
                disabled={isLoading || isSummarizing}
                className="mt-2 w-full rounded-md bg-green-600 px-4 py-2 text-white transition-colors hover:bg-green-700 disabled:bg-zinc-400 disabled:cursor-not-allowed"
              >
                {isSummarizing ? '대화 요약 중...' : '대화 종료 및 공유하기'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

