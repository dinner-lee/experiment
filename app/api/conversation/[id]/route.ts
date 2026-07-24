import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
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

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        user: true,
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // messages 확인 및 로깅
    console.log('Conversation messages type:', typeof conversation.messages)
    console.log('Conversation messages is array:', Array.isArray(conversation.messages))
    console.log('Conversation messages:', JSON.stringify(conversation.messages, null, 2))
    
    // messages가 배열이 아닌 경우 처리
    if (conversation.messages && !Array.isArray(conversation.messages)) {
      console.warn('Messages is not an array, attempting to parse')
      if (typeof conversation.messages === 'string') {
        try {
          conversation.messages = JSON.parse(conversation.messages)
        } catch (e) {
          console.error('Failed to parse messages:', e)
          conversation.messages = []
        }
      } else {
        conversation.messages = []
      }
    }

    // 열람자 기준 공개 범위 적용 (작성자 본인은 항상 전체 열람 가능)
    const viewerId = request.nextUrl.searchParams.get('viewerId')
    const isOwner = viewerId !== null && viewerId === conversation.userId
    const payload: any = { ...conversation, isOwner }
    if (!isOwner && conversation.shareScope === 'summary_only') {
      payload.messages = []
      payload.messagesHidden = true
    }
    if (!isOwner && conversation.isAnonymous) {
      payload.user = { ...conversation.user, name: '익명' }
    }

    return NextResponse.json({ conversation: payload })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch conversation' },
      { status: 500 }
    )
  }
}

// 대화 제목과 요약 수정
export async function PATCH(
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

    const { title, summary, userId, revise, revisionReason } = await request.json()

    if (!title && !summary) {
      return NextResponse.json(
        { error: 'Title or summary is required' },
        { status: 400 }
      )
    }

    // 대화 조회
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        user: true,
      },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // 사용자 확인
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // 작성자 확인 (이름으로 비교)
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (conversation.user.name !== user.name) {
      return NextResponse.json(
        { error: 'Only the author can edit this conversation' },
        { status: 403 }
      )
    }

    // 수정할 데이터 준비
    const updateData: { title?: string; summary?: string; revisions?: any } = {}
    if (title !== undefined) updateData.title = title
    if (summary !== undefined) updateData.summary = summary

    // 동료 의견 비교 후 명시적 수정: 최초 버전만 이력에 보존 (최종 버전은 summary 필드 자체)
    if (revise && summary !== undefined) {
      const prevRevisions = Array.isArray(conversation.revisions) ? conversation.revisions : []
      const firstVersion = prevRevisions[0] ?? {
        summary: conversation.summary,
        editedAt: new Date().toISOString(),
        phase: 'original',
        reason: revisionReason || null,
      }
      updateData.revisions = [firstVersion]
    }

    // 대화 업데이트
    const updatedConversation = await prisma.conversation.update({
      where: { id },
      data: updateData,
      include: {
        user: true,
      },
    })

    // 활동 로그 기록
    const charsChanged = {
      title: title ? Math.abs((title.length || 0) - (conversation.title?.length || 0)) : 0,
      summary: summary ? Math.abs((summary.length || 0) - (conversation.summary?.length || 0)) : 0,
    }

    await prisma.userLog.create({
      data: {
        userId: user.id,
        sessionId: conversation.sessionId,
        eventType: 'edit_summary',
        metadata: {
          conversationId: id,
          charsChanged,
          ...(revise ? { phase: 'after_compare' } : {}),
        },
      },
    })

    return NextResponse.json({ conversation: updatedConversation })
  } catch (error: any) {
    console.error('Failed to update conversation:', error)
    return NextResponse.json(
      { error: 'Failed to update conversation', details: error.message },
      { status: 500 }
    )
  }
}
