'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Layers } from 'lucide-react'

const FLOW = ['AI와 대화', '요약 공유', '동료와 비교', '팀 공동 결론', '성찰']

export default function Home() {
  const [pinCode, setPinCode] = useState('')
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/session/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinCode, userName }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to join session')
      }

      // 세션 정보를 localStorage에 저장
      localStorage.setItem('userId', data.user.id)
      localStorage.setItem('userName', data.user.name)
      localStorage.setItem('sessionId', data.session.id)

      router.push(`/session/${data.session.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <main className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-white shadow-sm">
            <Layers className="h-7 w-7" strokeWidth={2.2} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">협업형 AI 학습</h1>
          <p className="mt-1 text-sm text-zinc-500">
            AI와 생각을 정교화하고, 동료와 비교하며, 팀의 결론을 함께 만듭니다
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200/70 bg-white p-7 shadow-sm">
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="pinCode" className="mb-1.5 block text-sm font-semibold text-zinc-700">
                PIN 코드
              </label>
              <input
                id="pinCode"
                type="text"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value)}
                required
                className="block w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-ink placeholder:text-zinc-400 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
                placeholder="PIN 코드를 입력하세요"
              />
            </div>
            <div>
              <label htmlFor="userName" className="mb-1.5 block text-sm font-semibold text-zinc-700">
                이름
              </label>
              <input
                id="userName"
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
                className="block w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-ink placeholder:text-zinc-400 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
                placeholder="이름을 입력하세요"
              />
            </div>
            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-pine-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-pine-600 disabled:bg-zinc-300"
            >
              {loading ? '입장 중…' : '입장하기'}
            </button>
          </form>
        </div>

        {/* 활동 흐름 미리보기 */}
        <div className="mt-5 flex items-center justify-center gap-1 text-[11px] font-medium text-zinc-400">
          {FLOW.map((label, i) => (
            <span key={label} className="flex items-center gap-1">
              {i > 0 && <span className="text-zinc-300">→</span>}
              <span>{label}</span>
            </span>
          ))}
        </div>

        <div className="mt-4 text-center">
          <a href="/admin" className="text-xs text-zinc-400 transition-colors hover:text-pine-700">
            관리자 화면
          </a>
        </div>
      </main>
    </div>
  )
}
