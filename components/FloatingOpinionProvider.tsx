'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import FloatingMyOpinion from './FloatingMyOpinion'

// 플로팅 '내 의견' 패널을 루트 레이아웃 수준에서 렌더링하는 프로바이더.
// 페이지 이동(3단계 목록 ↔ 동료 대화 상세)에도 패널이 언마운트되지 않아
// 깜빡임 없이 같은 위치·상태로 계속 표시된다.
export default function FloatingOpinionProvider() {
  const pathname = usePathname()
  const [ctx, setCtx] = useState<{ sessionId: string; userId: string } | null>(null)

  const evaluate = useCallback(
    (stepOverride?: number) => {
      const userId = localStorage.getItem('userId')
      const sessionId = localStorage.getItem('sessionId')
      if (!userId || !sessionId) {
        setCtx(null)
        return
      }
      // 동료 대화 상세: 항상 표시 (3단계에서 진입하는 화면)
      if (pathname?.startsWith('/conversation/')) {
        setCtx({ sessionId, userId })
        return
      }
      // 세션 화면: 3단계(비교)·4단계(팀 공동 결론)에서만 표시
      if (pathname?.startsWith('/session/')) {
        const step =
          stepOverride ??
          (parseInt(localStorage.getItem(`flow:step:${sessionId}:${userId}`) || '1', 10) || 1)
        setCtx(step === 3 || step === 4 ? { sessionId, userId } : null)
        return
      }
      setCtx(null)
    },
    [pathname]
  )

  useEffect(() => {
    evaluate()
  }, [evaluate])

  // 세션 화면 내부에서 단계가 바뀔 때 (페이지 이동 없이) 알림을 받는다
  useEffect(() => {
    const handler = (e: Event) => evaluate((e as CustomEvent).detail?.step)
    window.addEventListener('flow-step-changed', handler)
    return () => window.removeEventListener('flow-step-changed', handler)
  }, [evaluate])

  if (!ctx) return null
  return <FloatingMyOpinion sessionId={ctx.sessionId} userId={ctx.userId} />
}
