import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { pinCode, userName } = await request.json()

    if (!pinCode || !userName) {
      return NextResponse.json(
        { error: 'PIN code and user name are required' },
        { status: 400 }
      )
    }

    const session = await prisma.session.findUnique({
      where: { pinCode, isActive: true },
      include: { users: true },
    })

    if (!session) {
      return NextResponse.json({ error: 'Invalid PIN code' }, { status: 404 })
    }

    // 동일한 이름이 이미 존재하는지 확인
    const existingUser = session.users.find((u) => u.name === userName)

    let user
    if (existingUser) {
      // 기존 사용자가 있으면 재사용
      user = existingUser
    } else {
      // 최대 4명 제한
      if (session.users.length >= 4) {
        return NextResponse.json(
          { error: 'Session is full (max 4 users)' },
          { status: 403 }
        )
      }

      // 새 사용자 생성
      user = await prisma.user.create({
        data: {
          name: userName,
          sessionId: session.id,
        },
      })
    }

    // 활동 로그 기록 (기존 사용자 재접속인 경우에도 기록)
    await prisma.userLog.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        eventType: 'join',
        metadata: {},
      },
    })

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        sessionId: user.sessionId,
      },
      session: {
        id: session.id,
        pinCode: session.pinCode,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to join session' }, { status: 500 })
  }
}

