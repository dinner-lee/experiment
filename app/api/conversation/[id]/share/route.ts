import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    let id = resolvedParams.id
    
    if (!id) {
      const url = new URL(request.url)
      const pathParts = url.pathname.split('/').filter(Boolean)
      const conversationIndex = pathParts.indexOf('conversation')
      if (conversationIndex !== -1 && conversationIndex + 1 < pathParts.length) {
        id = pathParts[conversationIndex + 1]
      }
    }
    
    if (!id) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      )
    }
    const { summary, editMetadata, messages, pinCode, duration, title } = await request.json()

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        session: {
          select: {
            pinCode: true,
          },
        },
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // PIN 번호 확인 및 로깅
    const conversationPinCode = conversation.session.pinCode
    console.log('Client sent PIN code:', pinCode)
    console.log('Conversation session PIN code:', conversationPinCode)
    
    if (pinCode && pinCode !== conversationPinCode) {
      console.warn('PIN code mismatch! Client:', pinCode, 'Session:', conversationPinCode)
    }

    // 요약 수정 메타데이터가 있으면 로그 기록
    if (editMetadata) {
      await prisma.userLog.create({
        data: {
          userId: conversation.userId,
          sessionId: conversation.sessionId,
          eventType: 'edit_summary',
          metadata: editMetadata,
        },
      })
    }

    // 업데이트할 데이터 준비
    const updateData: {
      summary?: string
      title?: string
      messages?: any
      duration?: number
      isShared: boolean
    } = {
      isShared: true,
    }

    // duration이 제공되면 업데이트
    if (duration !== undefined && duration !== null) {
      updateData.duration = Math.max(0, Math.floor(duration))
      console.log('Updating duration:', updateData.duration, 'seconds')
    }

    if (summary) {
      updateData.summary = summary
    }

    // 클라이언트에서 title을 보낸 경우 우선 사용
    if (title && title.trim() !== '') {
      updateData.title = title.trim()
    } else if (summary && (!conversation.title || conversation.title.trim() === '')) {
      // 제목이 비어있으면 요약의 첫 부분을 제목으로 사용
      const titleFromSummary = summary.trim().substring(0, 50)
      updateData.title = titleFromSummary
    }

    // 클라이언트에서 보낸 messages가 있으면 사용, 없으면 기존 messages 유지
    if (messages && Array.isArray(messages) && messages.length > 0) {
      console.log('Updating messages from client:', messages.length)
      updateData.messages = messages
    } else {
      console.log('No messages from client, keeping existing messages')
    }

    // 대화 공유
    const updatedConversation = await prisma.conversation.update({
      where: { id },
      data: updateData,
      include: {
        session: {
          select: {
            pinCode: true,
          },
        },
      },
    })

    console.log('Shared conversation:', updatedConversation.id)
    console.log('Is shared:', updatedConversation.isShared)
    console.log('Title:', updatedConversation.title)
    console.log('Summary:', updatedConversation.summary?.substring(0, 50))
    console.log('Session PIN code:', updatedConversation.session.pinCode)
    console.log('Stored messages:', JSON.stringify(updatedConversation.messages, null, 2))
    
    // 공유 후 즉시 조회해서 확인
    const verifyConversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        isShared: true,
        title: true,
        session: {
          select: {
            pinCode: true,
          },
        },
      },
    })
    console.log('Verified conversation after share:', verifyConversation)

    // 공유 로그 기록
    await prisma.userLog.create({
      data: {
        userId: conversation.userId,
        sessionId: conversation.sessionId,
        eventType: 'share',
        metadata: { conversationId: id },
      },
    })

    return NextResponse.json({ 
      conversation: {
        ...updatedConversation,
        session: {
          pinCode: updatedConversation.session.pinCode,
        },
      },
      success: true,
    })
  } catch (error: any) {
    console.error('Share conversation error:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    })
    return NextResponse.json(
      { 
        error: 'Failed to share conversation',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 }
    )
  }
}

