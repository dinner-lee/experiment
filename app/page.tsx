'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="w-full max-w-md rounded-lg bg-white p-8 shadow-lg dark:bg-zinc-900">
        <h1 className="mb-6 text-2xl font-bold text-center text-black dark:text-zinc-50">
          AI 대화 공유 플랫폼
        </h1>
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label
              htmlFor="pinCode"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              PIN 코드
            </label>
            <input
              id="pinCode"
              type="text"
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
              placeholder="PIN 코드를 입력하세요"
            />
          </div>
          <div>
            <label
              htmlFor="userName"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              사용자 이름
            </label>
            <input
              id="userName"
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-black dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
              placeholder="이름을 입력하세요"
            />
          </div>
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400"
          >
            {loading ? '입장 중...' : '입장하기'}
          </button>
        </form>
        <div className="mt-4 text-center">
          <a
            href="/admin"
            className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400"
          >
            관리자 화면
          </a>
        </div>
      </main>
    </div>
  )
}
