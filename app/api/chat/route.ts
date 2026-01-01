import { NextRequest, NextResponse } from 'next/server'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// 사용할 모델을 환경 변수로 설정 (기본값: gpt-4o)
const CHAT_MODEL = (process.env.OPENAI_CHAT_MODEL || 'gpt-4o') as any

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('API received body:', JSON.stringify(body, null, 2))
    const { messages, data } = body

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 })
    }

    // 첫 메시지인지 확인: 메시지가 없거나, 비어있거나, "시작" 메시지만 있는 경우
    const hasValidUserMessage = messages.some((m: any) => {
      if (m.role !== 'user') return false
      if (m.parts && Array.isArray(m.parts)) {
        const textParts = m.parts.filter((p: any) => p.type === 'text')
        const content = textParts.map((p: any) => p.text || '').join('')
        return content && content.trim() !== '' && content !== '시작'
      }
      const content = m.content || ''
      return content && content.trim() !== '' && content !== '시작'
    })
    
    const isFirstMessage = !hasValidUserMessage || 
      data?.isFirstMessage || 
      messages.length === 0 ||
      (messages.length === 1 && messages[0]?.role === 'user' && (
        messages[0]?.content === '시작' || 
        messages[0]?.content === '' ||
        (messages[0]?.parts && messages[0].parts.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('').trim() === '')
      ))
    
    console.log('isFirstMessage:', isFirstMessage, 'messages:', messages, 'hasValidUserMessage:', hasValidUserMessage)

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
"이 과제를 어떻게 해결하는 것이 좋을까요? 잠정적인 해결책을 제안하고, 그 이유를 설명하세요."

이 질문만 사용하고, 다른 말은 하지 마세요. 사용자의 응답을 기다리지 말고 즉시 이 질문을 제시하세요.`
      : `당신은 소크라테스의 산파술을 사용하는 교사입니다.

중요한 원칙:
1. 반드시 사용자의 마지막 답변을 참고하여 질문해야 합니다. 사용자가 제시한 구체적인 내용(예: "기후위기", "수산업 폐기물", "폐어구" 등)을 무시하고 일반적인 질문을 반복하지 마세요.
2. 사용자가 이미 답변한 내용을 다시 물어보지 마세요. 예를 들어, 사용자가 "기후위기를 해결하기 위해서는 수산업에서의 폐기물을 줄이는 게 중요하다"고 답했다면, "무엇에 대해 이야기하고 싶으신가요?" 같은 일반적인 질문을 하지 마세요.
3. 사용자의 답변을 바탕으로 더 구체적이고 깊이 있는 질문을 해야 합니다. 예를 들어:
   - "왜 수산업의 폐기물이 기후위기에 영향을 미친다고 생각하시나요?"
   - "폐어구를 줄이기 위한 구체적인 방법으로는 어떤 것들이 있을까요?"
   - "이 방법들이 실제로 효과적일 수 있다고 생각하시는 이유는 무엇인가요?"
4. 사용자의 생각을 정교화하고 깊이 있게 탐구할 수 있도록 도와야 합니다.
5. 같은 질문이나 유사한 질문을 반복하지 마세요. 대화의 맥락을 유지하고 이전 대화 내용을 참고하세요.`

    // 첫 메시지인 경우 시스템 프롬프트만으로 시작
    // 후속 메시지의 경우, 사용자의 답변을 반드시 포함해야 함
    let processedMessages: Array<{ role: 'user' | 'assistant'; content: string }>
    
    if (isFirstMessage) {
      // 첫 메시지: 메시지가 없거나 비어있으므로, AI가 자동으로 질문을 시작해야 함
      // 시스템 프롬프트만으로 AI가 첫 질문을 생성하도록 빈 user 메시지 추가
      processedMessages = [{ role: 'user' as const, content: '' }]
      console.log('First message - AI should start with the question automatically')
    } else {
      // 메시지를 처리하여 content 추출
      processedMessages = messages
        .map((m: any) => {
          // parts 배열에서 텍스트 추출 (UIMessage 형식)
          if (m.parts && Array.isArray(m.parts)) {
            const textParts = m.parts.filter((p: any) => p.type === 'text')
            const content = textParts.map((p: any) => p.text || '').join('')
            return {
              role: m.role as 'user' | 'assistant',
              content: content || '',
            }
          }
          // content 필드가 직접 있는 경우
          return {
            role: m.role as 'user' | 'assistant',
            content: m.content || '',
          }
        })
        .filter((m: any) => {
          // 시작 메시지와 빈 메시지 제거
          return m.content !== '시작' && m.content.trim() !== ''
        })
      
      console.log('Processed messages:', JSON.stringify(processedMessages, null, 2))
    }

    const result = await streamText({
      model: openai(CHAT_MODEL),
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

