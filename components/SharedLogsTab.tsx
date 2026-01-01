'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

interface SharedLogsTabProps {
  userId: string
  sessionId: string
}

interface Conversation {
  id: string
  userName: string
  title: string
  summary: string
  createdAt: string
  duration: number
  turnCount: number
  pinCode?: string
}

export default function SharedLogsTab({ userId, sessionId }: SharedLogsTabProps) {
  const [allConversations, setAllConversations] = useState<Conversation[]>([])
  const [currentPinCode, setCurrentPinCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  const fetchConversations = async () => {
    try {
      console.log('Fetching conversations for sessionId:', sessionId)
      const response = await fetch(`/api/conversations/${sessionId}`)
      
      console.log('Response status:', response.status, response.statusText)
      
      if (!response.ok) {
        let errorData
        try {
          errorData = await response.json()
        } catch (e) {
          const text = await response.text()
          console.error('Failed to parse error response:', text)
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` }
        }
        console.error('Failed to fetch conversations:', errorData)
        // 에러가 발생해도 빈 배열로 설정하여 UI가 깨지지 않도록
        setAllConversations([])
        setCurrentPinCode(null)
        return
      }
      
      const data = await response.json()
      
      console.log('Fetched conversations data:', {
        totalConversations: data.conversations?.length || 0,
        currentPinCode: data.currentPinCode,
        conversations: data.conversations?.map((c: any) => ({
          id: c.id,
          title: c.title,
          pinCode: c.pinCode,
        })),
      })
      
      // 모든 공유된 대화를 저장
      setAllConversations(data.conversations || [])
      // 현재 세션의 PIN 번호 저장
      setCurrentPinCode(data.currentPinCode || null)
    } catch (error: any) {
      console.error('Failed to fetch conversations:', error)
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
      })
      // 에러가 발생해도 빈 배열로 설정하여 UI가 깨지지 않도록
      setAllConversations([])
      setCurrentPinCode(null)
    } finally {
      setLoading(false)
    }
  }

  // 현재 PIN 번호와 일치하는 대화만 필터링 (엑셀 필터처럼)
  const conversations = useMemo(() => {
    if (!currentPinCode) {
      console.log('No current PIN code, returning empty array')
      return []
    }
    
    const filtered = allConversations.filter((conv) => {
      const matches = conv.pinCode === currentPinCode
      if (!matches && conv.pinCode) {
        console.log('Filtered out conversation:', {
          id: conv.id,
          title: conv.title,
          convPinCode: conv.pinCode,
          currentPinCode,
        })
      }
      return matches
    })
    
    console.log('Filtered conversations:', {
      currentPinCode,
      allCount: allConversations.length,
      filteredCount: filtered.length,
      allConversations: allConversations.map(c => ({ id: c.id, pinCode: c.pinCode })),
    })
    
    return filtered
  }, [allConversations, currentPinCode])

  useEffect(() => {
    fetchConversations()
    // 5초마다 새로고침
    const interval = setInterval(fetchConversations, 5000)
    return () => clearInterval(interval)
  }, [sessionId])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}분 ${secs}초`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-zinc-600 dark:text-zinc-400">로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-white shadow-lg dark:bg-zinc-900">
      {currentPinCode && (
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            PIN 번호: <span className="font-bold text-black dark:text-zinc-50">{currentPinCode}</span>
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            전체 {allConversations.length}개 중 {conversations.length}개 대화 로그가 표시됩니다.
          </p>
        </div>
      )}
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
                대화 지속 시간
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {conversations.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  {currentPinCode 
                    ? `PIN 번호 ${currentPinCode}로 공유된 대화 로그가 없습니다. (전체 ${allConversations.length}개 중)`
                    : '공유된 대화 로그가 없습니다.'}
                </td>
              </tr>
            ) : (
              conversations.map((conv) => (
                <tr
                  key={conv.id}
                  onClick={() => router.push(`/conversation/${conv.id}`)}
                  className="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
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
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

