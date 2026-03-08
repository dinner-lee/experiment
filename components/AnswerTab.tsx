'use client'

import { useState, useEffect } from 'react'

interface AnswerTabProps {
  userId: string
  sessionId: string
  userName: string
}

const DEFAULT_QUESTION = '이 과제를 어떻게 해결하는 것이 좋을까요? 잠정적인 해결책을 제안하고, 그 이유를 설명하세요.'

export default function AnswerTab({ userId, sessionId, userName }: AnswerTabProps) {
  const [answer, setAnswer] = useState('')
  const [title, setTitle] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [question, setQuestion] = useState<string>(DEFAULT_QUESTION)
  const [loadingQuestion, setLoadingQuestion] = useState(true)
  const [showSummary, setShowSummary] = useState(false)
  const [summary, setSummary] = useState('')
  const [originalSummary, setOriginalSummary] = useState('')
  const [editMetadata, setEditMetadata] = useState({ charsDeleted: 0, charsAdded: 0 })
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [isSummarizing, setIsSummarizing] = useState(false)

  useEffect(() => {
    // 세션의 질문 가져오기
    const fetchQuestion = async () => {
      try {
        const response = await fetch(`/api/session/${sessionId}/pin`)
        if (response.ok) {
          const data = await response.json()
          if (data.question && data.question.trim() !== '') {
            setQuestion(data.question)
          }
        }
      } catch (error) {
        console.error('Failed to fetch question:', error)
        // 에러 발생 시 기본 질문 사용
      } finally {
        setLoadingQuestion(false)
      }
    }
    
    fetchQuestion()
  }, [sessionId])
  
  // 답변 입력 시작 시점 추적
  const handleAnswerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    
    // 첫 글자 입력 시점에 startTime 설정 (아직 설정되지 않은 경우)
    if (newValue.length > 0 && !startTime) {
      const inputStartTime = Date.now()
      setStartTime(inputStartTime)
      console.log('Answer input started, startTime set to:', inputStartTime)
    }
    
    setAnswer(newValue)
  }
  
  // 한 줄 요약 입력 시작 시점 추적
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    
    // 첫 글자 입력 시점에 startTime 설정 (아직 설정되지 않은 경우)
    if (newValue.length > 0 && !startTime) {
      const inputStartTime = Date.now()
      setStartTime(inputStartTime)
      console.log('Title input started, startTime set to:', inputStartTime)
    }
    
    setTitle(newValue)
  }

  const handleShare = async () => {
    if (!answer.trim()) {
      alert('답변을 입력해주세요.')
      return
    }

    if (!title.trim()) {
      alert('한 줄 요약을 입력해주세요.')
      return
    }

    setIsSubmitting(true)
    setIsSummarizing(true)
    try {
      const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0

      // 대화 생성 (AI 기능이 비활성화된 경우)
      // summary는 나중에 OpenAI API로 생성하므로 빈 문자열로 저장
      // messages에는 사용자가 입력한 원본 답변을 저장 (대화 로그에 표시하기 위함)
      const createResponse = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          messages: [
            {
              role: 'user',
              content: answer, // 사용자가 입력한 원본 답변을 messages에 저장
            },
          ],
          summary: '', // OpenAI API로 요약 생성할 예정이므로 빈 문자열
          title: title.trim(),
          duration,
          turnCount: 0, // AI 대화가 아니므로 턴 수는 0
        }),
      })

      if (!createResponse.ok) {
        throw new Error('답변 저장에 실패했습니다.')
      }

      const conversationData = await createResponse.json()
      const newConversationId = conversationData.conversation.id
      setConversationId(newConversationId)

      // OpenAI API를 활용해 한 문단으로 요약 생성 (AI 활성화 세션과 동일한 방식)
      // 사용자가 입력한 답변을 user 메시지로 변환하여 전달
      const summaryResponse = await fetch(`/api/conversation/${newConversationId}/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: answer,
            },
          ],
        }),
      })

      if (!summaryResponse.ok) {
        const errorData = await summaryResponse.json().catch(() => ({}))
        const errorMessage = errorData.details || errorData.error || '요약 생성에 실패했습니다'
        console.error('Summary API error:', errorData)
        throw new Error(errorMessage)
      }

      const summaryData = await summaryResponse.json()
      const aiGeneratedSummary = summaryData.conversation?.summary || answer // 요약 실패 시 원본 답변 사용

      // 요약 창 표시
      setSummary(aiGeneratedSummary)
      setOriginalSummary(aiGeneratedSummary)
      setShowSummary(true)
    } catch (error: any) {
      console.error('Failed to generate summary:', error)
      alert(error.message || '요약 생성에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
      setIsSummarizing(false)
    }
  }

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

  const handleFinalShare = async () => {
    if (!conversationId) {
      alert('대화 ID가 없습니다.')
      return
    }

    if (!summary.trim()) {
      alert('요약 내용을 입력해주세요.')
      return
    }

    setIsSubmitting(true)
    try {
      // PIN 코드 가져오기
      const pinResponse = await fetch(`/api/session/${sessionId}/pin`)
      if (!pinResponse.ok) {
        throw new Error('PIN 코드를 가져오는데 실패했습니다.')
      }
      const { pinCode } = await pinResponse.json()

      const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0

      // 답변 공유 (수정된 요약 사용)
      const shareResponse = await fetch(`/api/conversation/${conversationId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: summary.trim(),
          editMetadata,
          title: title.trim(),
          pinCode,
          duration,
          messages: [],
        }),
      })

      if (!shareResponse.ok) {
        throw new Error('답변 공유에 실패했습니다.')
      }

      // 초기화
      setAnswer('')
      setTitle('')
      setStartTime(null)
      setShowSummary(false)
      setSummary('')
      setOriginalSummary('')
      setEditMetadata({ charsDeleted: 0, charsAdded: 0 })
      setConversationId(null)

      alert('답변이 공유되었습니다.')
      
      // 답변 공유하기 탭으로 이동
      window.location.href = `/session/${sessionId}?tab=answers`
    } catch (error: any) {
      console.error('Failed to share answer:', error)
      alert(error.message || '답변 공유에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {showSummary ? (
        <div className="flex flex-1 flex-col rounded-lg bg-white p-6 shadow dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-black dark:text-zinc-50">
              답변 요약 검토 및 수정
            </h2>
            <button
              onClick={() => {
                setShowSummary(false)
                setSummary(originalSummary) // 원본으로 되돌리기
                setEditMetadata({ charsDeleted: 0, charsAdded: 0 })
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              aria-label="닫기"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <textarea
            value={summary}
            onChange={handleSummaryChange}
            className="mb-4 flex-1 rounded-md border border-zinc-300 p-4 text-black dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
            placeholder="요약 내용을 검토하고 수정하세요"
          />
          <div className="flex justify-end">
            <button
              onClick={handleFinalShare}
              disabled={isSubmitting || !summary.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
            >
              {isSubmitting ? '공유 중...' : '공유하기'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-lg bg-white p-6 shadow dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">질문</h2>
            {loadingQuestion ? (
              <p className="text-zinc-500 dark:text-zinc-400">질문을 불러오는 중...</p>
            ) : (
              <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{question}</p>
            )}
          </div>

          <div className="mb-4 flex-1 rounded-lg bg-white p-6 shadow dark:bg-zinc-900">
            <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">답변 작성</h2>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                답변 내용
              </label>
              <textarea
                value={answer}
                onChange={handleAnswerChange}
                placeholder="질문에 대한 답변을 작성해주세요"
                rows={15}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </div>
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                한 줄 요약(제목)
              </label>
              <input
                type="text"
                value={title}
                onChange={handleTitleChange}
                placeholder="답변의 핵심을 한 줄로 요약해주세요"
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </div>
            <button
              onClick={handleShare}
              disabled={isSubmitting || isSummarizing || !answer.trim() || !title.trim()}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
            >
              {isSummarizing ? '요약 생성 중...' : isSubmitting ? '처리 중...' : '답변 공유하기'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

