import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 파라미터를 세션 ID 우선으로 해석하고, 아니면 PIN으로 최신 세션을 찾는다
// (동일 PIN 아래 여러 세션 허용에 따른 겸용 처리)
async function resolveSessionId(param: string): Promise<string | null> {
  const byId = await prisma.session.findUnique({ where: { id: param }, select: { id: true } })
  if (byId) return byId.id
  const byPin = await prisma.session.findFirst({
    where: { pinCode: param },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  return byPin?.id ?? null
}

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

    const targetId = await resolveSessionId(actualPinCode)
    if (!targetId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // 대화 원문은 별도 목록 API에서 조회하므로 여기서는 세션 기본 정보만 반환 (페이로드 최소화)
    const session = await prisma.session.findUnique({
      where: { id: targetId },
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

    const targetId = await resolveSessionId(pinCode)
    if (!targetId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // 빈 문자열은 null로 저장 → 기본값 사용
    const normalize = (v: unknown) =>
      typeof v === 'string' && v.trim() !== '' ? v.trim() : null

    const session = await prisma.session.update({
      where: { id: targetId },
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
