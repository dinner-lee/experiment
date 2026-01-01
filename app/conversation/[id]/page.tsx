'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format } from 'date-fns'

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
}

export default function ConversationDetailPage() {
  const params = useParams()
  const router = useRouter()
  const conversationId = params.id as string
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewStartTime, setViewStartTime] = useState<number | null>(null)
  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null
  const userName = typeof window !== 'undefined' ? localStorage.getItem('userName') : null
  
  // 수정 모드 상태
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [isEditingSummary, setIsEditingSummary] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [editedSummary, setEditedSummary] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  
  // 작성자인지 확인
  const isAuthor = conversation && userName && conversation.user.name === userName

  useEffect(() => {
    setViewStartTime(Date.now())
    fetchConversation()
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
            body: JSON.stringify({
              viewerId: userId,
              conversationId,
              duration,
            }),
          }).catch(console.error)
        }
      }
    }
  }, [viewStartTime, userId, conversationId])

  const fetchConversation = async () => {
    try {
      const response = await fetch(`/api/conversation/${conversationId}`)
      const data = await response.json()
      console.log('Fetched conversation:', data.conversation)
      console.log('Messages in response:', data.conversation?.messages)
      console.log('Messages type:', typeof data.conversation?.messages)
      console.log('Is array:', Array.isArray(data.conversation?.messages))
      
      if (data.conversation) {
        // messages가 배열이 아닌 경우 처리
        if (data.conversation.messages && !Array.isArray(data.conversation.messages)) {
          console.warn('Messages is not an array, attempting to parse:', data.conversation.messages)
          // JSON 문자열인 경우 파싱 시도
          if (typeof data.conversation.messages === 'string') {
            try {
              data.conversation.messages = JSON.parse(data.conversation.messages)
            } catch (e) {
              console.error('Failed to parse messages:', e)
              data.conversation.messages = []
            }
          } else {
            data.conversation.messages = []
          }
        }
        
        // messages가 없거나 null인 경우 빈 배열로 설정
        if (!data.conversation.messages) {
          console.warn('Messages is null or undefined, setting to empty array')
          data.conversation.messages = []
        }
        
        setConversation(data.conversation)
        // 수정용 초기값 설정
        setEditedTitle(data.conversation.title)
        setEditedSummary(data.conversation.summary)
      }
    } catch (error) {
      console.error('Failed to fetch conversation:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveTitle = async () => {
    if (!conversation || !userId || !editedTitle.trim()) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`/api/conversation/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editedTitle.trim(),
          userId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '제목 저장에 실패했습니다')
      }

      setConversation(data.conversation)
      setIsEditingTitle(false)
    } catch (error: any) {
      console.error('Failed to save title:', error)
      alert(`제목 저장에 실패했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveSummary = async () => {
    if (!conversation || !userId || !editedSummary.trim()) return
    
    setIsSaving(true)
    try {
      const response = await fetch(`/api/conversation/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: editedSummary.trim(),
          userId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '요약 저장에 실패했습니다')
      }

      setConversation(data.conversation)
      setIsEditingSummary(false)
    } catch (error: any) {
      console.error('Failed to save summary:', error)
      alert(`요약 저장에 실패했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelTitle = () => {
    setEditedTitle(conversation?.title || '')
    setIsEditingTitle(false)
  }

  const handleCancelSummary = () => {
    setEditedSummary(conversation?.summary || '')
    setIsEditingSummary(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    )
  }

  if (!conversation) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>대화를 찾을 수 없습니다.</p>
      </div>
    )
  }

  // messages 안전하게 처리
  const messages: Message[] = Array.isArray(conversation.messages) 
    ? conversation.messages 
    : []

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        {/* 뒤로가기 버튼 */}
        <div className="mb-4">
          <button
            onClick={() => {
              // 세션 페이지의 '대화 로그 공유 탭'으로 이동
              // conversation 객체에서 sessionId를 가져오거나, localStorage에서 가져오기
              const sessionId = conversation.sessionId || 
                (typeof window !== 'undefined' ? localStorage.getItem('sessionId') : null)
              
              if (sessionId) {
                router.push(`/session/${sessionId}?tab=logs`)
              } else {
                // sessionId가 없으면 브라우저 뒤로가기
                router.back()
              }
            }}
            className="flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2 text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            뒤로가기
          </button>
        </div>

        {/* 헤더 */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
          {isEditingTitle && isAuthor ? (
            <div className="mb-4">
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 text-3xl font-bold text-black focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                placeholder="제목을 입력하세요"
                disabled={isSaving}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleSaveTitle}
                  disabled={isSaving || !editedTitle.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
                >
                  저장
                </button>
                <button
                  onClick={handleCancelTitle}
                  disabled={isSaving}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div className="mb-4 flex items-start justify-between">
              <h1 className="text-3xl font-bold text-black dark:text-zinc-50">
                {conversation.title}
              </h1>
              {isAuthor && (
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="ml-4 rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  title="제목 수정"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l11.717-11.717zM16.862 4.487L19.5 7.125"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}
          <div className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
            <p>
              <span className="font-medium">사용자:</span> {conversation.user.name}
            </p>
            <p>
              <span className="font-medium">공유 일시:</span>{' '}
              {format(new Date(conversation.createdAt), 'yyyy년 MM월 dd일 HH:mm')}
            </p>
          </div>
        </div>

        {/* 요약 */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
          <div className="mb-3 flex items-start justify-between">
            <h2 className="text-xl font-bold text-black dark:text-zinc-50">요약</h2>
            {isAuthor && !isEditingSummary && (
              <button
                onClick={() => setIsEditingSummary(true)}
                className="ml-4 rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                title="요약 수정"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l11.717-11.717zM16.862 4.487L19.5 7.125"
                  />
                </svg>
              </button>
            )}
          </div>
          {isEditingSummary && isAuthor ? (
            <div>
              <textarea
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2 leading-relaxed text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                placeholder="요약을 입력하세요"
                rows={6}
                disabled={isSaving}
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleSaveSummary}
                  disabled={isSaving || !editedSummary.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
                >
                  저장
                </button>
                <button
                  onClick={handleCancelSummary}
                  disabled={isSaving}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <p className="leading-relaxed text-zinc-700 dark:text-zinc-300">
              {conversation.summary}
            </p>
          )}
        </div>

        {/* 대화 로그 */}
        <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
          <h2 className="mb-4 text-xl font-bold text-black dark:text-zinc-50">대화 로그</h2>
          {messages.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400">대화 로그가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => {
                // message.content가 없는 경우 처리
                const content = message.content || ''
                if (!content.trim()) return null
                
                return (
                  <div
                    key={index}
                    className={`flex ${
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
