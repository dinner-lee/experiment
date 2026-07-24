import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 학습자가 현재 세션과 같은 PIN 아래 새 세션(회차)을 만들고 곧바로 참여한다.
// 새 세션은 현재 세션의 설정을 복제하고 입장 대상으로 지정된다.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> | { sessionId: string } }
) {
  try {
    const { sessionId } = await Promise.resolve(params)
    const { name, userName } = await request.json()

    if (!userName || typeof userName !== 'string' || userName.trim() === '') {
      return NextResponse.json({ error: '사용자 이름이 필요합니다' }, { status: 400 })
    }

    const source = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        pinCode: true,
        hasAIChat: true,
        question: true,
        showSharedAnswers: true,
        chatModel: true,
        chatFirstQuestion: true,
        chatSystemPrompt: true,
      },
    })
    if (!source) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
    }

    const [, newSession] = await prisma.$transaction([
      // 새 세션이 입장 대상이 되도록 기존 지정 해제
      prisma.session.updateMany({
        where: { pinCode: source.pinCode },
        data: { isJoinTarget: false },
      }),
      prisma.session.create({
        data: {
          pinCode: source.pinCode,
          name: typeof name === 'string' && name.trim() !== '' ? name.trim() : null,
          isActive: true,
          isJoinTarget: true,
          hasAIChat: source.hasAIChat,
          question: source.question,
          showSharedAnswers: source.showSharedAnswers,
          chatModel: source.chatModel,
          chatFirstQuestion: source.chatFirstQuestion,
          chatSystemPrompt: source.chatSystemPrompt,
        },
      }),
    ])

    // 생성자를 새 세션에 바로 참여시킴
    const user = await prisma.user.create({
      data: { name: userName.trim(), sessionId: newSession.id },
    })
    await prisma.userLog
      .create({
        data: {
          userId: user.id,
          sessionId: newSession.id,
          eventType: 'join',
          metadata: { via: 'new_session' },
        },
      })
      .catch(() => {})

    return NextResponse.json({
      session: { id: newSession.id, pinCode: newSession.pinCode, name: newSession.name },
      user: { id: user.id, name: user.name },
    })
  } catch (error: any) {
    console.error('New session error:', error)
    return NextResponse.json(
      { error: '새 세션 생성에 실패했습니다', details: error.message },
      { status: 500 }
    )
  }
}
