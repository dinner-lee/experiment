'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, KeyRound, Puzzle, UserRound } from 'lucide-react'

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-4 py-10">
      {/* 배경 장식 (좌측 은은한 블러) */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-20%] left-[-8%] h-[28rem] w-[28rem] rounded-full bg-pine-200/40 blur-3xl"
      />

      <main className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-zinc-200/70 bg-white shadow-xl shadow-zinc-900/5">
        <div className="grid md:grid-cols-[1.1fr_1fr]">
          {/* 왼쪽: 브랜드 글래스 패널 (흰색 카드 위에 떠 있는 형태) */}
          <div className="p-3 md:p-4">
            <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-pine-800/90 p-7 text-white shadow-2xl shadow-pine-900/40 ring-1 ring-white/25 backdrop-blur-xl md:p-9">
              {/* 글래스 광택 + 흰색 블러 장식 */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -left-14 -top-14 h-48 w-48 rounded-full bg-white/15 blur-2xl"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute -bottom-16 right-4 h-44 w-44 rounded-full bg-white/10 blur-3xl"
              />
              <div className="relative">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 shadow-inner ring-1 ring-white/30 backdrop-blur">
                  <Puzzle className="h-6 w-6" strokeWidth={2} />
                </div>
                <h1 className="text-2xl font-bold leading-snug tracking-tight md:text-[1.7rem]">
                  협력적 문제해결
                  <br />
                  지원 시스템
                </h1>
                <p className="mt-3 max-w-xs break-keep text-sm font-light leading-relaxed text-pine-100/90">
                  AI와의 대화를 통해 나의 생각을 정교화하고, 동료와 생각을 공유하며 협력적으로
                  문제를 해결해 나가는 과정을 지원하는 학습 플랫폼
                </p>
              </div>
            </div>
          </div>

          {/* 오른쪽: 입장 폼 */}
          <div className="flex flex-col justify-center p-8 md:p-10">
            <h2 className="mb-1 text-xl font-bold text-ink">세션 입장</h2>
            <p className="mb-6 text-sm text-zinc-500">PIN 코드와 이름을 입력해 시작하세요.</p>

            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label
                  htmlFor="pinCode"
                  className="mb-1.5 block text-sm font-semibold text-zinc-700"
                >
                  PIN 코드
                </label>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    id="pinCode"
                    type="text"
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value)}
                    required
                    autoComplete="off"
                    className="block w-full rounded-xl border border-zinc-200 py-2.5 pl-10 pr-4 text-ink placeholder:text-zinc-400 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
                    placeholder="예: 1234"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="userName"
                  className="mb-1.5 block text-sm font-semibold text-zinc-700"
                >
                  이름
                </label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    id="userName"
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    required
                    autoComplete="name"
                    className="block w-full rounded-xl border border-zinc-200 py-2.5 pl-10 pr-4 text-ink placeholder:text-zinc-400 focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
                    placeholder="이름을 입력하세요"
                  />
                </div>
              </div>
              {error && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-pine-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-pine-600 disabled:bg-zinc-300"
              >
                {loading ? '입장 중…' : '입장하기'}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>

            <div className="mt-6 text-center">
              <a
                href="/admin"
                className="text-xs text-zinc-400 transition-colors hover:text-pine-700"
              >
                관리자 화면
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
