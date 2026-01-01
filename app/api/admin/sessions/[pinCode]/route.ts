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

    const session = await prisma.session.findUnique({
      where: { pinCode: actualPinCode },
      include: {
        users: true,
        conversations: {
          where: { isShared: true },
          include: {
            user: true,
          },
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
        userCount: session.users.length,
        users: session.users.map(u => ({ id: u.id, name: u.name })),
        conversations: session.conversations,
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

