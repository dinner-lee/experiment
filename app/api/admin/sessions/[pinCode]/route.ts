import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pinCode: string }> | { pinCode: string } }
) {
  try {
    // Next.js 15+ 호환성: params가 Promise일 수 있음
    const resolvedParams = await Promise.resolve(params)
    const { pinCode } = resolvedParams
    
    // URL에서 직접 추출하는 fallback
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const pinCodeFromUrl = pathParts[pathParts.length - 1]
    const actualPinCode = pinCode || pinCodeFromUrl
    
    if (!actualPinCode) {
      return NextResponse.json({ error: 'PIN code is required' }, { status: 400 })
    }

    // 대화 원문은 별도 목록 API에서 조회하므로 여기서는 세션 기본 정보만 반환 (페이로드 최소화)
    const session = await prisma.session.findUnique({
      where: { pinCode: actualPinCode },
      select: {
        id: true,
        pinCode: true,
        hasAIChat: true,
        chatModel: true,
        chatFirstQuestion: true,
        chatSystemPrompt: true,
        users: { select: { id: true, name: true } },
        _count: {
          select: { conversations: { where: { isShared: true } } },
        },
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({
      session: {
        id: session.id,
        pinCode: session.pinCode,
        hasAIChat: session.hasAIChat,
        chatModel: session.chatModel,
        chatFirstQuestion: session.chatFirstQuestion,
        chatSystemPrompt: session.chatSystemPrompt,
        userCount: session.users.length,
        users: session.users,
        conversationCount: session._count.conversations,
      },
    })
  } catch (error: any) {
    console.error('Failed to fetch session:', error)
    console.error('Error stack:', error.stack)
    return NextResponse.json(
      { 
        error: 'Failed to fetch session',
        details: error.message || '알 수 없는 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}


// 세션별 AI 대화 설정 수정 (모델, 첫 질문, 시스템 프롬프트)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ pinCode: string }> | { pinCode: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const { pinCode } = resolvedParams

    if (!pinCode) {
      return NextResponse.json({ error: 'PIN code is required' }, { status: 400 })
    }

    const { chatModel, chatFirstQuestion, chatSystemPrompt } = await request.json()

    // 빈 문자열은 null로 저장 → 기본값 사용
    const normalize = (v: unknown) =>
      typeof v === 'string' && v.trim() !== '' ? v.trim() : null

    const session = await prisma.session.update({
      where: { pinCode },
      data: {
        chatModel: normalize(chatModel),
        chatFirstQuestion: normalize(chatFirstQuestion),
        chatSystemPrompt: normalize(chatSystemPrompt),
      },
      select: {
        id: true,
        pinCode: true,
        chatModel: true,
        chatFirstQuestion: true,
        chatSystemPrompt: true,
      },
    })

    return NextResponse.json({ session })
  } catch (error: any) {
    console.error('Failed to update session chat settings:', error)
    return NextResponse.json(
      { error: 'AI 대화 설정 저장에 실패했습니다', details: error.message },
      { status: 500 }
    )
  }
}
