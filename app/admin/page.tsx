'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'

// Hydration 오류 억제 (브라우저 확장 프로그램으로 인한 오류)
if (typeof window !== 'undefined') {
  const originalError = console.error
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Hydration failed') &&
      args[0].includes('data-wxt-integrated')
    ) {
      // 브라우저 확장 프로그램으로 인한 hydration 오류는 무시
      return
    }
    originalError.apply(console, args)
  }
}

interface Session {
  pinCode: string
  id: string
  createdAt: string
  userCount: number
  conversationCount: number
}

interface Conversation {
  id: string
  userName: string
  title: string
  summary: string
  createdAt: string
  duration: number
  turnCount?: number
  pinCode?: string
}

interface UserLog {
  userId: string
  userName: string
  totalChatTurns: number
  totalChatDuration: number
  totalCharsDeleted: number
  totalCharsAdded: number
  selfViewDuration: number // 자신의 대화 로그 열람 시간
  otherViewDuration: number // 다른 동료의 대화 로그 열람 시간
  totalViewDuration: number // 총 열람 시간 (자신 + 다른 동료)
  selfViewCount: number // 자신의 대화 로그 열람 횟수
  otherViewCount: number // 다른 동료의 대화 로그 열람 횟수
  totalViewCount: number // 총 열람 횟수 (자신 + 다른 동료)
  viewCountByAuthor: string // JSON string
  conversationCount: number
}

export default function AdminPage() {
  const [pinCode, setPinCode] = useState('')
  const [hasAIChat, setHasAIChat] = useState(true) // 기본값은 AI 기능 활성화
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedPin, setSelectedPin] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [userLogs, setUserLogs] = useState<UserLog[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set())
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResults, setAnalysisResults] = useState<Array<{
    summaryIndex1: number
    summaryIndex2: number
    similarity: number
    sentenceCount1: number
    sentenceCount2: number
    sentences1: string[]
    sentences2: string[]
    similarityMatrix: number[][]
    similarityMatrixJtoI?: number[][]
    meanMaxItoJ?: number
    meanMaxJtoI?: number
    maxValuesItoJ?: number[]
    maxValuesJtoI?: number[]
    conversation1?: Conversation
    conversation2?: Conversation
  }> | null>(null)
  const [conceptGraph, setConceptGraph] = useState<{
    nodes: Array<{ id: string; label: string; summaryIndices: number[] }>
    edges: Array<{ source: string; target: string; similarity: number; weight: number; summaryIndices?: number[] }>
  } | null>(null)
  const [conceptsBySummary, setConceptsBySummary] = useState<string[][]>([])

  useEffect(() => {
    fetchSessions()
  }, [])

  const fetchSessions = async () => {
    try {
      const response = await fetch('/api/admin/pin')
      
      // 응답이 JSON인지 확인
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        console.error('Non-JSON response:', text)
        throw new Error('서버에서 예상치 못한 응답을 받았습니다.')
      }

      if (!response.ok) {
        let errorData
        try {
          errorData = await response.json()
        } catch (e) {
          const text = await response.text()
          console.error('Failed to parse error response:', text)
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` }
        }
        
        // 데이터베이스 연결 에러인 경우 빈 배열 반환 (API에서 이미 처리됨)
        if (response.status === 503 && errorData.error?.includes('데이터베이스')) {
          console.error('Database connection error:', errorData.error)
          setSessions([])
          alert('데이터베이스 연결에 실패했습니다. 연결 설정을 확인해주세요.')
          return
        }
        
        throw new Error(errorData.error || errorData.details || 'Failed to fetch sessions')
      }

      const data = await response.json()
      setSessions(data.sessions || [])
    } catch (error: any) {
      console.error('Failed to fetch sessions:', error)
      // 에러가 발생해도 빈 배열로 설정하여 UI가 깨지지 않도록
      setSessions([])
      // 사용자에게 알림 (중요한 에러인 경우에만)
      if (error.message && !error.message.includes('데이터베이스')) {
        console.warn('Session fetch error (non-critical):', error.message)
      }
    }
  }

  const generatePin = () => {
    const newPin = Math.floor(1000 + Math.random() * 9000).toString()
    setPinCode(newPin)
  }

  const createPin = async () => {
    if (!pinCode) {
      alert('PIN 코드를 입력하세요')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/admin/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinCode, hasAIChat }),
      })

      // 응답이 JSON인지 확인
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        console.error('Non-JSON response:', text)
        throw new Error('서버에서 예상치 못한 응답을 받았습니다. 데이터베이스 연결을 확인해주세요.')
      }

      if (!response.ok) {
        const data = await response.json()
        const errorMessage = data.error || 'Failed to create PIN'
        const errorDetails = data.details ? `\n\n상세 정보: ${data.details}` : ''
        throw new Error(errorMessage + errorDetails)
      }

      const data = await response.json()
      setPinCode('')
      setHasAIChat(true) // 기본값으로 리셋
      fetchSessions()
      alert('PIN이 성공적으로 생성되었습니다.')
    } catch (error: any) {
      console.error('Create PIN error:', error)
      const errorMessage = error.message || 'PIN 생성에 실패했습니다.'
      alert(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const deletePin = async (pin: string) => {
    if (!confirm(`PIN ${pin}을(를) 삭제하시겠습니까?`)) return

    try {
      const response = await fetch(`/api/admin/pin?pinCode=${pin}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete PIN')
      }

      fetchSessions()
      if (selectedPin === pin) {
        setSelectedPin(null)
        setConversations([])
      }
    } catch (error) {
      alert('PIN 삭제에 실패했습니다.')
    }
  }

  const fetchSessionInfo = async (pin: string) => {
    setSelectedPin(pin)
    try {
      // 모든 공유된 대화를 가져와서 PIN 번호로 필터링 (SharedLogsTab과 동일한 방식)
      // 먼저 해당 PIN의 세션 ID를 찾기
      const sessionResponse = await fetch(`/api/admin/sessions/${pin}`)
      if (!sessionResponse.ok) {
        throw new Error('Failed to fetch session')
      }
      const sessionData = await sessionResponse.json()
      const sessionId = sessionData.session.id
      
      console.log('Admin: Fetching conversations for PIN:', pin, 'SessionId:', sessionId)
      
      // 모든 공유된 대화 가져오기
      const conversationsResponse = await fetch(`/api/conversations/${sessionId}`)
      if (!conversationsResponse.ok) {
        throw new Error('Failed to fetch conversations')
      }
      const conversationsData = await conversationsResponse.json()
      
      console.log('Admin: Fetched conversations data:', {
        totalConversations: conversationsData.conversations?.length || 0,
        currentPinCode: conversationsData.currentPinCode,
        targetPin: pin,
        conversations: conversationsData.conversations?.map((c: any) => ({
          id: c.id,
          title: c.title,
          pinCode: c.pinCode,
        })),
      })
      
      // PIN 번호로 필터링 (타입 변환 포함)
      const allConversations = conversationsData.conversations || []
      console.log('Admin: All conversations before filtering:', allConversations.length)
      console.log('Admin: Sample conversation:', allConversations[0])
      
      const filteredConversations = allConversations.filter(
        (conv: any) => {
          // PIN 번호를 문자열로 변환하여 비교 (타입 불일치 방지)
          const convPinCode = String(conv.pinCode || '').trim()
          const targetPin = String(pin || '').trim()
          const matches = convPinCode === targetPin && convPinCode !== ''
          
          if (!matches && conv.pinCode) {
            console.log('Admin: Filtered out conversation:', {
              id: conv.id,
              title: conv.title,
              convPinCode: conv.pinCode,
              convPinCodeString: convPinCode,
              targetPin: pin,
              targetPinString: targetPin,
              matches,
            })
          }
          return matches
        }
      )
      
      console.log('Admin: Filtered conversations:', {
        targetPin: pin,
        allCount: conversationsData.conversations?.length || 0,
        filteredCount: filteredConversations.length,
      })
      
      setConversations(filteredConversations)
    } catch (error) {
      console.error('Failed to fetch session info:', error)
      setConversations([])
    }
  }

  const fetchUserLogs = async (pin: string) => {
    try {
      const response = await fetch(`/api/admin/logs/${pin}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.details || errorData.error || `HTTP ${response.status}: 로그 데이터를 불러오는데 실패했습니다`
        console.error('Failed to fetch user logs:', errorData)
        throw new Error(errorMessage)
      }
      const data = await response.json()
      if (!data.logs) {
        console.error('Invalid response structure:', data)
        throw new Error('서버 응답 형식이 올바르지 않습니다')
      }
      setUserLogs(data.logs || [])
      setShowLogs(true)
    } catch (error: any) {
      console.error('Failed to fetch user logs:', error)
      const errorMessage = error.message || '알 수 없는 오류가 발생했습니다'
      alert(`로그 데이터를 불러오는데 실패했습니다: ${errorMessage}`)
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

  const handleConversationToggle = (conversationId: string) => {
    const newSelected = new Set(selectedConversations)
    if (newSelected.has(conversationId)) {
      newSelected.delete(conversationId)
    } else {
      newSelected.add(conversationId)
    }
    setSelectedConversations(newSelected)
    setAnalysisResults(null) // 선택이 변경되면 결과 초기화
  }

  const handleSelectAll = () => {
    if (selectedConversations.size === conversations.length) {
      setSelectedConversations(new Set())
    } else {
      setSelectedConversations(new Set(conversations.map(c => c.id)))
    }
    setAnalysisResults(null)
  }

  const handleAnalyze = async () => {
    if (selectedConversations.size < 2) {
      alert('최소 2개 이상의 대화 로그를 선택해주세요.')
      return
    }

    setIsAnalyzing(true)
    setAnalysisResults(null)

    try {
      // 선택된 대화 로그의 요약 추출 (순서 유지)
      const selectedConversationsList = conversations.filter(c => selectedConversations.has(c.id))
      const selectedSummaries = selectedConversationsList.map(c => c.summary || '')
      
      console.log('Admin: Selected conversations:', selectedConversationsList.map(c => ({
        id: c.id,
        userName: c.userName,
        title: c.title,
        summary: c.summary,
        summaryLength: c.summary?.length || 0,
      })))
      console.log('Admin: Summaries to analyze:', selectedSummaries)
      console.log('Admin: Summary lengths:', selectedSummaries.map(s => s.length))

      const response = await fetch('/api/admin/analyze-similarity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summaries: selectedSummaries }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.details || '분석에 실패했습니다')
      }

      const data = await response.json()
      console.log('Admin: Analysis response:', data)
      console.log('Admin: Results:', data.results)
      console.log('Admin: Concept graph:', data.conceptGraph)
      console.log('Admin: Concept graph nodes:', data.conceptGraph?.nodes?.length || 0)
      console.log('Admin: Concept graph edges:', data.conceptGraph?.edges?.length || 0)
      console.log('Admin: Sample edges:', data.conceptGraph?.edges?.slice(0, 10))
      console.log('Admin: Concepts by summary:', data.conceptsBySummary)
      console.log('Admin: Full concept graph data:', JSON.stringify(data.conceptGraph, null, 2))
      console.log('Admin: All edges with details:', data.conceptGraph?.edges?.map((e: any) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        similarity: e.similarity,
        summaryIndices: e.summaryIndices,
      })))
      
      // 결과에 선택된 대화 로그 정보 추가
      const resultsWithConversations = (data.results || []).map((result: any) => {
        console.log('Admin: Processing result:', result)
        return {
          ...result,
          conversation1: selectedConversationsList[result.summaryIndex1],
          conversation2: selectedConversationsList[result.summaryIndex2],
        }
      })
      console.log('Admin: Final results with conversations:', resultsWithConversations)
      setAnalysisResults(resultsWithConversations)
      setConceptGraph(data.conceptGraph || null)
      setConceptsBySummary(data.conceptsBySummary || [])
    } catch (error: any) {
      console.error('Failed to analyze similarity:', error)
      alert(`유사도 분석에 실패했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const downloadLogs = async (pin: string) => {
    try {
      const response = await fetch(`/api/admin/logs/${pin}?format=csv`)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `session-${pin}-logs.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      alert('로그 다운로드에 실패했습니다.')
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black" suppressHydrationWarning>
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold text-black dark:text-zinc-50">관리자 화면</h1>

        {/* PIN 관리 */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
          <h2 className="mb-4 text-xl font-bold text-black dark:text-zinc-50">PIN 번호 관리</h2>
          <div className="mb-4 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                placeholder="PIN 코드 (4자리 숫자)"
                className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
              />
              <button
                onClick={generatePin}
                className="rounded-md border border-zinc-300 px-4 py-2 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                랜덤 생성
              </button>
              <button
                onClick={createPin}
                disabled={loading}
                className="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
              >
                생성
              </button>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={hasAIChat}
                  onChange={() => setHasAIChat(true)}
                  className="h-4 w-4 text-blue-600"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  AI와 대화하기 기능 활성화
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!hasAIChat}
                  onChange={() => setHasAIChat(false)}
                  className="h-4 w-4 text-blue-600"
                />
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  질문에 답하기 기능 (AI 비활성화)
                </span>
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    PIN 코드
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    생성 일시
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    참여 인원
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    공유 대화 수
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td className="px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50">
                      {session.pinCode}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {format(new Date(session.createdAt), 'yyyy-MM-dd HH:mm')}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {session.userCount}명
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                      {session.conversationCount}개
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => fetchSessionInfo(session.pinCode)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                        >
                          상세
                        </button>
                        <button
                          onClick={() => fetchUserLogs(session.pinCode)}
                          className="text-purple-600 hover:text-purple-800 dark:text-purple-400"
                        >
                          로그
                        </button>
                        <button
                          onClick={() => downloadLogs(session.pinCode)}
                          className="text-green-600 hover:text-green-800 dark:text-green-400"
                        >
                          CSV
                        </button>
                        <button
                          onClick={() => deletePin(session.pinCode)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 선택된 PIN의 대화 로그 */}
        {selectedPin && (
          <div className="mb-8 rounded-lg bg-white shadow-lg dark:bg-zinc-900">
            {selectedPin && (
              <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      PIN 번호: <span className="font-bold text-black dark:text-zinc-50">{selectedPin}</span>
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {conversations.length}개 대화 로그가 표시됩니다.
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedPin(null)}
                    className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    닫기
                  </button>
                </div>
              </div>
            )}
            {conversations.length > 0 && (
              <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedConversations.size === conversations.length && conversations.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-zinc-700 dark:text-zinc-300">
                        전체 선택 ({selectedConversations.size}/{conversations.length})
                      </span>
                    </label>
                    <button
                      onClick={handleAnalyze}
                      disabled={selectedConversations.size < 2 || isAnalyzing}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors"
                    >
                      {isAnalyzing ? '분석 중...' : '분석'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium text-zinc-700 dark:text-zinc-300 w-12">
                      선택
                    </th>
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
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                        PIN 번호 {selectedPin}로 공유된 대화 로그가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    conversations.map((conv) => (
                      <tr
                        key={conv.id}
                        className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedConversations.has(conv.id)}
                            onChange={() => handleConversationToggle(conv.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                        </td>
                        <td 
                          className="px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50 cursor-pointer"
                          onClick={() => window.open(`/conversation/${conv.id}`, '_blank')}
                        >
                          {conv.userName}
                        </td>
                        <td 
                          className="px-4 py-3 text-sm text-zinc-900 dark:text-zinc-50 cursor-pointer"
                          onClick={() => window.open(`/conversation/${conv.id}`, '_blank')}
                        >
                          {conv.title || '(제목 없음)'}
                        </td>
                        <td 
                          className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer"
                          onClick={() => window.open(`/conversation/${conv.id}`, '_blank')}
                        >
                          {format(new Date(conv.createdAt), 'yyyy-MM-dd HH:mm')}
                        </td>
                        <td 
                          className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400 cursor-pointer"
                          onClick={() => window.open(`/conversation/${conv.id}`, '_blank')}
                        >
                          {formatDuration(conv.duration || 0)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {analysisResults && analysisResults.length > 0 && (
              <div className="border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
                <h4 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
                  유사도 분석 결과
                </h4>
                <div className="space-y-6">
                  {analysisResults.map((result, idx) => {
                    const conv1 = result.conversation1
                    const conv2 = result.conversation2
                    const similarityPercent = (result.similarity * 100).toFixed(2)
                    const sentences1 = result.sentences1 || []
                    const sentences2 = result.sentences2 || []
                    const matrix = result.similarityMatrix || []
                    
                    // 히트맵 색상 계산 함수
                    const getHeatmapColor = (value: number) => {
                      // 0~1 값을 0~255로 변환
                      const intensity = Math.round(value * 255)
                      // 파란색(낮음) -> 노란색(중간) -> 빨간색(높음)
                      if (value < 0.5) {
                        // 파란색에서 노란색으로
                        const ratio = value * 2
                        return `rgb(${Math.round(ratio * 255)}, ${Math.round(ratio * 255)}, ${Math.round(255 * (1 - ratio))})`
                      } else {
                        // 노란색에서 빨간색으로
                        const ratio = (value - 0.5) * 2
                        return `rgb(255, ${Math.round(255 * (1 - ratio))}, 0)`
                      }
                    }
                    
                    // 원문에 문장 번호 추가 함수
                    const addSentenceNumbers = (text: string, sentences: string[]) => {
                      let result = text
                      sentences.forEach((sentence, idx) => {
                        const numbered = `(${idx + 1})${sentence}`
                        result = result.replace(sentence, numbered)
                      })
                      return result
                    }
                    
                    return (
                      <div
                        key={idx}
                        className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                      >
                        {/* 1. 유사도 분석 결과 */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                <span className="font-semibold">{conv1?.userName || `대화 ${result.summaryIndex1 + 1}`}</span>
                                {' ↔ '}
                                <span className="font-semibold">{conv2?.userName || `대화 ${result.summaryIndex2 + 1}`}</span>
                              </p>
                              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                문장 수: {result.sentenceCount1}개 ↔ {result.sentenceCount2}개
                              </p>
                            </div>
                            <div className="ml-4 text-right">
                              <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                {similarityPercent}%
                              </p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">유사도</p>
                            </div>
                          </div>
                          <div className="mt-2 h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
                            <div
                              className="h-2 rounded-full bg-blue-600 transition-all"
                              style={{ width: `${similarityPercent}%` }}
                            />
                          </div>
                          
                          {/* 양방향 MeanMax 평균 계산 설명 */}
                          {result.meanMaxItoJ !== undefined && result.meanMaxJtoI !== undefined && (
                            <div className="mt-3 rounded-md bg-blue-50 p-3 text-xs dark:bg-blue-900/20">
                              <p className="mb-1 font-medium text-blue-900 dark:text-blue-200">
                                양방향 MeanMax 평균 계산 방법:
                              </p>
                              <ul className="ml-4 list-disc space-y-1 text-blue-800 dark:text-blue-300">
                                <li>
                                  <span className="font-medium">{conv1?.userName || 'A'}</span> → <span className="font-medium">{conv2?.userName || 'B'}</span> MeanMax: 
                                  {' '}
                                  <span className="font-semibold">{(result.meanMaxItoJ * 100).toFixed(2)}%</span>
                                  {' '}
                                  ({conv1?.userName || 'A'}의 각 문장에서 {conv2?.userName || 'B'}의 문장들 중 최대 유사도의 평균)
                                </li>
                                <li>
                                  <span className="font-medium">{conv2?.userName || 'B'}</span> → <span className="font-medium">{conv1?.userName || 'A'}</span> MeanMax: 
                                  {' '}
                                  <span className="font-semibold">{(result.meanMaxJtoI * 100).toFixed(2)}%</span>
                                  {' '}
                                  ({conv2?.userName || 'B'}의 각 문장에서 {conv1?.userName || 'A'}의 문장들 중 최대 유사도의 평균)
                                </li>
                                <li>
                                  최종 유사도 = ({conv1?.userName || 'A'}→{conv2?.userName || 'B'} MeanMax + {conv2?.userName || 'B'}→{conv1?.userName || 'A'} MeanMax) ÷ 2
                                  {' '}
                                  = ({(result.meanMaxItoJ * 100).toFixed(2)}% + {(result.meanMaxJtoI * 100).toFixed(2)}%) ÷ 2
                                  {' '}
                                  = <span className="font-semibold">{similarityPercent}%</span>
                                </li>
                              </ul>
                            </div>
                          )}
                        </div>
                        
                        {/* 2. 유사도 행렬 히트맵 (양방향 통합) */}
                        {matrix.length > 0 && sentences1.length > 0 && sentences2.length > 0 && (
                          <div className="mb-4">
                            <h5 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                              유사도 행렬 (히트맵) - 양방향 MeanMax 계산
                            </h5>
                            <div className="overflow-x-auto">
                              <div className="inline-block min-w-full">
                                <table className="border-collapse">
                                  <thead>
                                    <tr>
                                      <th className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                        {conv1?.userName || 'A'} \ {conv2?.userName || 'B'}
                                      </th>
                                      {sentences2.map((_, colIdx) => {
                                        // 각 열의 최대값 계산 (B→A MeanMax용)
                                        const colMaxValue = result.maxValuesJtoI?.[colIdx] ?? Math.max(...matrix.map(row => row[colIdx]))
                                        return (
                                          <th
                                            key={colIdx}
                                            className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                                            title={`문장 ${colIdx + 1}`}
                                          >
                                            {colIdx + 1}
                                          </th>
                                        )
                                      })}
                                      <th className="border border-zinc-300 bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 dark:border-zinc-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                                        행 최대값<br/>(A→B)
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {matrix.map((row, rowIdx) => {
                                      const maxValue = result.maxValuesItoJ?.[rowIdx] ?? Math.max(...row)
                                      const maxColIdx = row.indexOf(Math.max(...row))
                                      return (
                                        <tr key={rowIdx}>
                                          <td className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                            {rowIdx + 1}
                                          </td>
                                          {row.map((value, colIdx) => {
                                            const color = getHeatmapColor(value)
                                            const textColor = value > 0.5 ? 'white' : 'black'
                                            const isRowMax = colIdx === maxColIdx
                                            // 각 열의 최대값 확인 (B→A MeanMax용)
                                            const colMaxValue = result.maxValuesJtoI?.[colIdx] ?? Math.max(...matrix.map(r => r[colIdx]))
                                            const isColMax = Math.abs(value - colMaxValue) < 0.0001
                                            return (
                                              <td
                                                key={colIdx}
                                                className={`border px-2 py-1 text-center text-xs dark:border-zinc-700 ${
                                                  isRowMax && isColMax
                                                    ? 'border-2 border-orange-500 dark:border-orange-400' // 양방향 모두 최대값
                                                    : isRowMax
                                                    ? 'border-2 border-yellow-400 dark:border-yellow-500' // 행 최대값 (A→B)
                                                    : isColMax
                                                    ? 'border-2 border-green-400 dark:border-green-500' // 열 최대값 (B→A)
                                                    : 'border-zinc-300'
                                                }`}
                                                style={{
                                                  backgroundColor: color,
                                                  color: textColor,
                                                }}
                                                title={`${conv1?.userName || 'A'} 문장 ${rowIdx + 1} ↔ ${conv2?.userName || 'B'} 문장 ${colIdx + 1}: ${(value * 100).toFixed(1)}%${isRowMax ? ' (행 최대값)' : ''}${isColMax ? ' (열 최대값)' : ''}`}
                                              >
                                                {(value * 100).toFixed(0)}
                                              </td>
                                            )
                                          })}
                                          <td className="border border-zinc-300 bg-yellow-50 px-2 py-1 text-center text-xs font-semibold text-yellow-800 dark:border-zinc-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                                            {(maxValue * 100).toFixed(1)}%
                                          </td>
                                        </tr>
                                      )
                                    })}
                                    {/* 열 최대값 행 (B→A MeanMax 계산용) */}
                                    <tr>
                                      <td className="border border-zinc-300 bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:border-zinc-700 dark:bg-green-900/30 dark:text-green-300">
                                        열 최대값<br/>(B→A)
                                      </td>
                                      {sentences2.map((_, colIdx) => {
                                        const colMaxValue = result.maxValuesJtoI?.[colIdx] ?? Math.max(...matrix.map(row => row[colIdx]))
                                        return (
                                          <td
                                            key={colIdx}
                                            className="border border-zinc-300 bg-green-50 px-2 py-1 text-center text-xs font-semibold text-green-800 dark:border-zinc-700 dark:bg-green-900/30 dark:text-green-300"
                                          >
                                            {(colMaxValue * 100).toFixed(1)}%
                                          </td>
                                        )
                                      })}
                                      <td className="border border-zinc-300 bg-zinc-100 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"></td>
                                    </tr>
                                  </tbody>
                                  <tfoot>
                                    <tr>
                                      <td className="border border-zinc-300 bg-blue-50 px-2 py-1 text-center text-xs font-semibold text-blue-800 dark:border-zinc-700 dark:bg-blue-900/30 dark:text-blue-300">
                                        평균 (MeanMax)
                                      </td>
                                      <td colSpan={sentences2.length} className="border border-zinc-300 bg-blue-50 px-2 py-1 text-center text-xs font-semibold text-blue-800 dark:border-zinc-700 dark:bg-blue-900/30 dark:text-blue-300">
                                        <div className="flex items-center justify-center gap-4">
                                          <span>
                                            {conv1?.userName || 'A'}→{conv2?.userName || 'B'}: <span className="font-bold">{(result.meanMaxItoJ !== undefined ? (result.meanMaxItoJ * 100).toFixed(2) : '0.00')}%</span>
                                          </span>
                                          <span>|</span>
                                          <span>
                                            {conv2?.userName || 'B'}→{conv1?.userName || 'A'}: <span className="font-bold">{(result.meanMaxJtoI !== undefined ? (result.meanMaxJtoI * 100).toFixed(2) : '0.00')}%</span>
                                          </span>
                                        </div>
                                      </td>
                                      <td className="border border-zinc-300 bg-purple-100 px-2 py-1 text-center text-xs font-bold text-purple-800 dark:border-zinc-700 dark:bg-purple-900/30 dark:text-purple-300">
                                        최종: {similarityPercent}%
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            </div>
                            <div className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                              <p>
                                <span className="font-semibold text-yellow-600 dark:text-yellow-400">노란색 테두리</span>: 각 행의 최대값 ({conv1?.userName || 'A'}→{conv2?.userName || 'B'} MeanMax 계산용)
                              </p>
                              <p>
                                <span className="font-semibold text-green-600 dark:text-green-400">초록색 테두리</span>: 각 열의 최대값 ({conv2?.userName || 'B'}→{conv1?.userName || 'A'} MeanMax 계산용)
                              </p>
                              <p>
                                <span className="font-semibold text-orange-600 dark:text-orange-400">주황색 테두리</span>: 행과 열 모두 최대값인 경우
                              </p>
                              <p className="mt-2">
                                최종 유사도 = ({(result.meanMaxItoJ !== undefined ? (result.meanMaxItoJ * 100).toFixed(2) : '0.00')}% + {(result.meanMaxJtoI !== undefined ? (result.meanMaxJtoI * 100).toFixed(2) : '0.00')}%) ÷ 2 = <span className="font-semibold">{similarityPercent}%</span>
                              </p>
                            </div>
                          </div>
                        )}
                        
                        {/* 3. 원문에 문장 번호 표시 */}
                        <div className="space-y-3">
                          <div>
                            <h5 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                              {conv1?.userName || `대화 ${result.summaryIndex1 + 1}`}의 요약
                            </h5>
                            <div className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50">
                              {sentences1.map((sentence, sIdx) => (
                                <span key={sIdx}>
                                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                                    ({sIdx + 1})
                                  </span>
                                  {sentence}
                                  {sIdx < sentences1.length - 1 && ' '}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h5 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                              {conv2?.userName || `대화 ${result.summaryIndex2 + 1}`}의 요약
                            </h5>
                            <div className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-900 dark:bg-zinc-50 dark:bg-zinc-900">
                              {sentences2.map((sentence, sIdx) => (
                                <span key={sIdx}>
                                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                                    ({sIdx + 1})
                                  </span>
                                  {sentence}
                                  {sIdx < sentences2.length - 1 && ' '}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            {/* 개념 그래프 */}
            {conceptGraph && conceptGraph.nodes.length > 0 && (
              <div className="border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
                <h4 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
                  개념 그래프
                </h4>
                <div className="mb-3 rounded-md bg-blue-50 p-3 text-xs dark:bg-blue-900/20">
                  <p className="mb-1 font-medium text-blue-900 dark:text-blue-200">
                    개념 그래프 생성 과정:
                  </p>
                  <ol className="ml-4 list-decimal space-y-1 text-blue-800 dark:text-blue-300">
                    <li>문단 → 개념 추출: 각 요약에서 핵심 개념 추출</li>
                    <li>개념 임베딩: 각 개념을 벡터로 변환</li>
                    <li>유사도 계산: 개념 간 코사인 유사도 계산</li>
                    <li>임계값 필터링: 유사도 0.5 이상인 개념 쌍만 선택</li>
                    <li>개념 그래프 생성: 노드(개념)와 엣지(관계)로 구성</li>
                  </ol>
                </div>
                
                {/* 개념 목록 */}
                <div className="mb-4">
                  <h5 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    추출된 개념 목록
                  </h5>
                  <div className="space-y-2">
                    {conceptsBySummary.map((concepts, idx) => {
                      const conv = conversations.find(c => selectedConversations.has(c.id))
                      const selectedList = conversations.filter(c => selectedConversations.has(c.id))
                      const actualConv = selectedList[idx]
                      return (
                        <div key={idx} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                          <p className="mb-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                            {actualConv?.userName || `대화 ${idx + 1}`}:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {concepts.length > 0 ? (
                              concepts.map((concept, cIdx) => (
                                <span
                                  key={cIdx}
                                  className="rounded-md bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                >
                                  {concept}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-zinc-500">개념 추출 실패</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
                
                {/* 그래프 시각화 */}
                <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                  <h5 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    개념 관계 그래프 (하이브리드 점수: 의미 유사도 + 공기)
                  </h5>
                  <div className="overflow-auto" style={{ minHeight: '500px' }}>
                    <svg
                      width="100%"
                      height="500"
                      viewBox="0 0 800 500"
                      className="border border-zinc-200 dark:border-zinc-800 bg-white"
                    >
                      {/* 간단한 force-directed layout 시뮬레이션 */}
                      {(() => {
                        // 사용자별 색상 정의
                        const userColors = [
                          '#3b82f6', // 파란색
                          '#ef4444', // 빨간색
                          '#10b981', // 초록색
                          '#f59e0b', // 주황색
                          '#8b5cf6', // 보라색
                          '#ec4899', // 핑크색
                          '#06b6d4', // 청록색
                          '#f97316', // 오렌지색
                        ]
                        
                        const nodePositions: Record<string, { x: number; y: number }> = {}
                        const centerX = 400
                        const centerY = 250
                        const primaryRadius = 100
                        const secondaryRadius = 200
                        
                        // 선택된 대화 로그 목록 가져오기
                        const selectedList = conversations.filter(c => selectedConversations.has(c.id))
                        
                        // 노드 위치 계산 (Force-directed 레이아웃 시뮬레이션)
                        // 주요 개념(여러 사용자에 속한 개념)은 중앙에, 보조 개념은 주변에 배치
                        const primaryNodes = conceptGraph.nodes.filter(n => n.summaryIndices.length > 1)
                        const secondaryNodes = conceptGraph.nodes.filter(n => n.summaryIndices.length === 1)
                        
                        // 주요 개념들을 중앙에 배치
                        primaryNodes.forEach((node, idx) => {
                          if (primaryNodes.length === 1) {
                            nodePositions[node.id] = { x: centerX, y: centerY }
                          } else if (primaryNodes.length === 2) {
                            // 2개면 좌우로 배치
                            nodePositions[node.id] = {
                              x: centerX + (idx === 0 ? -primaryRadius : primaryRadius),
                              y: centerY,
                            }
                          } else {
                            const angle = (idx / primaryNodes.length) * 2 * Math.PI
                            nodePositions[node.id] = {
                              x: centerX + primaryRadius * Math.cos(angle),
                              y: centerY + primaryRadius * Math.sin(angle),
                            }
                          }
                        })
                        
                        // 보조 개념들을 주변에 배치
                        secondaryNodes.forEach((node, idx) => {
                          const angle = (idx / secondaryNodes.length) * 2 * Math.PI
                          nodePositions[node.id] = {
                            x: centerX + secondaryRadius * Math.cos(angle),
                            y: centerY + secondaryRadius * Math.sin(angle),
                          }
                        })
                        
                        return (
                          <>
                            {/* 엣지 그리기 - 연결된 두 개념의 공통 사용자 색상으로 표시 */}
                            {(() => {
                              console.log('Rendering edges. Total edges:', conceptGraph.edges.length)
                              console.log('Sample edges:', conceptGraph.edges.slice(0, 5))
                              
                              const allEdgeElements: React.ReactElement[] = []
                              
                              // 노드 ID로 노드 정보를 빠르게 찾기 위한 맵 생성
                              const nodeMap = new Map<string, typeof conceptGraph.nodes[0]>()
                              conceptGraph.nodes.forEach(node => {
                                nodeMap.set(node.id, node)
                              })
                              
                              conceptGraph.edges.forEach((edge, edgeIdx) => {
                                const sourceNode = nodeMap.get(edge.source)
                                const targetNode = nodeMap.get(edge.target)
                                
                                if (!sourceNode || !targetNode) {
                                  console.log('Missing node for edge:', edge.source, edge.target)
                                  return
                                }
                                
                                const source = nodePositions[edge.source]
                                const target = nodePositions[edge.target]
                                
                                if (!source || !target) {
                                  console.log('Missing position for edge:', edge.source, edge.target)
                                  return
                                }
                                
                                // 두 개념의 공통 사용자 찾기
                                const sourceUsers = new Set(sourceNode.summaryIndices)
                                const targetUsers = new Set(targetNode.summaryIndices)
                                const commonUsers = sourceNode.summaryIndices.filter(userIdx => targetUsers.has(userIdx))
                                
                                if (commonUsers.length === 0) {
                                  // 공통 사용자가 없으면 엣지를 표시하지 않음 (이론적으로는 발생하지 않아야 함)
                                  console.warn('Edge with no common users:', edge.source, edge.target)
                                  return
                                }
                                
                                // 엣지 강도에 따라 스타일 결정
                                // combinedScore가 높으면 강한 관계(두꺼운 선), 낮으면 약한 관계(얇은 선)
                                const combinedScore = (edge as any).combinedScore || edge.weight || 0
                                const isStrongEdge = combinedScore >= 0.5 || (edge as any).cooccurrenceCount > 0
                                const baseStrokeWidth = isStrongEdge ? Math.max(3, combinedScore * 6) : 1.5 // 강한 관계: 3-6px, 약한 관계: 1.5px
                                const opacity = isStrongEdge ? 0.8 : 0.4
                                
                                // 엣지 방향 벡터 계산 (오프셋을 위한 수직 벡터 계산에 사용)
                                const dx = target.x - source.x
                                const dy = target.y - source.y
                                const length = Math.sqrt(dx * dx + dy * dy)
                                
                                if (length === 0) return
                                
                                // 수직 방향 벡터 (엣지에 수직인 방향)
                                const perpX = -dy / length
                                const perpY = dx / length
                                
                                // 공통 사용자가 여러 명이면 각 사용자별로 엣지를 약간 오프셋해서 그리기
                                if (commonUsers.length > 1) {
                                  const offsetSpacing = 2 // 각 엣지 간 간격
                                  const totalOffset = (commonUsers.length - 1) * offsetSpacing
                                  const startOffset = -totalOffset / 2
                                  
                                  commonUsers.forEach((userIdx, userOffsetIdx) => {
                                    const offset = startOffset + userOffsetIdx * offsetSpacing
                                    const offsetX = perpX * offset
                                    const offsetY = perpY * offset
                                    
                                    const userColor = userColors[userIdx % userColors.length]
                                    
                                    allEdgeElements.push(
                                      <line
                                        key={`edge-${edgeIdx}-user${userIdx}`}
                                        x1={source.x + offsetX}
                                        y1={source.y + offsetY}
                                        x2={target.x + offsetX}
                                        y2={target.y + offsetY}
                                        stroke={userColor}
                                        strokeWidth={baseStrokeWidth}
                                        opacity={opacity}
                                        strokeLinecap="round"
                                      />
                                    )
                                  })
                                } else {
                                  // 공통 사용자가 한 명이면 하나의 엣지만 그리기
                                  const userIdx = commonUsers[0]
                                  const userColor = userColors[userIdx % userColors.length]
                                  
                                  allEdgeElements.push(
                                    <line
                                      key={`edge-${edgeIdx}`}
                                      x1={source.x}
                                      y1={source.y}
                                      x2={target.x}
                                      y2={target.y}
                                      stroke={userColor}
                                      strokeWidth={baseStrokeWidth}
                                      opacity={opacity}
                                      strokeLinecap="round"
                                    />
                                  )
                                }
                              })
                              
                              console.log('Total edge elements to render:', allEdgeElements.length)
                              return allEdgeElements
                            })()}
                            
                            {/* 노드 그리기 - 사용자별 색상, 주요 개념은 크게, 보조 개념은 작게 */}
                            {conceptGraph.nodes.map((node) => {
                              const pos = nodePositions[node.id]
                              if (!pos) return null
                              
                              const numUsers = node.summaryIndices.length
                              const isPrimary = numUsers > 1 // 여러 사용자에 속한 개념 = 주요 개념
                              
                              // 주요 개념: 큰 노드, 보조 개념: 작은 노드
                              const nodeRadius = isPrimary ? 25 : 18
                              const fontWeight = isPrimary ? 'bold' : 'normal'
                              const fontSize = isPrimary ? 11 : 9
                              
                              return (
                                <g key={node.id}>
                                  {numUsers > 0 ? (
                                    numUsers === 1 ? (
                                      // 단일 사용자: 해당 사용자 색상으로 표시
                                      <circle
                                        cx={pos.x}
                                        cy={pos.y}
                                        r={nodeRadius}
                                        fill={userColors[node.summaryIndices[0] % userColors.length]}
                                        stroke="#fff"
                                        strokeWidth={isPrimary ? 3 : 2}
                                      />
                                    ) : (
                                      // 여러 사용자: 원을 사용자 수에 따라 나눠서 각 사용자 색상으로 표시
                                      node.summaryIndices.map((summaryIdx, userIdx) => {
                                        const startAngle = (userIdx / numUsers) * 2 * Math.PI - Math.PI / 2 // -90도부터 시작
                                        const endAngle = ((userIdx + 1) / numUsers) * 2 * Math.PI - Math.PI / 2
                                        
                                        // SVG path로 원의 일부(섹터) 그리기
                                        const startX = pos.x + nodeRadius * Math.cos(startAngle)
                                        const startY = pos.y + nodeRadius * Math.sin(startAngle)
                                        const endX = pos.x + nodeRadius * Math.cos(endAngle)
                                        const endY = pos.y + nodeRadius * Math.sin(endAngle)
                                        
                                        // 각 섹터의 각도는 항상 360/numUsers도이므로 180도 이하입니다
                                        // 따라서 largeArcFlag는 항상 0 (작은 호)
                                        const largeArcFlag = 0
                                        
                                        const pathData = [
                                          `M ${pos.x} ${pos.y}`, // 중심으로 이동
                                          `L ${startX} ${startY}`, // 시작점으로 선 그리기
                                          `A ${nodeRadius} ${nodeRadius} 0 ${largeArcFlag} 1 ${endX} ${endY}`, // 호 그리기
                                          'Z', // 닫기
                                        ].join(' ')
                                        
                                        return (
                                          <path
                                            key={`sector-${userIdx}`}
                                            d={pathData}
                                            fill={userColors[summaryIdx % userColors.length]}
                                            stroke="#fff"
                                            strokeWidth={isPrimary ? 3 : 2}
                                          />
                                        )
                                      })
                                    )
                                  ) : (
                                    // 사용자 없음: 회색
                                    <circle
                                      cx={pos.x}
                                      cy={pos.y}
                                      r={nodeRadius}
                                      fill="#9ca3af"
                                      stroke="#fff"
                                      strokeWidth={isPrimary ? 3 : 2}
                                    />
                                  )}
                                  
                                  {/* 노드 라벨 */}
                                  <text
                                    x={pos.x}
                                    y={pos.y + 5}
                                    textAnchor="middle"
                                    fontSize={fontSize}
                                    fill={isPrimary ? '#ffffff' : '#1f2937'}
                                    fontWeight={fontWeight}
                                    className="pointer-events-none"
                                    style={{ textShadow: isPrimary ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none' }}
                                  >
                                    {node.label.length > 12 ? node.label.substring(0, 12) + '...' : node.label}
                                  </text>
                                </g>
                              )
                            })}
                          </>
                        )
                      })()}
                    </svg>
                  </div>
                  
                  <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    <p>
                      노드: <span className="font-semibold">{conceptGraph.nodes.length}개</span> 개념 | 
                      엣지: <span className="font-semibold">{conceptGraph.edges.length}개</span> 관계
                    </p>
                    <div className="mt-2 space-y-1">
                      <p className="font-medium text-zinc-700 dark:text-zinc-300">사용자별 색상:</p>
                      {(() => {
                        const selectedList = conversations.filter(c => selectedConversations.has(c.id))
                        const userColors = [
                          '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
                          '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
                        ]
                        return selectedList.map((conv, idx) => (
                          <p key={conv.id} className="ml-2">
                            <span
                              className="inline-block w-3 h-3 rounded-full mr-1"
                              style={{ backgroundColor: userColors[idx % userColors.length] }}
                            ></span>
                            {conv.userName || `대화 ${idx + 1}`}
                          </p>
                        ))
                      })()}
                    </div>
                    <p className="mt-2">
                      <span className="font-semibold">노드:</span>
                    </p>
                    <ul className="ml-4 mt-1 list-disc space-y-1 text-xs">
                      <li>
                        <span className="font-semibold">큰 노드 (굵은 텍스트):</span> 주요 개념 (여러 사용자에 속한 개념) - 사용자별 색상을 섹터로 나눠서 표시
                      </li>
                      <li>
                        <span className="font-semibold">작은 노드 (일반 텍스트):</span> 보조 개념 (단일 사용자에 속한 개념) - 해당 사용자 색상으로 표시
                      </li>
                    </ul>
                    <p className="mt-2">
                      <span className="font-semibold">엣지:</span>
                    </p>
                    <ul className="ml-4 mt-1 list-disc space-y-1 text-xs">
                      <li>
                        <span className="font-semibold">두꺼운 선:</span> 강한 관계 (하이브리드 점수 ≥ 0.5 또는 공기 발생) - 사용자별 색상
                      </li>
                      <li>
                        <span className="font-semibold">얇은 선:</span> 약한 관계 (하이브리드 점수 &lt; 0.5) - 사용자별 색상 (투명도 낮음)
                      </li>
                    </ul>
                    <div className="mt-2 rounded-md bg-zinc-50 p-3 dark:bg-zinc-800/50">
                      <p className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        하이브리드 점수 산출 방식:
                      </p>
                      <div className="ml-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                        <p>
                          <span className="font-semibold">1. 의미 유사도 (임베딩 기반):</span>
                        </p>
                        <ul className="ml-4 mt-1 list-disc space-y-0.5">
                          <li>두 개념의 임베딩 벡터 간 코사인 유사도 계산</li>
                          <li>범위: 0 ~ 1 (1에 가까울수록 의미적으로 유사)</li>
                          <li>모델: Xenova/paraphrase-multilingual-MiniLM-L12-v2</li>
                        </ul>
                        <p className="mt-2">
                          <span className="font-semibold">2. 공기 점수 (Co-occurrence):</span>
                        </p>
                        <ul className="ml-4 mt-1 list-disc space-y-0.5">
                          <li>두 개념이 같은 문장에 등장한 횟수에 비례</li>
                          <li>각 등장마다 0.1씩 추가</li>
                          <li>최대 0.3 (3회 이상 등장해도 0.3으로 제한)</li>
                          <li>예: 같은 문장에 2회 등장 → 0.2점, 5회 등장 → 0.3점</li>
                        </ul>
                        <p className="mt-2">
                          <span className="font-semibold">3. 하이브리드 점수:</span>
                        </p>
                        <p className="ml-4 font-mono">
                          하이브리드 점수 = 의미 유사도 + 공기 점수
                        </p>
                        <p className="ml-4 mt-1 text-xs">
                          예: 의미 유사도 0.4 + 공기 점수 0.2 = 하이브리드 점수 0.6
                        </p>
                        <p className="mt-2 text-xs italic text-zinc-500 dark:text-zinc-500">
                          * 하이브리드 점수는 "의미적으로 유사한" 관계와 "같은 맥락에서 함께 언급되는" 관계를 모두 포착합니다.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 사용자별 상세 로그 */}
        {showLogs && userLogs.length > 0 && (
          <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-black dark:text-zinc-50">
                사용자별 활동 로그
              </h2>
              <button
                onClick={() => setShowLogs(false)}
                className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                닫기
              </button>
            </div>
            <div className="space-y-6">
              {userLogs.map((log) => {
                const viewCountByAuthor = JSON.parse(log.viewCountByAuthor || '{}')
                return (
                  <div
                    key={log.userId}
                    className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                  >
                    <h3 className="mb-3 text-lg font-semibold text-black dark:text-zinc-50">
                      {log.userName}
                    </h3>
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          대화 턴 수
                        </p>
                        <p className="text-lg font-bold text-black dark:text-zinc-50">
                          {log.totalChatTurns}턴
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          대화 지속 시간
                        </p>
                        <p className="text-lg font-bold text-black dark:text-zinc-50">
                          {formatDuration(log.totalChatDuration)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          대화 수
                        </p>
                        <p className="text-lg font-bold text-black dark:text-zinc-50">
                          {log.conversationCount}개
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          요약 수정 - 삭제
                        </p>
                        <p className="text-lg font-bold text-red-600 dark:text-red-400">
                          {log.totalCharsDeleted}자
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          요약 수정 - 추가
                        </p>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">
                          {log.totalCharsAdded}자
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          열람 총 시간
                        </p>
                        <p className="text-lg font-bold text-black dark:text-zinc-50">
                          {formatDuration(log.totalViewDuration)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          자신의 대화 열람 시간
                        </p>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          {formatDuration(log.selfViewDuration || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          다른 동료 대화 열람 시간
                        </p>
                        <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                          {formatDuration(log.otherViewDuration || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          열람 총 횟수
                        </p>
                        <p className="text-lg font-bold text-black dark:text-zinc-50">
                          {log.totalViewCount || 0}회
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          자신의 대화 열람 횟수
                        </p>
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                          {log.selfViewCount || 0}회
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          다른 동료 대화 열람 횟수
                        </p>
                        <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                          {log.otherViewCount || 0}회
                        </p>
                      </div>
                    </div>
                    {Object.keys(viewCountByAuthor).length > 0 && (
                      <div className="mt-4">
                        <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          동료별 열람 횟수:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(viewCountByAuthor).map(([author, count]) => {
                            const [name] = author.split(' (')
                            const countNum = typeof count === 'number' ? count : Number(count) || 0
                            return (
                              <span
                                key={author}
                                className="rounded-md bg-blue-100 px-3 py-1 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                              >
                                {name}: {countNum}회
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

