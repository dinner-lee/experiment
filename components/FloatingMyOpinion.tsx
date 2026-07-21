'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, PenLine, Quote, StickyNote, X } from 'lucide-react'

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
  // 전체 새로고침 시에도 즉시 표시되도록 마지막 데이터를 캐시
  const [mine, setMine] = useState<MyConversation | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = sessionStorage.getItem(`cache:myop:${sessionId}:${userId}`)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedNotice, setSavedNotice] = useState(false)

  // 동료 의견에서 드래그로 수집한 문장 조각들
  const clipsKey = `cache:peerclips:${sessionId}:${userId}`
  const [clips, setClips] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = sessionStorage.getItem(clipsKey)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  const saveClips = useCallback(
    (next: string[]) => {
      setClips(next)
      try {
        sessionStorage.setItem(clipsKey, JSON.stringify(next))
      } catch {
        // 캐시 저장 실패는 무시
      }
    },
    [clipsKey]
  )

  // 동료 의견 영역([data-peer-content])에서 텍스트를 드래그하면 자동으로 수집
  useEffect(() => {
    const onMouseUp = () => {
      setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.isCollapsed) return
        const text = selection.toString().trim()
        if (!text || text.length < 2 || text.length > 1000) return
        const anchor = selection.anchorNode
        const el = anchor instanceof Element ? anchor : anchor?.parentElement
        if (!el?.closest('[data-peer-content]')) return
        setClips((prev) => {
          if (prev.includes(text)) return prev
          const next = [...prev, text].slice(-20) // 최대 20개 유지
          try {
            sessionStorage.setItem(clipsKey, JSON.stringify(next))
          } catch {
            // 캐시 저장 실패는 무시
          }
          return next
        })
        setOpen(true)
      }, 0)
    }
    document.addEventListener('mouseup', onMouseUp)
    return () => document.removeEventListener('mouseup', onMouseUp)
  }, [clipsKey])

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
          try {
            sessionStorage.setItem(
              `cache:myop:${sessionId}:${userId}`,
              JSON.stringify({ id: my.id, summary: my.summary })
            )
          } catch {
            // 캐시 저장 실패는 무시
          }
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
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-pine-700/80 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pine-900/30 ring-1 ring-white/25 backdrop-blur-md transition-colors hover:bg-pine-600/90"
      >
        <StickyNote className="h-4 w-4" />내 의견 보기
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/40 bg-white/75 shadow-2xl shadow-zinc-900/20 backdrop-blur-xl">
      {/* 헤더 (글래스 효과) */}
      <div className="relative flex items-center justify-between overflow-hidden bg-pine-800/60 px-4 py-2.5 text-white shadow-inner ring-1 ring-inset ring-white/20 backdrop-blur-xl backdrop-saturate-150">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-white/5 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-8 -top-10 h-24 w-24 rounded-full bg-white/15 blur-xl"
        />
        <span className="relative flex items-center gap-2 text-sm font-semibold">
          <StickyNote className="h-4 w-4" />내 의견
          {savedNotice && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">
              수정 저장됨
            </span>
          )}
        </span>
        <div className="relative flex items-center gap-1">
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
      <div className="max-h-[30vh] overflow-y-auto p-4">
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

      {/* 동료 의견 수집 영역 */}
      <div className="relative flex items-center justify-between overflow-hidden bg-pine-800/60 px-4 py-2.5 text-white shadow-inner ring-1 ring-inset ring-white/20 backdrop-blur-xl backdrop-saturate-150">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/20 via-white/5 to-transparent"
        />
        <span className="relative flex items-center gap-2 text-sm font-semibold">
          <Quote className="h-4 w-4" />동료 의견
          {clips.length > 0 && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">
              {clips.length}
            </span>
          )}
        </span>
        {clips.length > 0 && (
          <button
            onClick={() => saveClips([])}
            className="relative rounded-lg px-2 py-1 text-xs font-medium text-pine-100 transition-colors hover:bg-white/10 hover:text-white"
          >
            모두 지우기
          </button>
        )}
      </div>
      <div className="max-h-[25vh] overflow-y-auto p-4">
        {clips.length === 0 ? (
          <p className="text-xs leading-relaxed text-zinc-400">
            동료의 의견에서 문장을 드래그하면 이곳에 담깁니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {clips.map((clip, i) => (
              <li
                key={i}
                className="group flex items-start gap-2 rounded-xl bg-pine-50/80 px-3 py-2 text-sm leading-relaxed text-zinc-700"
              >
                <span className="min-w-0 flex-1 whitespace-pre-wrap">{clip}</span>
                <button
                  onClick={() => saveClips(clips.filter((_, j) => j !== i))}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-zinc-400 opacity-0 transition-opacity hover:text-zinc-700 group-hover:opacity-100"
                  aria-label="삭제"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
