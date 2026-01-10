import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> | { sessionId: string } }
) {
  try {
    // Next.js 15+ 호환성: params가 Promise일 수 있음
    const resolvedParams = await Promise.resolve(params)
    const { sessionId } = resolvedParams

    // URL에서 직접 추출하는 fallback
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const sessionIdFromUrl = pathParts[pathParts.length - 2] // /api/session/[sessionId]/pin
    const actualSessionId = sessionId || sessionIdFromUrl

    if (!actualSessionId) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })
    }

    const session = await prisma.session.findUnique({
      where: { id: actualSessionId },
      select: { pinCode: true, hasAIChat: true, question: true, showSharedAnswers: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    return NextResponse.json({ 
      pinCode: session.pinCode, 
      hasAIChat: session.hasAIChat,
      question: session.question || null,
      showSharedAnswers: session.showSharedAnswers,
    })
  } catch (error: any) {
    console.error('Failed to fetch PIN code:', error)
    return NextResponse.json(
      { error: 'Failed to fetch PIN code' },
      { status: 500 }
    )
  }
}

