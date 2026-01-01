import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// PIN 생성
export async function POST(request: NextRequest) {
  try {
    const { pinCode, hasAIChat } = await request.json()
    
    if (!pinCode) {
      return NextResponse.json({ error: 'PIN code is required' }, { status: 400 })
    }

    // 데이터베이스 연결 테스트
    await prisma.$connect()

    const session = await prisma.session.create({
      data: {
        pinCode,
        isActive: true,
        hasAIChat: hasAIChat !== undefined ? hasAIChat : true, // 기본값은 true
      },
    })

    return NextResponse.json({ session })
  } catch (error: any) {
    console.error('Create PIN error:', error)
    
    // Prisma 에러 처리
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'PIN code already exists' }, { status: 409 })
    }
    
    // 데이터베이스 연결 에러
    if (error.code === 'P1001' || error.message?.includes('Can\'t reach database')) {
      return NextResponse.json(
        { 
          error: '데이터베이스 연결에 실패했습니다. Supabase 프로젝트가 활성화되어 있는지 확인해주세요.',
          details: error.message 
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Failed to create PIN',
        details: error.message || String(error),
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    )
  }
}

// PIN 목록 조회
export async function GET() {
  try {
    // 데이터베이스 연결 테스트
    await prisma.$connect()

    const sessions = await prisma.session.findMany({
      where: { isActive: true },
      include: {
        users: true,
        conversations: {
          where: { isShared: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const result = sessions.map(session => ({
      pinCode: session.pinCode,
      id: session.id,
      createdAt: session.createdAt,
      userCount: session.users.length,
      conversationCount: session.conversations.length,
    }))

    return NextResponse.json({ sessions: result })
  } catch (error: any) {
    console.error('Fetch PINs error:', error)
    
    // 데이터베이스 연결 에러
    if (error.code === 'P1001' || error.message?.includes('Can\'t reach database')) {
      return NextResponse.json(
        { 
          error: '데이터베이스 연결에 실패했습니다.',
          sessions: [] // 빈 배열 반환하여 UI가 깨지지 않도록
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Failed to fetch PINs',
        sessions: [] // 빈 배열 반환하여 UI가 깨지지 않도록
      },
      { status: 500 }
    )
  }
}

// PIN 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const pinCode = searchParams.get('pinCode')

    if (!pinCode) {
      return NextResponse.json({ error: 'PIN code is required' }, { status: 400 })
    }

    await prisma.session.update({
      where: { pinCode },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete PIN' }, { status: 500 })
  }
}

