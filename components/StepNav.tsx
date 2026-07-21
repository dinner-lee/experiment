'use client'

import { Check, Layers, LogOut } from 'lucide-react'

export interface StepDef {
  n: number
  label: string
}

interface StepNavProps {
  steps: StepDef[]
  currentStep: number
  maxStep: number // 지금까지 도달(해금)한 최대 단계
  onNavigate: (step: number) => void
  userName: string
  onLogout: () => void
}

export default function StepNav({
  steps,
  currentStep,
  maxStep,
  onNavigate,
  userName,
  onLogout,
}: StepNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* 로고 */}
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-white">
            <Layers className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <span className="hidden text-lg font-bold tracking-tight text-ink md:block">
            협업형 AI 학습
          </span>
        </div>

        {/* 스텝퍼 */}
        <nav className="flex min-w-0 items-center" aria-label="학습 단계">
          {steps.map((step, i) => {
            const done = step.n < currentStep && step.n <= maxStep
            const current = step.n === currentStep
            const unlocked = step.n <= maxStep
            return (
              <div key={step.n} className="flex items-center">
                {i > 0 && (
                  <div
                    className={`mx-1.5 h-px w-3 sm:w-4 ${
                      unlocked ? 'bg-pine-300' : 'bg-zinc-300'
                    }`}
                  />
                )}
                {current ? (
                  <div className="flex items-center gap-2 rounded-full bg-ink py-1 pl-1 pr-3.5 text-white ring-2 ring-pine-700 ring-offset-2 ring-offset-white">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-ink">
                      {step.n}
                    </span>
                    <span className="whitespace-nowrap text-sm font-semibold">
                      {step.label}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => unlocked && onNavigate(step.n)}
                    disabled={!unlocked}
                    title={unlocked ? step.label : `${step.label} (이전 단계를 먼저 완료하세요)`}
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      done || unlocked
                        ? 'bg-pine-700 text-white hover:bg-pine-600'
                        : 'cursor-not-allowed bg-zinc-200 text-zinc-400'
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" strokeWidth={3} /> : step.n}
                  </button>
                )}
              </div>
            )
          })}
        </nav>

        {/* 사용자 영역 */}
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-sm font-semibold text-zinc-700 sm:block">
            {userName}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" />
            나가기
          </button>
        </div>
      </div>
    </header>
  )
}
