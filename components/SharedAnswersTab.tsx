'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

interface Conversation {
  id: string
  userName: string
  title: string
  summary: string
  createdAt: string
  duration: number
  pinCode?: string
}

interface SharedAnswersTabProps {
  userId: string
  sessionId: string
}

export default function SharedAnswersTab({ userId, sessionId }: SharedAnswersTabProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPinCode, setCurrentPinCode] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    fetchConversations()
  }, [sessionId])

  const fetchConversations = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/conversations/${sessionId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch conversations')
      }
      const data = await response.json()
      
      setCurrentPinCode(data.currentPinCode)
      
      // PIN 번호로 필터링
      const filtered = (data.conversations || []).filter(
        (conv: Conversation) => conv.pinCode === data.currentPinCode
      )
      
      setConversations(filtered)
    } catch (error) {
      console.error('Failed to fetch conversations:', error)
      setConversations([])
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}시간 ${minutes}분 ${secs}초`
    } else if (minutes > 0) {
      return `${minutes}분 ${secs}초`
    } else {
      return `${secs}초`
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-zinc-500">로딩 중...</p>
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="rounded-lg bg-white p-6 shadow dark:bg-zinc-900">
        <p className="text-center text-zinc-500">공유된 답변이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-white shadow dark:bg-zinc-900">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
                사용자 이름
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
                한 줄 요약
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
                공유 일시
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
                답변 작성 시간
              </th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((conv) => (
              <tr
                key={conv.id}
                onClick={() => router.push(`/conversation/${conv.id}`)}
                className="cursor-pointer border-b border-zinc-200 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
              >
                <td className="px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50">
                  {conv.userName}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50">
                  {conv.title || '(제목 없음)'}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {format(new Date(conv.createdAt), 'yyyy-MM-dd HH:mm')}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {formatDuration(conv.duration)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        총 {conversations.length}개의 답변이 공유되었습니다.
      </div>
    </div>
  )
}

