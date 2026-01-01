import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> | { sessionId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const { sessionId } = resolvedParams
    
    console.log('Fetching conversations for sessionId:', sessionId)

    // 세션 정보 조회 (PIN 번호 확인)
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { pinCode: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // 모든 공유된 대화를 조회 (PIN 번호 필터링은 클라이언트에서 처리)
    const conversations = await prisma.conversation.findMany({
      where: {
        isShared: true,
      },
      include: {
        user: true,
        session: {
          select: {
            pinCode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    console.log('Found shared conversations:', conversations.length)
    console.log('Current session PIN code:', session.pinCode)
    console.log('Conversations with PIN codes:', conversations.map(c => ({
      id: c.id,
      title: c.title,
      pinCode: c.session.pinCode,
      isShared: c.isShared,
    })))

    const result = conversations
      .filter((conv) => conv.session && conv.user) // session과 user가 있는 대화만
      .map((conv) => ({
        id: conv.id,
        userName: conv.user.name,
        title: conv.title || '(제목 없음)', // 제목이 없으면 기본값
        summary: conv.summary,
        createdAt: conv.createdAt,
        duration: conv.duration,
        turnCount: conv.turnCount,
        pinCode: conv.session?.pinCode || null, // PIN 번호 포함 (클라이언트 필터링용)
      }))

    console.log('Returning conversations:', result.length)
    console.log('Current PIN code:', session.pinCode)

    return NextResponse.json({ 
      conversations: result,
      currentPinCode: session.pinCode, // 현재 세션의 PIN 번호 반환
    })
  } catch (error: any) {
    console.error('Failed to fetch conversations:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    })
    return NextResponse.json(
      { 
        error: 'Failed to fetch conversations',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}

