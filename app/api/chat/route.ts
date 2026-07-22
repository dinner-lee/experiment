import { NextRequest, NextResponse } from 'next/server'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { prisma } from '@/lib/prisma'

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// 기본 모델 (세션별 설정이 없을 때 사용)
const CHAT_MODEL = (process.env.OPENAI_CHAT_MODEL || 'gpt-4o') as any

// 기본 첫 질문 (관리자가 세션별로 변경 가능)
const DEFAULT_FIRST_QUESTION =
  '자하연 학생식당 공간 재구성 과제를 어떻게 해결하는 것이 좋을까요? 공간 재설계 방안을 설명하고, 그렇게 재구성한 이유를 한 문단(5문장 이상)으로 제시하세요.'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('API received body:', JSON.stringify(body, null, 2))
    const { messages, data } = body

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 })
    }

    // 먼저 메시지를 처리하여 content 추출 (UIMessage 형식 지원)
    const processedMessagesForCheck = messages.map((m: any) => {
      // parts 배열에서 텍스트 추출 (UIMessage 형식)
      if (m.parts && Array.isArray(m.parts)) {
        const textParts = m.parts.filter((p: any) => p.type === 'text')
        const content = textParts.map((p: any) => p.text || '').join('')
        return {
          role: m.role,
          content: content || '',
        }
      }
      // content 필드가 직접 있는 경우
      return {
        role: m.role,
        content: m.content || '',
      }
    })
    
    // 이전 assistant 메시지가 있는지 확인 (대화가 이미 시작되었는지)
    const hasAssistantMessage = processedMessagesForCheck.some((m: any) => 
      m.role === 'assistant' && m.content && m.content.trim() !== ''
    )
    
    // 첫 메시지인지 확인: 메시지가 없거나, 비어있거나, "시작" 메시지만 있는 경우
    // 처리된 메시지를 기반으로 판단
    const hasValidUserMessage = processedMessagesForCheck.some((m: any) => {
      if (m.role !== 'user') return false
      const content = m.content || ''
      return content && content.trim() !== '' && content !== '시작'
    })
    
    // 실제 메시지 내용을 기반으로 판단 (더 정확함)
    // assistant 메시지가 이미 있다면 더 이상 첫 메시지가 아님
    const isFirstMessageByContent = !hasAssistantMessage && (
      !hasValidUserMessage || 
      processedMessagesForCheck.length === 0 ||
      (processedMessagesForCheck.length === 1 && processedMessagesForCheck[0]?.role === 'user' && (
        processedMessagesForCheck[0]?.content === '시작' || 
        processedMessagesForCheck[0]?.content === '' ||
        processedMessagesForCheck[0]?.content?.trim() === ''
      ))
    )
    
    // 클라이언트에서 전달된 값과 메시지 내용 기반 판단을 모두 고려
    // 하지만 메시지 내용 기반 판단을 우선시 (더 정확함)
    const isFirstMessage = isFirstMessageByContent

    // 세션별 AI 대화 설정 (관리자 화면에서 지정: 모델, 첫 질문, 시스템 프롬프트)
    let chatSettings: {
      chatModel: string | null
      chatFirstQuestion: string | null
      chatSystemPrompt: string | null
    } | null = null
    if (data?.sessionId) {
      chatSettings = await prisma.session
        .findUnique({
          where: { id: data.sessionId },
          select: { chatModel: true, chatFirstQuestion: true, chatSystemPrompt: true },
        })
        .catch(() => null)
    }
    const model = openai((chatSettings?.chatModel?.trim() || CHAT_MODEL) as any)
    const firstQuestion = chatSettings?.chatFirstQuestion?.trim() || DEFAULT_FIRST_QUESTION

    // 디브리핑(성찰) 모드: 토의가 끝난 뒤 자신의 생각 변화를 점검하고 향후 계획을 세우는 대화
    if (data?.mode === 'debrief') {
      const mySummary = data?.context?.summary || ''
      const teamDoc = data?.context?.teamDocument || ''
      const debriefPrompt = `당신은 협력 학습이 끝난 뒤 학습자의 성찰(디브리핑)을 돕는 촉진자입니다.

학습자는 방금 다음 활동을 마쳤습니다:
1. AI와의 소크라테스식 대화로 "자하연 학생식당 공간 재구성" 과제에 대한 자신의 해결안을 정교화함
2. 동료들과 해결안 요약을 공유하고 유사점·차이점을 비교함
3. 팀 공동 결론 문서를 함께 작성함

${mySummary ? `학습자의 처음 의견 요약:\n"${mySummary}"\n` : ''}${teamDoc ? `팀이 함께 작성한 공동 결론:\n"${teamDoc}"\n` : ''}
대화 원칙:
1. 한 번에 하나의 질문만 하세요.
2. 다음 순서로 성찰을 이끄세요: (1) 토의 전후 자신의 생각이 어떻게 달라졌는지 → (2) 동료의 어떤 의견이 영향을 주었는지 → (3) 아직 해결되지 않았거나 추후 논의가 필요한 사항은 무엇인지 → (4) 다음에 비슷한 문제를 다룬다면 무엇을 다르게 할지.
3. 학습자의 답변에 나온 구체적 내용을 근거로 후속 질문을 하세요.
4. 4~5회 문답이 오간 뒤에는, 학습자의 답변을 바탕으로 "생각의 변화"와 "추후 논의할 사항"을 2~3문장으로 정리해 제시하고 성찰을 마무리하세요.

${isFirstMessage ? '이것은 대화의 시작입니다. 인사 없이 바로 첫 번째 성찰 질문(토의 전후 생각의 변화)을 하세요.' : ''}`

      const debriefMessages = isFirstMessage
        ? [{ role: 'user' as const, content: '' }]
        : processedMessagesForCheck
            .filter((m: any) => m.content !== '시작' && m.content.trim() !== '')
            .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      const debriefResult = await streamText({
        model,
        system: debriefPrompt,
        messages: debriefMessages,
        temperature: 0.7,
      })
      return debriefResult.toUIMessageStreamResponse()
    }

    console.log('isFirstMessage:', isFirstMessage, 'data.isFirstMessage:', data?.isFirstMessage, 'isFirstMessageByContent:', isFirstMessageByContent, 'hasAssistantMessage:', hasAssistantMessage, 'hasValidUserMessage:', hasValidUserMessage, 'messages:', messages.length, 'processedMessagesForCheck:', processedMessagesForCheck.length, 'processedMessagesForCheck content:', processedMessagesForCheck.map((m: any) => ({ role: m.role, content: m.content?.substring(0, 50) })))

    const systemPrompt = isFirstMessage
      ? `당신은 소크라테스의 산파술을 사용하는 교사입니다. 

소크라테스식 산파술의 핵심 원칙:
1. 학생이 이미 알고 있는 지식을 스스로 발견하도록 돕는 것
2. 직접적인 답변을 주지 않고, 질문을 통해 학생의 사고를 이끌어내는 것
3. 학생의 답변을 바탕으로 더 깊이 있는 질문을 하는 것


**매우 중요**: 이것은 대화의 시작입니다. 사용자가 아직 구체적인 답변을 하지 않았으므로, 당신이 반드시 먼저 질문을 시작해야 합니다.
- 인사말, 설명, 서론 없이 바로 질문만 해야 합니다.
- "안녕하세요", "어떤 주제에 대해", "무엇에 대해 이야기하고 싶으신가요" 같은 일반적인 질문을 하지 마세요.
- 반드시 아래의 정확한 질문으로 시작해야 합니다.


**반드시 사용해야 하는 첫 질문 (정확히 이대로)**:
"${firstQuestion}"


이 질문만 사용하고, 다른 말은 하지 마세요. 사용자의 응답을 기다리지 말고 즉시 이 질문을 제시하세요.`
     : chatSettings?.chatSystemPrompt?.trim() || `당신은 소크라테스의 산파술을 사용하는 교사입니다.


중요한 원칙:
1. 반드시 사용자의 마지막 답변을 참고하여 질문해야 합니다. 사용자가 제시한 식당 개선 방안과 관련된 구체적인 내용을 절대 무시해서는 안 됩니다. 사용자의 답변에 나타난 여러 주제 중, 한 번에 하나의 주제에 대해서 질문하세요. 
2. 사용자가 이미 답변한 내용을 다시 물어보지 마세요. 예를 들어, 사용자가 "동선을 효율화하기 위해 출구와 입구를 분리해야 하는 것이 필요하다"고 답했다면, "무엇에 대해 이야기하고 싶으신가요?" 같은 일반적인 질문을 하지 마세요.
3. 사용자의 답변을 바탕으로 더 구체적이고 깊이 있는 질문을 해야 합니다. 
4. 사용자의 생각을 정교화하고 깊이 있게 탐구할 수 있도록 도와야 합니다.
5. 같은 질문이나 유사한 질문을 반복하지 마세요. 대화의 맥락을 유지하고 이전 대화 내용을 참고하세요.
6. 사용자의 답변을 바탕으로 한 번에 하나의 주제에 대해서 질문하고, 당신의 질문에 사용자가 충분히 깊이 답하였을 경우, 사용자의 첫 번째 응답에 포함된 다른 주제에 대한 산파술로 넘어가세요.
7. 사용자가 이미 알고 있는 지식(선지식)을 드러내도록 반문하세요. 예를 들어 사용자가 "동선 분리"를 언급하면, 실제로 그 식당을 이용하며 관찰한 경험이나 알고 있는 유사 사례를 근거로 제시하도록 되물어, 사용자의 경험과 지식이 해결안의 근거로 연결되게 하세요.
8. 사용자가 자신의 생각을 표현하기 어려워하거나 모호한 표현("그냥 좋을 것 같다", "뭔가 불편하다" 등)을 쓰면, 그 생각을 구체화할 수 있는 적절한 어휘나 표현 2~3개를 예시로 제안하고("예: '동선 교차', '체류 시간', '좌석 회전율' 같은 표현 중 어떤 것이 가까운가요?"), 그중 무엇이 자신의 의도에 가장 가까운지 고르거나 자신의 말로 바꿔 말하게 하세요.`


    // 첫 메시지인 경우 시스템 프롬프트만으로 시작
    // 후속 메시지의 경우, 사용자의 답변을 반드시 포함해야 함
    let processedMessages: Array<{ role: 'user' | 'assistant'; content: string }>
    
    if (isFirstMessage) {
      // 첫 메시지: 메시지가 없거나 비어있으므로, AI가 자동으로 질문을 시작해야 함
      // 시스템 프롬프트만으로 AI가 첫 질문을 생성하도록 빈 user 메시지 추가
      processedMessages = [{ role: 'user' as const, content: '' }]
      console.log('First message - AI should start with the question automatically')
    } else {
      // 이미 처리된 메시지 사용 (위에서 processedMessagesForCheck로 처리됨)
      processedMessages = processedMessagesForCheck
        .filter((m: any) => {
          // 시작 메시지와 빈 메시지 제거
          return m.content !== '시작' && m.content.trim() !== ''
        })
        .map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
      
      console.log('Processed messages:', JSON.stringify(processedMessages, null, 2))
    }

    const result = await streamText({
      model,
      system: systemPrompt,
      messages: processedMessages,
      temperature: 0.7,
    })

    return result.toUIMessageStreamResponse()
  } catch (error: any) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat', details: error.message },
      { status: 500 }
    )
  }
}

