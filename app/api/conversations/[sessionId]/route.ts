import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> | { sessionId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const { sessionId } = resolvedParams

    // 열람자 확인 (익명 처리 및 본인 대화 식별용)
    // 본인 여부는 이름 기준 — 재입장/세션 이동 후에도 자기 의견을 인식 (수정 권한 검사와 동일 기준)
    const viewerId = request.nextUrl.searchParams.get('viewerId')
    const viewer = viewerId
      ? await prisma.user.findUnique({ where: { id: viewerId }, select: { name: true } })
      : null

    // 단일 쿼리: 세션 + 이 세션의 공유된 대화만 조회.
    // 목록에 불필요한 대화 원문(messages)은 제외하여 페이로드를 최소화
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        pinCode: true,
        createdAt: true,
        users: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' } },
        conversations: {
          where: { isShared: true, kind: 'main' },
          select: {
            id: true,
            userId: true,
            title: true,
            summary: true,
            createdAt: true,
            duration: true,
            turnCount: true,
            isAnonymous: true,
            shareScope: true,
            revisions: true,
            user: { select: { name: true } },
            viewLogs: {
              select: {
                viewerId: true,
                viewer: { select: { name: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const conversations = session.conversations

    const result = conversations.map((conv) => {
      const isMine = viewer
        ? conv.user.name === viewer.name
        : viewerId !== null && conv.userId === viewerId
      // 읽음 표시: 작성자 본인을 제외한 고유 열람자
      const readerNames = Array.from(
        new Map(
          conv.viewLogs
            .filter((v) => v.viewerId !== conv.userId)
            .map((v) => [v.viewerId, v.viewer?.name || '알 수 없음'])
        ).values()
      )
      return {
        id: conv.id,
        userName: conv.isAnonymous && !isMine ? '익명' : conv.user.name,
        isMine,
        isAnonymous: conv.isAnonymous,
        shareScope: conv.shareScope,
        title: conv.title || '(제목 없음)',
        summary: conv.summary,
        createdAt: conv.createdAt,
        duration: conv.duration,
        turnCount: conv.turnCount,
        pinCode: session.pinCode,
        readerCount: readerNames.length,
        readerNames,
        revisionCount: Array.isArray(conv.revisions) ? conv.revisions.length : 0,
      }
    })

    return NextResponse.json({
      conversations: result,
      currentPinCode: session.pinCode,
      sessionCreatedAt: session.createdAt,
      members: session.users,
    })
  } catch (error: any) {
    console.error('Failed to fetch conversations:', error.message)
    return NextResponse.json(
      {
        error: 'Failed to fetch conversations',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}
