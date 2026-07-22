import { NextRequest, NextResponse } from 'next/server'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { prisma } from '@/lib/prisma'
import { DEFAULT_FIRST_QUESTION, DEFAULT_FOLLOWUP_PROMPT } from '@/lib/chatPrompts'

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// 기본 모델 (세션별 설정이 없을 때 사용)
const CHAT_MODEL = (process.env.OPENAI_CHAT_MODEL || 'gpt-4o') as any

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
    const modelId: string = chatSettings?.chatModel?.trim() || CHAT_MODEL
    const model = openai(modelId as any)
    const firstQuestion = chatSettings?.chatFirstQuestion?.trim() || DEFAULT_FIRST_QUESTION
    // gpt-5 계열은 temperature 지정을 지원하지 않으므로 생략 (기본값 1 사용)
    const temperatureOption = modelId.startsWith('gpt-5') ? {} : { temperature: 0.7 }

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
     : chatSettings?.chatSystemPrompt?.trim() || DEFAULT_FOLLOWUP_PROMPT


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
      ...temperatureOption,
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

