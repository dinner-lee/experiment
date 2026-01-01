import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Papa from 'papaparse'

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
    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'json'

    const session = await prisma.session.findUnique({
      where: { pinCode: actualPinCode },
      include: {
        users: {
          include: {
            conversations: true,
            userLogs: true,
            viewLogs: {
              include: {
                conversation: {
                  include: {
                    user: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // 사용자별 로그 데이터 생성 (JSON 응답용 - 총합계)
    const userLogs = session.users.map((user) => {
      const conversations = user.conversations
      const totalChatTurns = conversations.reduce((sum, conv) => sum + conv.turnCount, 0)
      const totalChatDuration = conversations.reduce((sum, conv) => sum + conv.duration, 0)

      // 요약 수정 메타데이터 추출
      const editLogs = user.userLogs.filter((log) => log.eventType === 'edit_summary')
      const editMetadata = editLogs.map((log) => log.metadata as any)
      const totalCharsDeleted = editMetadata.reduce(
        (sum, meta) => sum + (meta.charsDeleted || 0),
        0
      )
      const totalCharsAdded = editMetadata.reduce(
        (sum, meta) => sum + (meta.charsAdded || 0),
        0
      )

      // 다른 사용자 대화 열람 통계
      const viewLogs = user.viewLogs
      
      // 자신의 대화 로그 열람 시간과 다른 동료의 대화 로그 열람 시간 분리
      let selfViewDuration = 0
      let otherViewDuration = 0
      let selfViewCount = 0
      let otherViewCount = 0
      
      viewLogs.forEach((log) => {
        // conversation과 user가 존재하는지 확인
        if (!log.conversation || !log.conversation.user) {
          return
        }
        const authorId = log.conversation.userId
        if (authorId === user.id) {
          // 자신의 대화 로그 열람 시간 및 횟수
          selfViewDuration += log.duration
          selfViewCount += 1
        } else {
          // 다른 동료의 대화 로그 열람 시간 및 횟수
          otherViewDuration += log.duration
          otherViewCount += 1
        }
      })
      
      // 총 열람 시간 = 자신의 대화 열람 시간 + 다른 동료의 대화 열람 시간
      const totalViewDuration = selfViewDuration + otherViewDuration
      // 총 열람 횟수 = 자신의 대화 열람 횟수 + 다른 동료의 대화 열람 횟수
      const totalViewCount = selfViewCount + otherViewCount
      
      const viewCountByConversation = viewLogs.reduce((acc, log) => {
        const convId = log.conversationId
        acc[convId] = (acc[convId] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      // 동료별(작성자별) 열람 횟수 계산
      const viewCountByAuthor = viewLogs.reduce((acc, log) => {
        // conversation과 user가 존재하는지 확인
        if (!log.conversation || !log.conversation.user) {
          return acc
        }
        const authorId = log.conversation.userId
        const authorName = log.conversation.user.name
        if (authorId !== user.id) { // 자신의 대화는 제외
          const key = `${authorName} (${authorId})`
          acc[key] = (acc[key] || 0) + 1
        }
        return acc
      }, {} as Record<string, number>)

      return {
        userId: user.id,
        userName: user.name,
        totalChatTurns,
        totalChatDuration,
        totalCharsDeleted,
        totalCharsAdded,
        selfViewDuration, // 자신의 대화 로그 열람 시간
        otherViewDuration, // 다른 동료의 대화 로그 열람 시간
        totalViewDuration, // 총 열람 시간 (자신 + 다른 동료)
        selfViewCount, // 자신의 대화 로그 열람 횟수
        otherViewCount, // 다른 동료의 대화 로그 열람 횟수
        totalViewCount, // 총 열람 횟수 (자신 + 다른 동료)
        viewCountByConversation: JSON.stringify(viewCountByConversation),
        viewCountByAuthor: JSON.stringify(viewCountByAuthor), // 동료별 열람 횟수
        conversationCount: conversations.length,
      }
    })

    if (format === 'csv') {
      // CSV용 상세 데이터 생성 (각 대화별, 각 열람별로 행 생성)
      const csvRows: any[] = []
      
      session.users.forEach((user) => {
        const conversations = user.conversations
        const viewLogs = user.viewLogs
        
        // 각 대화별 데이터 행 생성
        conversations.forEach((conv) => {
          // 해당 대화의 요약 수정 로그 찾기
          const editLogs = user.userLogs.filter(
            (log) => log.eventType === 'edit_summary' && log.conversationId === conv.id
          )
          const editMetadata = editLogs.map((log) => log.metadata as any)
          const charsDeleted = editMetadata.reduce(
            (sum, meta) => sum + (meta.charsDeleted || 0),
            0
          )
          const charsAdded = editMetadata.reduce(
            (sum, meta) => sum + (meta.charsAdded || 0),
            0
          )
          
          csvRows.push({
            '사용자 ID': user.id,
            '사용자 이름': user.name,
            '데이터 유형': '대화',
            '대화 ID': conv.id,
            '대화 제목': conv.title || '(제목 없음)',
            '대화 턴 수': conv.turnCount || 0,
            '대화 지속 시간(초)': conv.duration || 0,
            '요약 수정 - 삭제한 글자 수': charsDeleted,
            '요약 수정 - 추가한 글자 수': charsAdded,
            '열람 유형': '', // 대화 데이터이므로 빈 값
            '열람한 대화 ID': '',
            '열람한 대화 제목': '',
            '열람한 대화 작성자': '',
            '열람 시간(초)': '',
            '열람 횟수': '',
          })
        })
        
        // 각 열람 로그별 데이터 행 생성
        viewLogs.forEach((viewLog) => {
          if (!viewLog.conversation || !viewLog.conversation.user) {
            return
          }
          
          const authorId = viewLog.conversation.userId
          const isSelfView = authorId === user.id
          const viewType = isSelfView ? '자신의 대화 열람' : '동료의 대화 열람'
          
          csvRows.push({
            '사용자 ID': user.id,
            '사용자 이름': user.name,
            '데이터 유형': '열람',
            '대화 ID': '', // 열람 데이터이므로 빈 값
            '대화 제목': '',
            '대화 턴 수': '',
            '대화 지속 시간(초)': '',
            '요약 수정 - 삭제한 글자 수': '',
            '요약 수정 - 추가한 글자 수': '',
            '열람 유형': viewType,
            '열람한 대화 ID': viewLog.conversationId,
            '열람한 대화 제목': viewLog.conversation.title || '(제목 없음)',
            '열람한 대화 작성자': viewLog.conversation.user.name,
            '열람 시간(초)': viewLog.duration || 0,
            '열람 횟수': 1, // 각 행이 한 번의 열람을 나타냄
          })
        })
      })
      
      const csv = Papa.unparse(csvRows)
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="session-${actualPinCode}-logs-detail.csv"`,
        },
      })
    }

    return NextResponse.json({ logs: userLogs })
  } catch (error: any) {
    console.error('Failed to fetch logs:', error)
    console.error('Error stack:', error.stack)
    return NextResponse.json(
      { 
        error: 'Failed to fetch logs',
        details: error.message || '알 수 없는 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}

