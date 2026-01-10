'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import ChatTab from '@/components/ChatTab'
import SharedLogsTab from '@/components/SharedLogsTab'
import AnswerTab from '@/components/AnswerTab'
import SharedAnswersTab from '@/components/SharedAnswersTab'

export default function SessionPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const sessionId = params.sessionId as string
  // URL 쿼리 파라미터에서 탭 상태 읽기
  const tabFromUrl = searchParams.get('tab') as 'chat' | 'logs' | 'answer' | 'answers' | null
  const [activeTab, setActiveTab] = useState<'chat' | 'logs' | 'answer' | 'answers'>(
    tabFromUrl === 'logs' ? 'logs' : tabFromUrl === 'answer' ? 'answer' : tabFromUrl === 'answers' ? 'answers' : 'chat'
  )
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [hasAIChat, setHasAIChat] = useState<boolean | null>(null)
  const [showSharedAnswers, setShowSharedAnswers] = useState<boolean>(true)

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId')
    const storedUserName = localStorage.getItem('userName')
    if (storedUserId && storedUserName) {
      setUserId(storedUserId)
      setUserName(storedUserName)
    }
  }, [])

  useEffect(() => {
    // 세션의 AI 기능 활성화 여부 확인
    const fetchSessionInfo = async () => {
      try {
        const response = await fetch(`/api/session/${sessionId}/pin`)
        if (response.ok) {
          const data = await response.json()
          setHasAIChat(data.hasAIChat !== false) // 기본값은 true
          setShowSharedAnswers(data.showSharedAnswers !== false) // 기본값은 true
        }
      } catch (error) {
        console.error('Failed to fetch session info:', error)
        setHasAIChat(true) // 기본값
      }
    }
    fetchSessionInfo()
  }, [sessionId])

  // URL 쿼리 파라미터가 변경되면 탭 상태 업데이트
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'logs') {
      setActiveTab('logs')
    } else if (tab === 'chat') {
      setActiveTab('chat')
    } else if (tab === 'answer') {
      setActiveTab('answer')
    } else if (tab === 'answers') {
      setActiveTab('answers')
    } else if (hasAIChat === false) {
      // AI 기능이 비활성화된 경우 기본 탭은 'answer'
      setActiveTab('answer')
    }
  }, [searchParams, hasAIChat])

  if (!userId || !userName || hasAIChat === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>로딩 중...</p>
      </div>
    )
  }

  // AI 기능이 활성화된 경우
  if (hasAIChat) {
    return (
      <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
        <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-xl font-bold text-black dark:text-zinc-50">
              AI 대화 - {userName}
            </h1>
          </div>
        </header>

        <div className="container mx-auto flex-1 px-4 py-4">
          {/* 탭 네비게이션 */}
          <div className="mb-4 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'chat'
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              AI와 대화하기
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'logs'
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              대화 공유하기
            </button>
          </div>

          {/* 탭 컨텐츠 */}
          {activeTab === 'chat' ? (
            <ChatTab userId={userId} sessionId={sessionId} userName={userName} />
          ) : (
            <SharedLogsTab userId={userId} sessionId={sessionId} />
          )}
        </div>
      </div>
    )
  }

  // AI 기능이 비활성화된 경우
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-black dark:text-zinc-50">
            질문에 답하기 - {userName}
          </h1>
        </div>
      </header>

      <div className="container mx-auto flex-1 px-4 py-4">
        {/* 탭 네비게이션 */}
        <div className="mb-4 flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab('answer')}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'answer'
                ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            질문에 답하기
          </button>
          {showSharedAnswers && (
            <button
              onClick={() => setActiveTab('answers')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'answers'
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              답변 공유하기
            </button>
          )}
        </div>

        {/* 탭 컨텐츠 */}
        {activeTab === 'answer' ? (
          <AnswerTab userId={userId} sessionId={sessionId} userName={userName} />
        ) : (
          <SharedAnswersTab userId={userId} sessionId={sessionId} />
        )}
      </div>
    </div>
  )
}

