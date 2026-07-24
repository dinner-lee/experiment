import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 대시보드: 현재 세션과 같은 PIN을 쓰는 모든 세션(회차)의 요약 정보
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> | { sessionId: string } }
) {
  try {
    const { sessionId } = await Promise.resolve(params)
    const viewerId = request.nextUrl.searchParams.get('viewerId')
    // 뷰어(이름 기준 본인 판별용)와 현재 세션을 병렬 조회 (왕복 지연 최소화)
    const [viewer, current] = await Promise.all([
      viewerId
        ? prisma.user.findUnique({ where: { id: viewerId }, select: { name: true } })
        : Promise.resolve(null),
      prisma.session.findUnique({
        where: { id: sessionId },
        select: { pinCode: true },
      }),
    ])
    if (!current) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const sessions = await prisma.session.findMany({
      where: { pinCode: current.pinCode },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        isActive: true,
        users: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' } },
        conversations: {
          where: { isShared: true, kind: 'main' },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            userId: true,
            title: true,
            summary: true,
            createdAt: true,
            isAnonymous: true,
            revisions: true,
            user: { select: { name: true } },
          },
        },
      },
    })

    const result = sessions.map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      isActive: s.isActive,
      isCurrent: s.id === sessionId,
      members: s.users,
      conversations: s.conversations.map((conv) => {
        const isMine = viewer
          ? conv.user.name === viewer.name
          : viewerId !== null && conv.userId === viewerId
        return {
          id: conv.id,
          userName: conv.isAnonymous && !isMine ? '익명' : conv.user.name,
          isMine,
          title: conv.title || '(제목 없음)',
          summary: conv.summary,
          createdAt: conv.createdAt,
          revisionCount: Array.isArray(conv.revisions) ? conv.revisions.length : 0,
        }
      }),
    }))

    return NextResponse.json({ pinCode: current.pinCode, sessions: result })
  } catch (error: any) {
    console.error('Dashboard API error:', error.message)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data', details: error.message },
      { status: 500 }
    )
  }
}
