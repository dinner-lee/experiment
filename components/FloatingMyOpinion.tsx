'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, PenLine, StickyNote } from 'lucide-react'

interface FloatingMyOpinionProps {
  sessionId: string
  userId: string
}

interface MyConversation {
  id: string
  summary: string
}

// 동료 의견을 열람하는 동안 내 의견을 띄워 두고 바로 수정할 수 있는 플로팅 패널
export default function FloatingMyOpinion({ sessionId, userId }: FloatingMyOpinionProps) {
  const [mine, setMine] = useState<MyConversation | null>(null)
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedNotice, setSavedNotice] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchMine = async () => {
      try {
        const response = await fetch(`/api/conversations/${sessionId}?viewerId=${userId}`)
        if (!response.ok || cancelled) return
        const data = await response.json()
        const my = (data.conversations || []).find((c: any) => c.isMine)
        if (my) {
          setMine((prev) => {
            // 편집 중에는 외부 갱신으로 초안을 덮어쓰지 않음
            if (!prev || prev.summary !== my.summary) {
              setDraft((d) => (prev && d !== prev.summary ? d : my.summary))
            }
            return { id: my.id, summary: my.summary }
          })
        }
      } catch (error) {
        console.error('Failed to fetch my opinion:', error)
      }
    }
    fetchMine()
    const interval = setInterval(fetchMine, 10000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [sessionId, userId])

  if (!mine) return null

  const handleSave = async () => {
    if (!draft.trim()) return
    setSaving(true)
    try {
      const response = await fetch(`/api/conversation/${mine.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: draft.trim(),
          userId,
          revise: true,
          revisionReason: reason.trim() || undefined,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || '수정에 실패했습니다')
      }
      setMine({ ...mine, summary: draft.trim() })
      setEditing(false)
      setReason('')
      setSavedNotice(true)
      setTimeout(() => setSavedNotice(false), 2500)
    } catch (error: any) {
      alert(`수정에 실패했습니다: ${error.message || '알 수 없는 오류'}`)
    } finally {
      setSaving(false)
    }
  }

  // 접힌 상태: 우하단 pill 버튼
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-pine-700 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pine-900/30 transition-colors hover:bg-pine-600"
      >
        <StickyNote className="h-4 w-4" />내 의견 보기
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-pine-200 bg-white shadow-2xl shadow-zinc-900/20">
      {/* 헤더 */}
      <div className="flex items-center justify-between bg-pine-800 px-4 py-2.5 text-white">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <StickyNote className="h-4 w-4" />내 의견
          {savedNotice && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">
              수정 저장됨
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {!editing && (
            <button
              onClick={() => {
                setDraft(mine.summary)
                setEditing(true)
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-pine-100 transition-colors hover:bg-white/10 hover:text-white"
            >
              <PenLine className="h-3.5 w-3.5" />
              수정
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1 text-pine-100 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="접기"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div className="max-h-[45vh] overflow-y-auto p-4">
        {editing ? (
          <div className="space-y-2.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={7}
              className="w-full resize-y rounded-xl border border-zinc-200 px-3 py-2.5 text-sm leading-relaxed text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
            />
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="무엇을 참고해 수정했나요? (선택)"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
            />
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving || !draft.trim()}
                className="flex-1 rounded-lg bg-pine-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-pine-600 disabled:bg-zinc-300"
              >
                {saving ? '저장 중…' : '수정 저장'}
              </button>
              <button
                onClick={() => {
                  setEditing(false)
                  setDraft(mine.summary)
                  setReason('')
                }}
                disabled={saving}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
            {mine.summary}
          </p>
        )}
      </div>
    </div>
  )
}
