import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 새 대화 생성
export async function POST(request: NextRequest) {
  try {
    const { userId, sessionId, messages, startTime, title, summary, duration, turnCount } = await request.json()

    if (!userId || !sessionId || !messages) {
      return NextResponse.json(
        { error: 'userId, sessionId, and messages are required' },
        { status: 400 }
      )
    }

    console.log('Creating conversation with messages:', JSON.stringify(messages, null, 2))
    console.log('Messages count:', Array.isArray(messages) ? messages.length : 'not an array')
    console.log('Title:', title)
    console.log('Summary:', summary)

    const conversation = await prisma.conversation.create({
      data: {
        userId,
        sessionId,
        messages: messages,
        summary: summary || '',
        title: title || '',
        duration: duration || 0,
        turnCount: turnCount !== undefined ? turnCount : (messages.length / 2), // 대략적인 턴 수
        isShared: false,
      },
    })

    console.log('Created conversation:', conversation.id)
    console.log('Stored messages:', JSON.stringify(conversation.messages, null, 2))

    // 활동 로그 기록
    await prisma.userLog.create({
      data: {
        userId,
        sessionId,
        eventType: 'chat_start',
        metadata: { conversationId: conversation.id, startTime },
      },
    })

    return NextResponse.json({ conversation })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}

// 대화 업데이트
export async function PUT(request: NextRequest) {
  try {
    const { conversationId, messages, duration, turnCount } = await request.json()

    if (!conversationId || !messages) {
      return NextResponse.json(
        { error: 'conversationId and messages are required' },
        { status: 400 }
      )
    }

    console.log('Updating conversation:', conversationId)
    console.log('Messages to update:', JSON.stringify(messages, null, 2))
    console.log('Messages count:', Array.isArray(messages) ? messages.length : 'not an array')

    const conversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        messages,
        duration: duration || 0,
        turnCount: turnCount || messages.length / 2,
      },
    })

    console.log('Updated conversation:', conversation.id)
    console.log('Stored messages:', JSON.stringify(conversation.messages, null, 2))

    return NextResponse.json({ conversation })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 })
  }
}

