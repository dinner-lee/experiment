import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { prisma } from '@/lib/prisma'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// 학습자용 비교 분석: 공유된 요약들의 공통점 / 관점 차이 / 개인별 고유 의견을 추출
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> | { sessionId: string } }
) {
  try {
    const { sessionId } = await Promise.resolve(params)
    const { viewerId } = await request.json().catch(() => ({ viewerId: null }))

    const conversations = await prisma.conversation.findMany({
      where: {
        sessionId,
        isShared: true,
        kind: 'main',
      },
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    if (conversations.length < 2) {
      return NextResponse.json({
        status: 'not_enough',
        count: conversations.length,
        message: '비교하려면 2명 이상의 공유된 의견이 필요합니다.',
      })
    }

    // 익명 공유자는 일관된 가명으로 표시 (본인에게는 자신의 이름 그대로)
    let anonIndex = 0
    const entries = conversations.map((conv) => {
      const isMine = viewerId !== null && conv.userId === viewerId
      let displayName = conv.user.name
      if (conv.isAnonymous && !isMine) {
        anonIndex += 1
        displayName = `익명 ${anonIndex}`
      }
      return { displayName, isMine, summary: conv.summary }
    })

    const summariesText = entries
      .map((e) => `[${e.displayName}]\n${e.summary}`)
      .join('\n\n')

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `당신은 협력 학습에서 학습자들의 의견(정신모형)을 비교 분석하는 전문가입니다. 여러 학습자가 "자하연 학생식당 공간 재구성" 과제에 대해 작성한 의견 요약을 비교하여, 반드시 아래 JSON 형식으로만 응답하세요.

{
  "commonPoints": [{"point": "공통으로 언급된 핵심 개념/주장 (한 문장)", "users": ["이름", ...]}],
  "differences": [{"topic": "의견이 갈리는 주제", "stances": [{"user": "이름", "position": "그 사람의 입장 (한 문장)"}]}],
  "uniquePoints": [{"user": "이름", "points": ["그 사람만 언급한 고유한 아이디어 (한 문장)", ...]}],
  "discussionQuestions": ["차이점을 조율하기 위해 팀이 논의하면 좋을 질문", ...]
}

규칙:
1. commonPoints는 2명 이상이 공통으로 언급한 것만 포함하고, users에 해당 학습자 이름을 모두 나열하세요.
2. differences는 같은 주제에 대해 서로 다른 입장을 보이는 경우만 포함하세요 (최대 4개).
3. uniquePoints는 각 학습자마다 그 사람만 언급한 아이디어를 1~3개 추출하세요. 모든 학습자를 포함하세요.
4. discussionQuestions는 2~3개 제안하세요.
5. 학습자 이름은 대괄호 안에 주어진 표기 그대로 사용하세요.`,
        },
        {
          role: 'user',
          content: `다음 학습자들의 의견 요약을 비교 분석해주세요:\n\n${summariesText}`,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content || '{}'
    let analysis
    try {
      analysis = JSON.parse(raw)
    } catch {
      return NextResponse.json(
        { error: '분석 결과 해석에 실패했습니다. 다시 시도해주세요.' },
        { status: 500 }
      )
    }

    // 비교 분석 실행 로그
    if (viewerId) {
      await prisma.userLog
        .create({
          data: {
            userId: viewerId,
            sessionId,
            eventType: 'compare_analysis',
            metadata: { conversationCount: conversations.length },
          },
        })
        .catch(() => {})
    }

    return NextResponse.json({
      status: 'ok',
      count: conversations.length,
      analysis,
    })
  } catch (error: any) {
    console.error('Compare analysis error:', error)
    return NextResponse.json(
      { error: '비교 분석에 실패했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
