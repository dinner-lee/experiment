'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, ArrowRight, Eye, EyeOff, FileCheck2 } from 'lucide-react'

interface SummaryStepProps {
  userId: string
  conversationId: string | null
  onBack: () => void // 1단계(대화)로 돌아가기
  onComplete: () => void // 공유 완료 → 3단계로
}

const CHECK_ITEMS = [
  { key: 'claim', label: '나의 해결안(주장)이 명확히 드러난다' },
  { key: 'evidence', label: '그렇게 생각한 근거가 포함되어 있다' },
  { key: 'intent', label: '대화에서 말한 내 의도가 충분히 반영되었다' },
] as const

export default function SummaryStep({
  userId,
  conversationId,
  onBack,
  onComplete,
}: SummaryStepProps) {
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [originalSummary, setOriginalSummary] = useState('')
  const [alreadyShared, setAlreadyShared] = useState(false)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [shareScope, setShareScope] = useState<'full' | 'summary_only'>('full')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [isSharing, setIsSharing] = useState(false)

  useEffect(() => {
    const fetchConversation = async () => {
      if (!conversationId) {
        setLoading(false)
        return
      }
      try {
        const response = await fetch(`/api/conversation/${conversationId}?viewerId=${userId}`)
        const data = await response.json()
        if (data.conversation) {
          setTitle(data.conversation.title || '')
          setSummary(data.conversation.summary || '')
          setOriginalSummary(data.conversation.summary || '')
          setAlreadyShared(!!data.conversation.isShared)
          setShareScope(data.conversation.shareScope === 'summary_only' ? 'summary_only' : 'full')
          setIsAnonymous(!!data.conversation.isAnonymous)
        }
      } catch (error) {
        console.error('Failed to fetch conversation:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchConversation()
  }, [conversationId, userId])

  const allChecked = CHECK_ITEMS.every((item) => checks[item.key])

  const handleShare = async () => {
    if (!conversationId || !summary.trim()) return
    setIsSharing(true)
    try {
      // 원본 대비 수정량 계산 (연구 데이터)
      let commonChars = 0
      const minLength = Math.min(originalSummary.length, summary.length)
      for (let i = 0; i < minLength; i++) {
        if (originalSummary[i] === summary[i]) commonChars++
        else break
      }
      const editMetadata = {
        charsDeleted: Math.max(0, originalSummary.length - commonChars),
        charsAdded: Math.max(0, summary.length - commonChars),
      }

      const response = await fetch(`/api/conversation/${conversationId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: summary.trim(),
          title: title.trim(),
          editMetadata,
          shareScope,
          isAnonymous,
        }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || '공유에 실패했습니다')
      }
      onComplete()
    } catch (error: any) {
      console.error('Failed to share:', error)
      alert(`공유에 실패했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setIsSharing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-zinc-200/70 bg-white p-16 shadow-sm">
        <p className="text-zinc-500">요약을 불러오는 중…</p>
      </div>
    )
  }

  if (!conversationId) {
    return (
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-10 text-center shadow-sm">
        <p className="mb-4 text-zinc-600">아직 완료된 AI 대화가 없습니다.</p>
        <button
          onClick={onBack}
          className="rounded-xl bg-pine-700 px-5 py-2.5 font-medium text-white transition-colors hover:bg-pine-600"
        >
          1단계로 돌아가 대화 시작하기
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* 왼쪽: 요약 편집 */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white p-6 shadow-sm">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-ink">
          <FileCheck2 className="h-5 w-5 text-pine-700" />
          대화 요약 검토 및 수정
        </h2>
        <p className="mb-5 text-sm leading-relaxed text-zinc-500">
          AI가 대화 내용을 여러분의 1인칭 시점으로 요약했습니다. 내 생각과 다르거나 빠진 부분이
          있다면 직접 고쳐주세요.
        </p>

        <label className="mb-1.5 block text-sm font-semibold text-zinc-700">한 줄 제목</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="내 의견을 한 줄로 표현하면?"
          className="mb-4 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
        />

        <label className="mb-1.5 block text-sm font-semibold text-zinc-700">요약</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={10}
          placeholder="요약 내용을 검토하고 수정하세요"
          className="w-full resize-y rounded-xl border border-zinc-200 px-4 py-3 leading-relaxed text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
        />

        <button
          onClick={onBack}
          className="mt-4 flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          대화로 돌아가기
        </button>
      </div>

      {/* 오른쪽: 자기점검 + 공유 옵션 */}
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm">
          <h3 className="mb-1 font-bold text-ink">공유 전 자기점검</h3>
          <p className="mb-3 text-xs text-zinc-500">
            아래 항목을 확인하며 요약을 점검하세요. 모두 확인해야 공유할 수 있습니다.
          </p>
          <div className="space-y-2.5">
            {CHECK_ITEMS.map((item) => (
              <label
                key={item.key}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg p-1 text-sm text-zinc-700"
              >
                <input
                  type="checkbox"
                  checked={!!checks[item.key]}
                  onChange={(e) => setChecks({ ...checks, [item.key]: e.target.checked })}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-pine-700"
                />
                <span className="leading-snug">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-bold text-ink">공유 범위</h3>
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-zinc-200 p-3 text-sm has-[:checked]:border-pine-500 has-[:checked]:bg-pine-50">
              <input
                type="radio"
                name="shareScope"
                checked={shareScope === 'full'}
                onChange={() => setShareScope('full')}
                className="mt-0.5 accent-pine-700"
              />
              <span>
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  <Eye className="h-3.5 w-3.5" /> 전체 공개
                </span>
                <span className="text-xs leading-snug text-zinc-500">
                  요약과 AI 대화 원문을 모두 동료에게 공개합니다.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-zinc-200 p-3 text-sm has-[:checked]:border-pine-500 has-[:checked]:bg-pine-50">
              <input
                type="radio"
                name="shareScope"
                checked={shareScope === 'summary_only'}
                onChange={() => setShareScope('summary_only')}
                className="mt-0.5 accent-pine-700"
              />
              <span>
                <span className="flex items-center gap-1.5 font-semibold text-ink">
                  <EyeOff className="h-3.5 w-3.5" /> 요약만 공개
                </span>
                <span className="text-xs leading-snug text-zinc-500">
                  요약만 공개하고 대화 원문은 나만 볼 수 있습니다.
                </span>
              </span>
            </label>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="h-4 w-4 accent-pine-700"
            />
            익명으로 공유하기
          </label>
        </div>

      </div>
    </div>

    {/* 다음 단계 (우측 하단, 공통 디자인) */}
    <div className="flex items-center justify-end gap-3">
      {!allChecked && (
        <p className="text-xs text-zinc-400">
          자기점검 항목을 모두 확인하면 공유할 수 있습니다.
        </p>
      )}
      <button
        onClick={handleShare}
        disabled={!allChecked || isSharing || !summary.trim()}
        className="flex items-center gap-2 rounded-xl bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
      >
        {isSharing ? '공유 중…' : alreadyShared ? '다시 공유하고 동료와 비교하기' : '공유하고 동료와 비교하기'}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
    </div>
  )
}
