import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 관리자: 선택한 대화 로그들을 다른 세션(회차)으로 이동
export async function POST(request: NextRequest) {
  try {
    const { conversationIds, targetSessionId } = await request.json()

    if (!Array.isArray(conversationIds) || conversationIds.length === 0 || !targetSessionId) {
      return NextResponse.json(
        { error: 'conversationIds와 targetSessionId가 필요합니다' },
        { status: 400 }
      )
    }

    const target = await prisma.session.findUnique({
      where: { id: targetSessionId },
      select: { id: true },
    })
    if (!target) {
      return NextResponse.json({ error: '대상 세션을 찾을 수 없습니다' }, { status: 404 })
    }

    const result = await prisma.conversation.updateMany({
      where: { id: { in: conversationIds } },
      data: { sessionId: targetSessionId },
    })

    return NextResponse.json({ success: true, moved: result.count })
  } catch (error: any) {
    console.error('Move conversations error:', error)
    return NextResponse.json(
      { error: '대화 이동에 실패했습니다', details: error.message },
      { status: 500 }
    )
  }
}
