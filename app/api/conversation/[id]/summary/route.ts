import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Next.js 15+에서는 params가 Promise일 수 있음
    const resolvedParams = await Promise.resolve(params)
    let id = resolvedParams.id
    
    // id가 없으면 URL에서 직접 추출
    if (!id) {
      const url = new URL(request.url)
      const pathParts = url.pathname.split('/').filter(Boolean)
      const conversationIndex = pathParts.indexOf('conversation')
      if (conversationIndex !== -1 && conversationIndex + 1 < pathParts.length) {
        id = pathParts[conversationIndex + 1]
      }
    }
    
    if (!id) {
      console.error('No conversation ID found in params or URL')
      return NextResponse.json(
        { error: 'Conversation ID is required', details: 'ID가 제공되지 않았습니다' },
        { status: 400 }
      )
    }
    
    console.log('Processing summary request for conversation ID:', id)
    
    // request body에서 메시지를 받을 수 있도록 수정
    let requestBody: { messages?: Array<{ role: string; content: string }> } = {}
    try {
      requestBody = await request.json().catch(() => ({}))
    } catch (e) {
      // body가 없어도 계속 진행
    }
    
    const conversation = await prisma.conversation.findUnique({
      where: { id },
    })

    // request body에서 메시지를 받았으면 그것을 우선 사용, 없으면 DB에서 가져오기
    let messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    
    if (requestBody.messages && Array.isArray(requestBody.messages) && requestBody.messages.length > 0) {
      console.log('Using messages from request body:', requestBody.messages.length)
      messages = requestBody.messages as Array<{ role: 'user' | 'assistant'; content: string }>
    } else if (conversation) {
      console.log('Using messages from database')
      messages = conversation.messages as Array<{
        role: 'user' | 'assistant'
        content: string
      }>
    } else {
      return NextResponse.json({ error: 'Conversation not found and no messages provided' }, { status: 404 })
    }

    console.log('Raw messages from database:', JSON.stringify(messages, null, 2))
    console.log('Messages type:', typeof messages, 'Is array:', Array.isArray(messages))

    // 메시지 유효성 검사
    if (!messages) {
      console.error('Messages is null or undefined for conversation:', id)
      return NextResponse.json(
        { error: '대화 내용이 없습니다', details: '메시지 데이터가 없습니다' },
        { status: 400 }
      )
    }

    if (!Array.isArray(messages)) {
      console.error('Messages is not an array:', typeof messages, messages)
      return NextResponse.json(
        { error: '대화 내용 형식이 올바르지 않습니다', details: '메시지가 배열 형식이 아닙니다' },
        { status: 400 }
      )
    }

    if (messages.length === 0) {
      console.error('No messages found in conversation:', id)
      return NextResponse.json(
        { error: '대화 내용이 없습니다', details: '요약할 메시지가 없습니다' },
        { status: 400 }
      )
    }

    // 유효한 메시지 필터링 - 더 관대한 조건
    const validMessages = messages.filter((m) => {
      if (!m) return false
      if (!m.role) return false
      
      // content가 문자열이 아니거나 비어있어도 일단 포함 (나중에 처리)
      let content = ''
      if (typeof m.content === 'string') {
        content = m.content.trim()
      } else if (m.content) {
        // 객체나 다른 타입인 경우 문자열로 변환 시도
        content = String(m.content).trim()
      }
      
      // 빈 메시지나 '시작' 메시지는 제외
      return content !== '' && content !== '시작'
    })

    console.log(`Filtered ${validMessages.length} valid messages from ${messages.length} total messages`)
    console.log('Valid messages:', JSON.stringify(validMessages, null, 2))

    if (validMessages.length === 0) {
      console.error('No valid messages found after filtering. Original messages:', messages)
      return NextResponse.json(
        { error: '유효한 대화 내용이 없습니다', details: '요약할 유효한 메시지가 없습니다' },
        { status: 400 }
      )
    }

    // 사용자가 입력한 메시지만 추출 (사용자 요청사항)
    const userMessages = validMessages.filter((m) => m.role === 'user')
    
    if (userMessages.length === 0) {
      console.warn('No user messages found, using all messages for summary')
      // 사용자 메시지가 없으면 전체 대화 사용
    }

    // 사용자 메시지가 있으면 그것만, 없으면 전체 대화 사용
    const messagesToSummarize = userMessages.length > 0 ? userMessages : validMessages

    console.log(`Generating summary for conversation ${id} with ${messagesToSummarize.length} messages (${userMessages.length} user messages)`)

    // 대화 내용을 한 문단으로 요약
    const conversationText = messagesToSummarize
      .map((m) => {
        const content = typeof m.content === 'string' ? m.content : String(m.content || '')
        return `${m.role === 'user' ? '사용자' : 'AI'}: ${content}`
      })
      .join('\n')
    
    console.log('Conversation text for summary (first 500 chars):', conversationText.substring(0, 500))

    let completion
    try {
      completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              '당신은 대화 내용을 한 문단으로 요약하는 전문가입니다. 사용자가 제시한 과제 해결책과 그 이유를 두괄식으로 명확하게 요약해주세요.\n\n**매우 중요한 요구사항:**\n1. 요약은 반드시 "나는"으로 시작해야 합니다. "사용자는", "나는" 외의 다른 주어를 사용하지 마세요.\n2. 어조는 "~합니다" 대신 "~이다", "~하다"와 같은 문어체를 사용해야 합니다.\n3. 예시: "나는 기후위기를 해결하기 위해 수산업에서의 폐기물을 줄이는 것이 중요하다고 생각한다."',
          },
          {
            role: 'user',
            content: `다음 대화 내용을 한 문단으로 요약해주세요. 사용자가 제시한 과제 해결책과 그 이유를 중심으로 요약하세요. 반드시 "나는"으로 시작하고, "~이다", "~하다" 어조를 사용하세요:\n\n${conversationText}`,
          },
        ],
        temperature: 0.7,
      })
    } catch (openaiError: any) {
      console.error('OpenAI API error:', openaiError)
      throw new Error(`OpenAI API 호출 실패: ${openaiError.message || '알 수 없는 오류'}`)
    }

    if (!completion || !completion.choices || completion.choices.length === 0) {
      console.error('Invalid OpenAI response:', completion)
      throw new Error('OpenAI API 응답이 올바르지 않습니다')
    }

    const summary = completion.choices[0]?.message?.content || ''

    if (!summary || summary.trim() === '') {
      console.error('Empty summary generated')
      throw new Error('요약 생성에 실패했습니다. 요약 내용이 비어있습니다.')
    }

    console.log('Summary generated successfully:', summary.substring(0, 100))

    // 제목도 생성
    let titleCompletion
    try {
      titleCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '대화 내용을 한 줄로 요약한 제목을 생성해주세요.',
          },
          {
            role: 'user',
            content: `다음 요약 내용의 제목을 한 줄로 만들어주세요:\n\n${summary}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 50,
      })
    } catch (openaiError: any) {
      console.error('OpenAI API error for title:', openaiError)
      // 제목 생성 실패해도 요약은 계속 진행
    }

    const title = titleCompletion?.choices[0]?.message?.content || '대화 요약'

    // 대화 업데이트 (duration도 함께 업데이트)
    let updatedConversation
    try {
      // 현재 대화의 시작 시간을 기반으로 duration 계산
      const conversation = await prisma.conversation.findUnique({
        where: { id },
        select: { createdAt: true, duration: true },
      })
      
      // duration이 0이면 createdAt을 기준으로 계산
      let calculatedDuration = conversation?.duration || 0
      if (calculatedDuration === 0 && conversation?.createdAt) {
        calculatedDuration = Math.floor((Date.now() - conversation.createdAt.getTime()) / 1000)
      }
      
      updatedConversation = await prisma.conversation.update({
        where: { id },
        data: {
          summary: summary.trim(),
          title: title.trim(),
          duration: calculatedDuration > 0 ? calculatedDuration : undefined, // duration이 0보다 크면 업데이트
        },
      })
      
      console.log('Updated conversation with duration:', calculatedDuration)
    } catch (dbError: any) {
      console.error('Database update error:', dbError)
      throw new Error(`데이터베이스 업데이트 실패: ${dbError.message || '알 수 없는 오류'}`)
    }

    if (!updatedConversation || !updatedConversation.summary) {
      console.error('Updated conversation is invalid:', updatedConversation)
      throw new Error('대화 업데이트에 실패했습니다.')
    }

    console.log('Summary and title saved successfully')
    return NextResponse.json({ conversation: updatedConversation })
  } catch (error: any) {
    console.error('Summary generation error:', error)
    console.error('Error stack:', error.stack)
    return NextResponse.json(
      { 
        error: 'Failed to generate summary', 
        details: error.message || '알 수 없는 오류가 발생했습니다',
        type: error.name || 'UnknownError'
      },
      { status: 500 }
    )
  }
}

