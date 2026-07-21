import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const PRESENCE_TTL_MS = 12_000 // 이 시간 안에 갱신이 없으면 편집 중 목록에서 제거

type EditorsMap = Record<string, { name: string; lastSeen: number }>

function pruneEditors(editors: unknown): EditorsMap {
  const now = Date.now()
  const map: EditorsMap = {}
  if (editors && typeof editors === 'object') {
    for (const [uid, info] of Object.entries(editors as Record<string, any>)) {
      if (info && typeof info.lastSeen === 'number' && now - info.lastSeen < PRESENCE_TTL_MS) {
        map[uid] = { name: info.name || '알 수 없음', lastSeen: info.lastSeen }
      }
    }
  }
  return map
}

function commonPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return i
}

function commonSuffixLen(a: string, b: string, maxLen: number): number {
  const n = Math.min(a.length, b.length, maxLen)
  let i = 0
  while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i++
  return i
}

// 3-way 병합: base 대비 서버/클라이언트의 변경 구간이 겹치지 않으면 둘 다 반영,
// 겹치면 나중에 쓴 쪽(클라이언트)을 우선한다.
function threeWayMerge(base: string, server: string, client: string): string {
  if (server === base) return client
  if (client === base) return server
  if (server === client) return client

  const pC = commonPrefixLen(base, client)
  const sC = commonSuffixLen(base, client, Math.min(base.length, client.length) - pC)
  const pS = commonPrefixLen(base, server)
  const sS = commonSuffixLen(base, server, Math.min(base.length, server.length) - pS)

  // base 기준 변경 구간 [start, end)
  const cStart = pC
  const cEnd = base.length - sC
  const sStart = pS
  const sEnd = base.length - sS

  const clientInsert = client.slice(pC, client.length - sC)
  const serverInsert = server.slice(pS, server.length - sS)

  // 변경 구간이 겹치면 클라이언트 우선 (last-write-wins)
  if (cStart < sEnd && sStart < cEnd) {
    return client
  }

  // 겹치지 않으면 뒤쪽 구간부터 차례로 치환하여 둘 다 반영
  if (cStart >= sEnd) {
    return (
      base.slice(0, sStart) +
      serverInsert +
      base.slice(sEnd, cStart) +
      clientInsert +
      base.slice(cEnd)
    )
  }
  return (
    base.slice(0, cStart) +
    clientInsert +
    base.slice(cEnd, sStart) +
    serverInsert +
    base.slice(sEnd)
  )
}

async function getOrCreateDocument(sessionId: string, editors?: EditorsMap) {
  const existing = await prisma.teamDocument.findUnique({ where: { sessionId } })
  if (existing) return existing
  return prisma.teamDocument
    .create({ data: { sessionId, content: '', version: 0, editors } })
    .catch(() => prisma.teamDocument.findUniqueOrThrow({ where: { sessionId } })) // 동시 생성 경합 대비
}

// 문서 조회 + 프레즌스 갱신 (폴링용)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> | { sessionId: string } }
) {
  try {
    const { sessionId } = await Promise.resolve(params)
    const userId = request.nextUrl.searchParams.get('userId')
    const name = request.nextUrl.searchParams.get('name')

    const now = Date.now()
    const initialEditors: EditorsMap | undefined =
      userId && name ? { [userId]: { name, lastSeen: now } } : undefined
    const doc = await getOrCreateDocument(sessionId, initialEditors)
    const editors = pruneEditors(doc.editors)

    if (userId && name) {
      // 쓰기 최소화: 내 프레즌스가 4초 이상 오래됐을 때만 갱신 (TTL 12초, 폴링 2초)
      const mine = editors[userId]
      editors[userId] = { name, lastSeen: now }
      if (!mine || now - mine.lastSeen > 4000) {
        await prisma.teamDocument.update({
          where: { sessionId },
          data: { editors },
        })
      }
    }

    return NextResponse.json({
      content: doc.content,
      version: doc.version,
      updatedAt: doc.updatedAt,
      editors: Object.entries(editors)
        .filter(([uid]) => uid !== userId)
        .map(([uid, info]) => ({ userId: uid, name: info.name })),
    })
  } catch (error: any) {
    console.error('Team document GET error:', error)
    return NextResponse.json(
      { error: '공동 문서를 불러오지 못했습니다.', details: error.message },
      { status: 500 }
    )
  }
}

// 문서 저장 (버전 충돌 시 3-way 병합)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> | { sessionId: string } }
) {
  try {
    const { sessionId } = await Promise.resolve(params)
    const { userId, name, content, baseVersion, baseContent } = await request.json()

    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'content가 필요합니다.' }, { status: 400 })
    }

    const doc = await getOrCreateDocument(sessionId)
    const editors = pruneEditors(doc.editors)
    if (userId && name) {
      editors[userId] = { name, lastSeen: Date.now() }
    }

    let finalContent = content
    let merged = false
    if (typeof baseVersion === 'number' && baseVersion < doc.version) {
      // 다른 사람이 먼저 저장함 → 병합 시도
      finalContent = threeWayMerge(
        typeof baseContent === 'string' ? baseContent : '',
        doc.content,
        content
      )
      merged = true
    }

    const updated = await prisma.teamDocument.update({
      where: { sessionId },
      data: {
        content: finalContent,
        version: doc.version + 1,
        editors,
      },
    })

    // 편집 활동 로그 (연구 데이터)
    if (userId) {
      await prisma.userLog
        .create({
          data: {
            userId,
            sessionId,
            eventType: 'team_doc_edit',
            metadata: { version: updated.version, merged, length: finalContent.length },
          },
        })
        .catch(() => {})
    }

    return NextResponse.json({
      content: updated.content,
      version: updated.version,
      merged,
    })
  } catch (error: any) {
    console.error('Team document PUT error:', error)
    return NextResponse.json(
      { error: '공동 문서 저장에 실패했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
