'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import StepNav, { StepDef } from '@/components/StepNav'
import ChatStep from '@/components/steps/ChatStep'
import SummaryStep from '@/components/steps/SummaryStep'
import CompareStep from '@/components/steps/CompareStep'
import TeamStep from '@/components/steps/TeamStep'
import DebriefStep from '@/components/steps/DebriefStep'
import AnswerTab from '@/components/AnswerTab'
import SharedAnswersTab from '@/components/SharedAnswersTab'
import { LogOut, Puzzle } from 'lucide-react'

const STEPS: StepDef[] = [
  { n: 1, label: 'AI와 대화하기' },
  { n: 2, label: '요약 검토·공유' },
  { n: 3, label: '동료와 비교하기' },
  { n: 4, label: '팀 공동 결론' },
  { n: 5, label: '성찰하기' },
]

export default function SessionPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = params.sessionId as string

  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [hasAIChat, setHasAIChat] = useState<boolean | null>(null)
  const [showSharedAnswers, setShowSharedAnswers] = useState<boolean>(true)

  // 단계 진행 상태 (사용자·세션별로 localStorage에 보존)
  const [currentStep, setCurrentStep] = useState(1)
  const [maxStep, setMaxStep] = useState(1)
  const [conversationId, setConversationId] = useState<string | null>(null)

  // AI 비활성 세션용 탭
  const [answerTab, setAnswerTab] = useState<'answer' | 'answers'>('answer')

  const stepKey = userId ? `flow:step:${sessionId}:${userId}` : null
  const maxKey = userId ? `flow:max:${sessionId}:${userId}` : null
  const convKey = userId ? `flow:conv:${sessionId}:${userId}` : null

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId')
    const storedUserName = localStorage.getItem('userName')
    if (storedUserId && storedUserName) {
      setUserId(storedUserId)
      setUserName(storedUserName)
    } else {
      router.push('/')
    }
  }, [router])

  useEffect(() => {
    const fetchSessionInfo = async () => {
      try {
        const response = await fetch(`/api/session/${sessionId}/pin`)
        if (response.ok) {
          const data = await response.json()
          setHasAIChat(data.hasAIChat !== false)
          setShowSharedAnswers(data.showSharedAnswers !== false)
        } else {
          setHasAIChat(true)
        }
      } catch (error) {
        console.error('Failed to fetch session info:', error)
        setHasAIChat(true)
      }
    }
    fetchSessionInfo()
  }, [sessionId])

  // 저장된 진행 상태 복원 (+ URL ?step= 우선)
  useEffect(() => {
    if (!stepKey || !maxKey || !convKey) return
    const savedMax = parseInt(localStorage.getItem(maxKey) || '1', 10) || 1
    const savedStep = parseInt(localStorage.getItem(stepKey) || '1', 10) || 1
    const savedConv = localStorage.getItem(convKey)
    const urlStep = parseInt(searchParams.get('step') || '', 10)
    setMaxStep(savedMax)
    setConversationId(savedConv)
    const target = !isNaN(urlStep) && urlStep >= 1 && urlStep <= savedMax ? urlStep : Math.min(savedStep, savedMax)
    setCurrentStep(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, maxKey, convKey])

  const goToStep = useCallback(
    (step: number, unlock = false) => {
      setCurrentStep(step)
      if (stepKey) localStorage.setItem(stepKey, String(step))
      setMaxStep((prev) => {
        const next = unlock ? Math.max(prev, step) : prev
        if (maxKey && next !== prev) localStorage.setItem(maxKey, String(next))
        return next
      })
      window.history.replaceState(null, '', `/session/${sessionId}?step=${step}`)
      window.scrollTo({ top: 0 })
    },
    [stepKey, maxKey, sessionId]
  )

  const handleLogout = () => {
    localStorage.removeItem('userId')
    localStorage.removeItem('userName')
    localStorage.removeItem('sessionId')
    router.push('/')
  }

  if (!userId || !userName || hasAIChat === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <p className="text-zinc-500">로딩 중…</p>
      </div>
    )
  }

  // ── AI 활성 세션: 5단계 학습 흐름 ──
  if (hasAIChat) {
    return (
      <div className="flex min-h-screen flex-col bg-cream">
        <StepNav
          steps={STEPS}
          currentStep={currentStep}
          maxStep={maxStep}
          onNavigate={(step) => goToStep(step)}
          userName={userName}
          onLogout={handleLogout}
        />

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          {currentStep === 1 && (
            <ChatStep
              userId={userId}
              sessionId={sessionId}
              userName={userName}
              onComplete={(convId) => {
                setConversationId(convId)
                if (convKey) localStorage.setItem(convKey, convId)
                goToStep(2, true)
              }}
            />
          )}
          {currentStep === 2 && (
            <SummaryStep
              userId={userId}
              conversationId={conversationId}
              onBack={() => goToStep(1)}
              onComplete={() => goToStep(3, true)}
            />
          )}
          {currentStep === 3 && (
            <CompareStep
              userId={userId}
              sessionId={sessionId}
              userName={userName}
              onNext={() => goToStep(4, true)}
            />
          )}
          {currentStep === 4 && (
            <TeamStep
              userId={userId}
              sessionId={sessionId}
              userName={userName}
              onNext={() => goToStep(5, true)}
            />
          )}
          {currentStep === 5 && (
            <DebriefStep userId={userId} sessionId={sessionId} />
          )}
        </main>
      </div>
    )
  }

  // ── AI 비활성 세션: 질문에 답하기 (기존 탭 유지) ──
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/95 font-display backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pine-800 text-white">
              <Puzzle className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <span className="text-lg font-bold tracking-tight text-ink">질문에 답하기</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-zinc-700">{userName}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-ink"
            >
              <LogOut className="h-3.5 w-3.5" />
              나가기
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-4 flex gap-1 rounded-xl bg-zinc-200/50 p-1">
          <button
            onClick={() => setAnswerTab('answer')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              answerTab === 'answer' ? 'bg-white text-ink shadow-sm' : 'text-zinc-500 hover:text-ink'
            }`}
          >
            질문에 답하기
          </button>
          {showSharedAnswers && (
            <button
              onClick={() => setAnswerTab('answers')}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                answerTab === 'answers' ? 'bg-white text-ink shadow-sm' : 'text-zinc-500 hover:text-ink'
              }`}
            >
              답변 공유하기
            </button>
          )}
        </div>

        {answerTab === 'answer' ? (
          <AnswerTab userId={userId} sessionId={sessionId} userName={userName} />
        ) : (
          <SharedAnswersTab userId={userId} sessionId={sessionId} />
        )}
      </div>
    </div>
  )
}
