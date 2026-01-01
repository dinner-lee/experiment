'use client'

import { useState, useEffect } from 'react'

interface AnswerTabProps {
  userId: string
  sessionId: string
  userName: string
}

const QUESTION = '이 과제를 어떻게 해결하는 것이 좋을까요? 잠정적인 해결책을 제안하고, 그 이유를 설명하세요.'

export default function AnswerTab({ userId, sessionId, userName }: AnswerTabProps) {
  const [answer, setAnswer] = useState('')
  const [title, setTitle] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [startTime, setStartTime] = useState<number | null>(null)

  useEffect(() => {
    // 답변 작성 시작 시간 기록
    setStartTime(Date.now())
  }, [])

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
    try {
      const duration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0

      // 대화 생성 (AI 기능이 비활성화된 경우)
      const createResponse = await fetch('/api/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          messages: [], // AI 대화가 아니므로 빈 배열
          summary: answer, // 사용자가 입력한 답변을 summary로 저장
          title: title.trim(),
          duration,
          turnCount: 0, // AI 대화가 아니므로 턴 수는 0
        }),
      })

      if (!createResponse.ok) {
        throw new Error('답변 저장에 실패했습니다.')
      }

      const conversationData = await createResponse.json()
      const conversationId = conversationData.conversation.id

      // PIN 코드 가져오기
      const pinResponse = await fetch(`/api/session/${sessionId}/pin`)
      if (!pinResponse.ok) {
        throw new Error('PIN 코드를 가져오는데 실패했습니다.')
      }
      const { pinCode } = await pinResponse.json()

      // 답변 공유
      const shareResponse = await fetch(`/api/conversation/${conversationId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: answer,
          title: title.trim(),
          pinCode,
          duration,
          messages: [],
        }),
      })

      if (!shareResponse.ok) {
        throw new Error('답변 공유에 실패했습니다.')
      }

      alert('답변이 공유되었습니다.')
      setAnswer('')
      setTitle('')
      setStartTime(Date.now())
      
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
      <div className="mb-4 rounded-lg bg-white p-6 shadow dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">질문</h2>
        <p className="text-zinc-700 dark:text-zinc-300">{QUESTION}</p>
      </div>

      <div className="mb-4 flex-1 rounded-lg bg-white p-6 shadow dark:bg-zinc-900">
        <h2 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">답변 작성</h2>
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            한 줄 요약
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="답변의 핵심을 한 줄로 요약해주세요"
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            답변 내용
          </label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="질문에 대한 답변을 작성해주세요"
            rows={15}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>
        <button
          onClick={handleShare}
          disabled={isSubmitting || !answer.trim() || !title.trim()}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
        >
          {isSubmitting ? '공유 중...' : '답변 공유하기'}
        </button>
      </div>
    </div>
  )
}

