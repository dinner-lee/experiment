'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowRight, FileText, Users } from 'lucide-react'
import FloatingMyOpinion from '@/components/FloatingMyOpinion'

interface TeamStepProps {
  userId: string
  sessionId: string
  userName: string
  onNext: () => void
}

const TEMPLATE = `[우리 팀의 문제 정의]


[공동 해결안]


[그렇게 결정한 이유]


[남은 쟁점 / 더 논의할 것]

`

export default function TeamStep({ userId, sessionId, userName, onNext }: TeamStepProps) {
  const cacheKey = `cache:teamdoc:${sessionId}`
  // 마지막 동기화 내용을 즉시 표시하고, 백그라운드 폴링으로 최신화
  const [cached] = useState<{ content: string; version: number } | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      const raw = sessionStorage.getItem(cacheKey)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [content, setContent] = useState(cached?.content || '')
  const [editors, setEditors] = useState<{ userId: string; name: string }[]>([])
  const [loading, setLoading] = useState(!cached)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'merged'>('idle')

  // 폴링/디바운스 콜백에서 최신 상태를 참조하기 위한 ref
  const contentRef = useRef(cached?.content || '')
  const versionRef = useRef(cached?.version || 0)
  const baseContentRef = useRef(cached?.content || '')
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const applyServer = (serverContent: string, serverVersion: number) => {
    contentRef.current = serverContent
    versionRef.current = serverVersion
    baseContentRef.current = serverContent
    setContent(serverContent)
    try {
      sessionStorage.setItem(
        `cache:teamdoc:${sessionId}`,
        JSON.stringify({ content: serverContent, version: serverVersion })
      )
    } catch {
      // 캐시 저장 실패는 무시
    }
  }

  const save = useCallback(async () => {
    if (savingRef.current) return
    savingRef.current = true
    const sentContent = contentRef.current
    setSaveState('saving')
    try {
      const response = await fetch(`/api/team-document/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          name: userName,
          content: sentContent,
          baseVersion: versionRef.current,
          baseContent: baseContentRef.current,
        }),
      })
      if (!response.ok) throw new Error('save failed')
      const data = await response.json()

      if (contentRef.current === sentContent) {
        // 저장하는 동안 추가 입력이 없었음 → 서버 결과(병합 포함)를 그대로 반영
        applyServer(data.content, data.version)
        dirtyRef.current = false
        setSaveState(data.merged ? 'merged' : 'saved')
      } else {
        // 저장 중 추가 입력 → 기준만 갱신하고 곧바로 다시 저장 예약
        versionRef.current = data.version
        baseContentRef.current = data.content
        setSaveState('idle')
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => save(), 400)
      }
    } catch (error) {
      console.error('Failed to save team document:', error)
      setSaveState('idle')
    } finally {
      savingRef.current = false
    }
  }, [sessionId, userId, userName])

  // 주기적 동기화 (다른 팀원의 편집 반영 + 프레즌스)
  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/team-document/${sessionId}?userId=${userId}&name=${encodeURIComponent(userName)}`
        )
        if (!response.ok) return
        const data = await response.json()
        if (cancelled) return
        setEditors(data.editors || [])
        // 내가 수정 중이 아닐 때만 다른 사람의 변경을 반영 (커서 튐 방지)
        if (!dirtyRef.current && !savingRef.current && data.version !== versionRef.current) {
          applyServer(data.content, data.version)
        }
        setLoading(false)
      } catch (error) {
        console.error('Failed to poll team document:', error)
      }
    }
    poll()
    const interval = setInterval(poll, 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [sessionId, userId, userName])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    contentRef.current = e.target.value
    setContent(e.target.value)
    dirtyRef.current = true
    setSaveState('idle')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(), 800)
  }

  const insertTemplate = () => {
    if (content.trim() !== '' && !confirm('현재 내용 뒤에 작성 틀을 추가할까요?')) return
    const next = content.trim() === '' ? TEMPLATE : `${content}\n\n${TEMPLATE}`
    contentRef.current = next
    setContent(next)
    dirtyRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(), 300)
  }

  return (
    <div className="space-y-6">
      {/* 공동 결론 작성 중에도 내 의견을 띄워 두고 참고·수정할 수 있는 플로팅 패널 */}
      <FloatingMyOpinion sessionId={sessionId} userId={userId} />

      <div className="rounded-2xl border border-zinc-200/70 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <FileText className="h-5 w-5 text-pine-700" />팀 공동 결론 작성
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              팀원 모두가 같은 문서를 동시에 편집합니다. 비교 단계에서 확인한 공통점과 차이점을
              바탕으로 팀의 최종 결론을 함께 정리하세요.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {editors.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-pine-100 px-3 py-1 text-xs font-medium text-pine-800">
                <Users className="h-3.5 w-3.5" />
                {editors.map((e) => e.name).join(', ')} 함께 편집 중
              </span>
            )}
            <span className="text-xs text-zinc-400">
              {saveState === 'saving' && '저장 중…'}
              {saveState === 'saved' && '저장됨'}
              {saveState === 'merged' && '다른 팀원의 편집과 병합됨'}
            </span>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <p className="py-10 text-center text-sm text-zinc-500">공동 문서를 불러오는 중…</p>
          ) : (
            <>
              {content.trim() === '' && (
                <button
                  onClick={insertTemplate}
                  className="mb-3 rounded-lg border border-dashed border-pine-300 bg-pine-50/50 px-3 py-1.5 text-xs font-medium text-pine-800 hover:bg-pine-50"
                >
                  + 작성 틀 넣기 (문제 정의 / 공동 해결안 / 이유 / 남은 쟁점)
                </button>
              )}
              <textarea
                value={content}
                onChange={handleChange}
                rows={18}
                placeholder={'팀의 공동 결론을 여기에 함께 작성하세요.\n\n예시 구성:\n[우리 팀의 문제 정의]\n[공동 해결안]\n[그렇게 결정한 이유]\n[남은 쟁점 / 더 논의할 것]'}
                className="w-full resize-y rounded-xl border border-zinc-200 px-4 py-3 font-[inherit] text-[15px] leading-relaxed text-ink focus:border-pine-500 focus:outline-none focus:ring-2 focus:ring-pine-500/20"
              />
            </>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="flex items-center gap-2 rounded-xl bg-ink px-6 py-3 font-semibold text-white transition-colors hover:bg-zinc-800"
        >
          성찰하러 가기
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
