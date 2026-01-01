import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const { viewerId, conversationId, duration } = await request.json()

    if (!viewerId || !conversationId || duration === undefined) {
      return NextResponse.json(
        { error: 'viewerId, conversationId, and duration are required' },
        { status: 400 }
      )
    }

    const viewLog = await prisma.viewLog.create({
      data: {
        viewerId,
        conversationId,
        duration,
      },
    })

    return NextResponse.json({ viewLog })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create view log' }, { status: 500 })
  }
}

