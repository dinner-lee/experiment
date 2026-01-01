import { NextRequest, NextResponse } from 'next/server'
import { pipeline } from '@xenova/transformers'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// 한국어 문장 분리 함수
function splitIntoSentences(text: string): string[] {
  if (!text || text.trim() === '') return []
  
  // 한국어 문장 종결 부호로 분리 (. ! ?)
  // 정규식: 문장 종결 부호 뒤에 공백이나 줄바꿈이 오는 경우, 또는 텍스트 끝
  const sentenceEndings = /([.!?])(\s+|$)/g
  const sentences: string[] = []
  let lastIndex = 0
  let match
  
  while ((match = sentenceEndings.exec(text)) !== null) {
    const sentence = text.substring(lastIndex, match.index + 1).trim()
    if (sentence.length > 0) {
      sentences.push(sentence)
    }
    lastIndex = match.index + match[0].length
  }
  
  // 마지막 문장 처리 (종결 부호가 없는 경우)
  if (lastIndex < text.length) {
    const lastSentence = text.substring(lastIndex).trim()
    if (lastSentence.length > 0) {
      sentences.push(lastSentence)
    }
  }
  
  // 문장이 하나도 없으면 전체 텍스트를 하나의 문장으로 처리
  if (sentences.length === 0 && text.trim().length > 0) {
    sentences.push(text.trim())
  }
  
  return sentences.filter(s => s.trim().length > 0)
}

// 코사인 유사도 계산
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length')
  }
  
  let dotProduct = 0
  let normA = 0
  let normB = 0
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0
  
  return dotProduct / denominator
}

// MeanMax 집계: 각 행의 최대값을 구한 후 평균
function meanMax(similarityMatrix: number[][]): number {
  const maxValues = similarityMatrix.map(row => Math.max(...row))
  return maxValues.reduce((sum, val) => sum + val, 0) / maxValues.length
}

// 양방향 MeanMax 평균 계산
function bidirectionalMeanMax(
  matrixAtoB: number[][],
  matrixBtoA: number[][]
): number {
  const meanMaxAtoB = meanMax(matrixAtoB)
  const meanMaxBtoA = meanMax(matrixBtoA)
  return (meanMaxAtoB + meanMaxBtoA) / 2
}

export async function POST(request: NextRequest) {
  try {
    const { summaries } = await request.json()
    
    if (!summaries || !Array.isArray(summaries) || summaries.length < 2) {
      return NextResponse.json(
        { error: '최소 2개 이상의 요약이 필요합니다.' },
        { status: 400 }
      )
    }
    
    // 빈 요약 필터링
    const validSummaries = summaries.filter((s: string) => s && s.trim().length > 0)
    
    if (validSummaries.length < 2) {
      return NextResponse.json(
        { error: '유효한 요약이 최소 2개 이상 필요합니다.' },
        { status: 400 }
      )
    }
    
    console.log('Loading sentence transformer model...')
    
    // Sentence-Transformers 모델 로드 (한국어 지원 모델)
    // 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'는 한국어를 포함한 다국어 모델
    const extractor = await pipeline(
      'feature-extraction',
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
    )
    
    console.log('Model loaded. Processing summaries...')
    
    // 각 요약을 문장 단위로 분리
    const sentencesBySummary = validSummaries.map((summary: string) => {
      const sentences = splitIntoSentences(summary)
      console.log('Summary:', summary.substring(0, 100), '...')
      console.log('Split into sentences:', sentences)
      return sentences
    })
    
    console.log('Sentences split:', sentencesBySummary.map(s => s.length))
    console.log('Total sentences:', sentencesBySummary.reduce((sum, s) => sum + s.length, 0))
    
    // 모든 문장의 임베딩 생성
    const allSentences: string[] = []
    const sentenceToSummaryIndex: number[] = []
    
    sentencesBySummary.forEach((sentences: string[], summaryIndex: number) => {
      sentences.forEach((sentence: string) => {
        allSentences.push(sentence)
        sentenceToSummaryIndex.push(summaryIndex)
      })
    })
    
    console.log('Generating embeddings for', allSentences.length, 'sentences...')
    console.log('Sample sentences:', allSentences.slice(0, 3))
    
    if (allSentences.length === 0) {
      return NextResponse.json(
        { error: '분석할 문장이 없습니다. 요약에 유효한 문장이 포함되어 있는지 확인해주세요.' },
        { status: 400 }
      )
    }
    
    // 배치로 임베딩 생성 (메모리 효율성을 위해)
    const embeddings: number[][] = []
    const batchSize = 32
    
    // 텐서를 배열로 변환하는 헬퍼 함수
    const tensorToArray = (tensor: any): number[] => {
      if (Array.isArray(tensor) && tensor.length > 0) {
        // 이미 배열인 경우
        if (typeof tensor[0] === 'number') {
          return tensor as number[]
        }
        // 중첩 배열인 경우 평탄화
        return tensor.flat() as number[]
      }
      // 텐서 객체인 경우 data 속성 확인
      if (tensor && tensor.data) {
        return Array.from(tensor.data)
      }
      // toArray 메서드가 있는 경우
      if (tensor && typeof tensor.toArray === 'function') {
        return tensor.toArray()
      }
      return []
    }
    
    for (let i = 0; i < allSentences.length; i += batchSize) {
      const batch = allSentences.slice(i, i + batchSize)
      console.log(`Processing batch ${Math.floor(i / batchSize) + 1}, sentences:`, batch.length)
      
      try {
        const batchEmbeddings = await extractor(batch, { pooling: 'mean', normalize: true })
        
        // 임베딩 형식 확인 및 변환
        console.log('Batch embeddings type:', typeof batchEmbeddings, Array.isArray(batchEmbeddings))
        
        // @xenova/transformers는 텐서 객체를 반환합니다
        // 텐서의 data 속성이나 toArray 메서드를 사용해야 합니다
        let processedEmbeddings: number[][] = []
        
        if (Array.isArray(batchEmbeddings)) {
          // 배열인 경우 - 각 요소가 텐서일 수 있음
          for (const emb of batchEmbeddings) {
            const embArray = tensorToArray(emb)
            if (embArray.length > 0) {
              processedEmbeddings.push(embArray)
            } else {
              console.warn('Empty embedding array found for sentence:', batch[processedEmbeddings.length])
            }
          }
        } else {
          // 단일 텐서인 경우 - 텐서 객체의 data 속성 확인
          if (batchEmbeddings && typeof batchEmbeddings === 'object') {
            // 텐서 객체인 경우
            if ('data' in batchEmbeddings && Array.isArray(batchEmbeddings.data)) {
              // 2D 배열인 경우 (batch_size x embedding_dim)
              if (Array.isArray(batchEmbeddings.data[0])) {
                processedEmbeddings = batchEmbeddings.data as number[][]
              } else {
                // 1D 배열인 경우 (단일 문장)
                processedEmbeddings = [batchEmbeddings.data as number[]]
              }
            } else if ('tolist' in batchEmbeddings && typeof batchEmbeddings.tolist === 'function') {
              // tolist 메서드가 있는 경우
              const list = batchEmbeddings.tolist()
              if (Array.isArray(list[0])) {
                processedEmbeddings = list as number[][]
              } else {
                processedEmbeddings = [list as number[]]
              }
            } else {
              // 다른 형식 시도
              const embArray = tensorToArray(batchEmbeddings)
              if (embArray.length > 0) {
                processedEmbeddings = [embArray]
              }
            }
          } else {
            const embArray = tensorToArray(batchEmbeddings)
            if (embArray.length > 0) {
              processedEmbeddings = [embArray]
            }
          }
        }
        
        if (processedEmbeddings.length !== batch.length) {
          console.error(`Embedding count mismatch: expected ${batch.length}, got ${processedEmbeddings.length}`)
        }
        
        embeddings.push(...processedEmbeddings)
        
        console.log(`Batch ${Math.floor(i / batchSize) + 1} processed, embeddings so far:`, embeddings.length)
      } catch (error) {
        console.error('Error processing batch:', error)
        throw error
      }
    }
    
    console.log('Embeddings generated. Total embeddings:', embeddings.length)
    console.log('First embedding sample:', embeddings[0]?.slice(0, 5))
    console.log('Calculating similarity matrix...')
    
    // 각 요약 쌍에 대한 유사도 계산
    const results: Array<{
      summaryIndex1: number
      summaryIndex2: number
      similarity: number
      sentenceCount1: number
      sentenceCount2: number
      sentences1: string[]
      sentences2: string[]
      similarityMatrix: number[][]
      similarityMatrixJtoI?: number[][]
      meanMaxItoJ?: number
      meanMaxJtoI?: number
      maxValuesItoJ?: number[]
      maxValuesJtoI?: number[]
    }> = []
    
    for (let i = 0; i < validSummaries.length; i++) {
      for (let j = i + 1; j < validSummaries.length; j++) {
        // i번째 요약의 문장 인덱스
        const sentencesI = sentencesBySummary[i]
        const sentencesJ = sentencesBySummary[j]
        
        console.log(`Processing pair ${i}-${j}:`, {
          summaryI: validSummaries[i].substring(0, 50),
          summaryJ: validSummaries[j].substring(0, 50),
          sentencesICount: sentencesI.length,
          sentencesJCount: sentencesJ.length,
        })
        
        // 각 요약의 문장 임베딩 추출
        const embeddingsI: number[][] = []
        const embeddingsJ: number[][] = []
        
        allSentences.forEach((_, idx) => {
          if (sentenceToSummaryIndex[idx] === i) {
            if (embeddings[idx] && Array.isArray(embeddings[idx])) {
              embeddingsI.push(embeddings[idx])
            }
          } else if (sentenceToSummaryIndex[idx] === j) {
            if (embeddings[idx] && Array.isArray(embeddings[idx])) {
              embeddingsJ.push(embeddings[idx])
            }
          }
        })
        
        console.log(`Embeddings extracted: I=${embeddingsI.length}, J=${embeddingsJ.length}`)
        
        if (embeddingsI.length === 0 || embeddingsJ.length === 0) {
          console.warn(`Skipping pair ${i}-${j}: empty embeddings`, {
            embeddingsILength: embeddingsI.length,
            embeddingsJLength: embeddingsJ.length,
            sentencesICount: sentencesI.length,
            sentencesJCount: sentencesJ.length,
            allSentencesLength: allSentences.length,
            embeddingsLength: embeddings.length,
          })
          // 빈 임베딩이어도 결과에 추가 (유사도 0으로)
          results.push({
            summaryIndex1: i,
            summaryIndex2: j,
            similarity: 0,
            sentenceCount1: sentencesI.length,
            sentenceCount2: sentencesJ.length,
            sentences1: sentencesI,
            sentences2: sentencesJ,
            similarityMatrix: [], // 빈 행렬
          })
          continue
        }
        
        // 유사도 행렬 계산 (I -> J)
        const matrixItoJ: number[][] = []
        for (const embI of embeddingsI) {
          const row: number[] = []
          for (const embJ of embeddingsJ) {
            try {
              row.push(cosineSimilarity(embI, embJ))
            } catch (error) {
              console.error('Cosine similarity error:', error, 'embI length:', embI.length, 'embJ length:', embJ.length)
              row.push(0)
            }
          }
          matrixItoJ.push(row)
        }
        
        // 유사도 행렬 계산 (J -> I)
        const matrixJtoI: number[][] = []
        for (const embJ of embeddingsJ) {
          const row: number[] = []
          for (const embI of embeddingsI) {
            try {
              row.push(cosineSimilarity(embJ, embI))
            } catch (error) {
              console.error('Cosine similarity error:', error)
              row.push(0)
            }
          }
          matrixJtoI.push(row)
        }
        
        console.log(`Similarity matrices: I->J: ${matrixItoJ.length}x${matrixItoJ[0]?.length || 0}, J->I: ${matrixJtoI.length}x${matrixJtoI[0]?.length || 0}`)
        
        // 양방향 MeanMax 평균 계산
        const meanMaxItoJ = meanMax(matrixItoJ)
        const meanMaxJtoI = meanMax(matrixJtoI)
        const similarity = bidirectionalMeanMax(matrixItoJ, matrixJtoI)
        
        // 각 행의 최대값 계산 (A→B MeanMax 설명용)
        const maxValuesItoJ = matrixItoJ.map(row => Math.max(...row))
        // 각 행의 최대값 계산 (B→A MeanMax 설명용)
        const maxValuesJtoI = matrixJtoI.map(row => Math.max(...row))
        
        console.log(`Final similarity for pair ${i}-${j}:`, similarity)
        console.log(`MeanMax I->J: ${meanMaxItoJ}, MeanMax J->I: ${meanMaxJtoI}`)
        
        // 유사도 행렬은 I->J 방향 사용 (더 직관적)
        results.push({
          summaryIndex1: i,
          summaryIndex2: j,
          similarity: Math.round(similarity * 10000) / 10000, // 소수점 4자리
          sentenceCount1: sentencesI.length,
          sentenceCount2: sentencesJ.length,
          sentences1: sentencesI,
          sentences2: sentencesJ,
          similarityMatrix: matrixItoJ, // 행: I의 문장들, 열: J의 문장들
          similarityMatrixJtoI: matrixJtoI, // 행: J의 문장들, 열: I의 문장들 (B→A 방향)
          meanMaxItoJ: Math.round(meanMaxItoJ * 10000) / 10000, // A→B MeanMax
          meanMaxJtoI: Math.round(meanMaxJtoI * 10000) / 10000, // B→A MeanMax
          maxValuesItoJ: maxValuesItoJ.map(v => Math.round(v * 10000) / 10000), // A의 각 문장에서 B의 최대 유사도
          maxValuesJtoI: maxValuesJtoI.map(v => Math.round(v * 10000) / 10000), // B의 각 문장에서 A의 최대 유사도
        })
      }
    }
    
    console.log('Similarity analysis completed.')
    console.log('Results:', results)
    console.log('Results count:', results.length)
    
    // 개념 그래프 생성
    console.log('Extracting concepts from summaries...')
    const conceptsBySummary: string[][] = []
    
    for (const summary of validSummaries) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: '당신은 텍스트에서 핵심 개념을 추출하는 전문가입니다. 주어진 문단에서 중요한 개념(명사구, 핵심 키워드)을 추출하여 JSON 객체로 반환하세요. 응답 형식: {"concepts": ["개념1", "개념2", ...]}. 각 개념은 2-5단어로 구성된 명사구여야 합니다.',
            },
            {
              role: 'user',
              content: `다음 문단에서 핵심 개념을 추출하여 JSON 형식으로 반환하세요. 각 개념은 2-5단어의 명사구로 표현하세요. 응답은 반드시 {"concepts": [...]} 형식이어야 합니다:\n\n${summary}`,
            },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        })
        
        const responseText = completion.choices[0]?.message?.content || '{}'
        let parsed: any = {}
        try {
          parsed = JSON.parse(responseText)
        } catch (parseError) {
          console.error('Failed to parse JSON response:', responseText)
          conceptsBySummary.push([])
          continue
        }
        
        const concepts = parsed.concepts || parsed.concept || []
        
        if (Array.isArray(concepts)) {
          const filteredConcepts = concepts
            .filter((c: any) => c && typeof c === 'string' && c.trim().length > 0)
            .map((c: string) => c.trim())
          conceptsBySummary.push(filteredConcepts)
          console.log(`Extracted ${filteredConcepts.length} concepts from summary ${conceptsBySummary.length}:`, filteredConcepts.slice(0, 5))
        } else {
          conceptsBySummary.push([])
          console.log(`No concepts extracted from summary ${conceptsBySummary.length}`)
        }
      } catch (error: any) {
        console.error('Failed to extract concepts:', error.message || error)
        conceptsBySummary.push([])
      }
    }
    
    // 모든 개념 수집
    const allConcepts: string[] = []
    const conceptToSummaryIndex: number[] = []
    
    conceptsBySummary.forEach((concepts, summaryIndex) => {
      concepts.forEach((concept) => {
        if (!allConcepts.includes(concept)) {
          allConcepts.push(concept)
        }
        conceptToSummaryIndex.push(summaryIndex)
      })
    })
    
    console.log('Total unique concepts:', allConcepts.length)
    console.log('All concepts:', allConcepts)
    console.log('Concepts by summary:', conceptsBySummary)
    
    // 개념 임베딩 생성 (문장 임베딩과 동일한 방식으로 처리)
    let conceptEmbeddings: number[][] = []
    if (allConcepts.length > 0) {
      console.log('Generating embeddings for concepts...')
      const batchSize = 32
      
      for (let i = 0; i < allConcepts.length; i += batchSize) {
        const batch = allConcepts.slice(i, i + batchSize)
        console.log(`Processing concept batch ${Math.floor(i / batchSize) + 1}, concepts:`, batch.length)
        
        try {
          const batchEmbeddings = await extractor(batch, { pooling: 'mean', normalize: true })
          
          console.log('Concept batch embeddings type:', typeof batchEmbeddings, Array.isArray(batchEmbeddings))
          
          let processedEmbeddings: number[][] = []
          
          if (Array.isArray(batchEmbeddings)) {
            // 배열인 경우 - 각 요소가 텐서일 수 있음
            for (const emb of batchEmbeddings) {
              const embArray = tensorToArray(emb)
              if (embArray.length > 0) {
                processedEmbeddings.push(embArray)
              } else {
                console.warn('Empty embedding array found for concept:', batch[processedEmbeddings.length])
              }
            }
          } else {
            // 단일 텐서인 경우 - 텐서 객체의 data 속성 확인
            if (batchEmbeddings && typeof batchEmbeddings === 'object') {
              // 텐서 객체인 경우
              if ('data' in batchEmbeddings && Array.isArray(batchEmbeddings.data)) {
                // 2D 배열인 경우 (batch_size x embedding_dim)
                if (Array.isArray(batchEmbeddings.data[0])) {
                  processedEmbeddings = batchEmbeddings.data as number[][]
                } else {
                  // 1D 배열인 경우 (단일 개념)
                  processedEmbeddings = [batchEmbeddings.data as number[]]
                }
              } else if ('tolist' in batchEmbeddings && typeof batchEmbeddings.tolist === 'function') {
                // tolist 메서드가 있는 경우
                const list = batchEmbeddings.tolist()
                if (Array.isArray(list[0])) {
                  processedEmbeddings = list as number[][]
                } else {
                  processedEmbeddings = [list as number[]]
                }
              } else {
                // 다른 형식 시도
                const embArray = tensorToArray(batchEmbeddings)
                if (embArray.length > 0) {
                  processedEmbeddings = [embArray]
                }
              }
            } else {
              const embArray = tensorToArray(batchEmbeddings)
              if (embArray.length > 0) {
                processedEmbeddings = [embArray]
              }
            }
          }
          
          if (processedEmbeddings.length !== batch.length) {
            console.error(`Concept embedding count mismatch: expected ${batch.length}, got ${processedEmbeddings.length}`)
            // 부족한 임베딩을 빈 배열로 채우기
            while (processedEmbeddings.length < batch.length) {
              processedEmbeddings.push([])
            }
          }
          
          conceptEmbeddings.push(...processedEmbeddings)
          console.log(`Concept batch ${Math.floor(i / batchSize) + 1} processed, embeddings so far:`, conceptEmbeddings.length)
        } catch (error) {
          console.error('Error processing concept embeddings batch:', error)
          // 에러 발생 시 빈 임베딩으로 채우기
          for (let j = 0; j < batch.length; j++) {
            conceptEmbeddings.push([])
          }
        }
      }
      
      console.log('Total concept embeddings generated:', conceptEmbeddings.length)
      console.log('Expected concepts:', allConcepts.length)
      console.log('Sample embedding length:', conceptEmbeddings[0]?.length)
      console.log('All embeddings status:', conceptEmbeddings.map((e, i) => ({
        concept: allConcepts[i],
        hasEmbedding: !!e && e.length > 0,
        length: e?.length || 0,
      })).slice(0, 5))
    } else {
      console.warn('No concepts to generate embeddings for!')
    }
    
    // 임베딩이 없는 개념이 있는지 확인
    const missingEmbeddings = allConcepts.map((c, i) => ({
      concept: c,
      index: i,
      hasEmbedding: !!conceptEmbeddings[i] && conceptEmbeddings[i].length > 0,
    })).filter(x => !x.hasEmbedding)
    
    if (missingEmbeddings.length > 0) {
      console.warn('Concepts missing embeddings:', missingEmbeddings.length, missingEmbeddings)
    }
    
    // 개념 간 유사도 계산 및 그래프 생성
    const conceptGraph: {
      nodes: Array<{ id: string; label: string; summaryIndices: number[] }>
      edges: Array<{ 
        source: string
        target: string
        similarity: number
        weight: number
        summaryIndices?: number[]
        combinedScore?: number // 하이브리드 점수 (의미 유사도 + 공기)
        cooccurrenceCount?: number // 같은 문장에 등장한 횟수
      }>
    } = {
      nodes: [],
      edges: [],
    }
    
    // 노드 생성 (각 개념)
    allConcepts.forEach((concept, idx) => {
      const summaryIndices = conceptsBySummary
        .map((concepts, sIdx) => (concepts.includes(concept) ? sIdx : -1))
        .filter(idx => idx !== -1)
      
      conceptGraph.nodes.push({
        id: `concept_${idx}`,
        label: concept,
        summaryIndices,
      })
    })
    
    // 1단계: 하이브리드 방식으로 엣지 생성 (의미 유사도 + 공기 + LLM 검증)
    // 각 노드마다 가장 가까운 k개 노드와 연결
    const k = 3 // 각 노드마다 상위 k개 노드와 연결 (k=1~3부터 시작)
    const cooccurrenceBonus = 0.3 // 같은 문장에 등장하면 추가되는 보너스 점수
    let edgeCount = 0
    let skippedCount = 0
    let noEmbeddingCount = 0
    
    console.log('Starting edge creation with Hybrid method (Top-k + Co-occurrence, k=' + k + ')...')
    console.log('Total concepts:', allConcepts.length)
    console.log('Total concept embeddings:', conceptEmbeddings.length)
    
    // 각 개념이 어떤 문장에 등장하는지 매핑 (공기 점수 계산용)
    // concept -> [sentence indices where concept appears]
    const conceptToSentences: Record<number, number[]> = {}
    
    // 각 요약의 문장들을 순회하며 개념이 포함된 문장 인덱스 기록
    sentencesBySummary.forEach((sentences, summaryIdx) => {
      sentences.forEach((sentence, sentenceIdx) => {
        const globalSentenceIdx = summaryIdx * 1000 + sentenceIdx // 요약 인덱스와 문장 인덱스를 조합
        
        allConcepts.forEach((concept, conceptIdx) => {
          // 문장에 개념이 포함되어 있는지 확인 (대소문자 무시)
          if (sentence.toLowerCase().includes(concept.toLowerCase())) {
            if (!conceptToSentences[conceptIdx]) {
              conceptToSentences[conceptIdx] = []
            }
            conceptToSentences[conceptIdx].push(globalSentenceIdx)
          }
        })
      })
    })
    
    console.log('Co-occurrence mapping created:', Object.keys(conceptToSentences).length, 'concepts mapped to sentences')
    
    // 임베딩 기반 엣지 생성
    const initialEdges: Array<{
      source: string
      target: string
      conceptI: string
      conceptJ: string
      similarity: number
      weight: number
      combinedScore: number // 의미 유사도 + 공기 점수
      cooccurrenceCount: number // 같은 문장에 등장한 횟수
      summaryIndices: number[] // 각 개념이 속한 모든 요약 인덱스
      sameSummaryIndices?: number[] // 두 개념이 공통으로 속한 요약 인덱스 (참고용)
      needsRefinement?: boolean // LLM 정제가 필요한지 여부
    }> = []
    
    // 각 노드에 대해 유사도 계산 및 Top-k 선택
    for (let i = 0; i < allConcepts.length; i++) {
      if (!conceptEmbeddings[i] || conceptEmbeddings[i].length === 0) {
        noEmbeddingCount++
        continue
      }
      
      const conceptI = allConcepts[i]
      
      // 각 개념이 속한 요약 인덱스 찾기
      const conceptISummaryIndices: number[] = []
      conceptsBySummary.forEach((concepts, sIdx) => {
        if (concepts.includes(conceptI)) {
          conceptISummaryIndices.push(sIdx)
        }
      })
      
      // 모든 다른 노드와의 하이브리드 점수 계산 (의미 유사도 + 공기)
      const similarities: Array<{
        j: number
        conceptJ: string
        similarity: number // 의미 유사도 (임베딩 기반)
        cooccurrenceCount: number // 같은 문장에 등장한 횟수
        combinedScore: number // 의미 유사도 + 공기 점수
        conceptJSummaryIndices: number[]
        sameSummaryIndices: number[]
      }> = []
      
      for (let j = 0; j < allConcepts.length; j++) {
        if (i === j) continue // 자기 자신은 제외
        
        if (!conceptEmbeddings[j] || conceptEmbeddings[j].length === 0) {
          continue
        }
        
        try {
          // 1. 의미 유사도 계산 (임베딩 기반)
          const similarity = cosineSimilarity(conceptEmbeddings[i], conceptEmbeddings[j])
          
          if (isNaN(similarity) || !isFinite(similarity) || similarity <= 0) {
            continue
          }
          
          const conceptJ = allConcepts[j]
          
          // 2. 공기(co-occurrence) 점수 계산
          // 두 개념이 같은 문장에 등장하는지 확인
          const sentencesI = conceptToSentences[i] || []
          const sentencesJ = conceptToSentences[j] || []
          const cooccurrenceCount = sentencesI.filter(sIdx => sentencesJ.includes(sIdx)).length
          
          // 공기 점수: 같은 문장에 등장한 횟수에 비례 (최대 cooccurrenceBonus)
          const cooccurrenceScore = Math.min(cooccurrenceBonus, cooccurrenceCount * 0.1)
          
          // 3. 하이브리드 점수 = 의미 유사도 + 공기 점수
          const combinedScore = similarity + cooccurrenceScore
          
          // 각 개념이 속한 요약 인덱스 찾기
          const conceptJSummaryIndices: number[] = []
          conceptsBySummary.forEach((concepts, sIdx) => {
            if (concepts.includes(conceptJ)) {
              conceptJSummaryIndices.push(sIdx)
            }
          })
          
          // 두 개념이 공통으로 속한 요약 인덱스
          const sameSummaryIndices = conceptISummaryIndices.filter(idx => conceptJSummaryIndices.includes(idx))
          
          similarities.push({
            j,
            conceptJ,
            similarity,
            cooccurrenceCount,
            combinedScore,
            conceptJSummaryIndices,
            sameSummaryIndices,
          })
        } catch (error) {
          console.error(`Error calculating similarity for ${conceptI} - ${allConcepts[j]}:`, error)
          skippedCount++
        }
      }
      
      if (i === 0) {
        console.log(`Node 0 (${conceptI}): Found ${similarities.length} potential edges`)
        if (similarities.length > 0) {
          console.log(`Sample similarities:`, similarities.slice(0, 3).map(s => ({
            concept: s.conceptJ,
            similarity: s.similarity.toFixed(4),
            cooccurrence: s.cooccurrenceCount,
            combinedScore: s.combinedScore.toFixed(4),
          })))
        }
      }
      
      // 하이브리드 점수가 높은 순으로 정렬
      // 같은 요약에 속한 개념들은 추가 보너스 (같은 요약에 속한 경우 보너스 추가)
      similarities.sort((a, b) => {
        const aBonus = a.sameSummaryIndices.length > 0 ? 0.2 : 0 // 같은 요약에 속한 경우 보너스
        const bBonus = b.sameSummaryIndices.length > 0 ? 0.2 : 0
        return (b.combinedScore + bBonus) - (a.combinedScore + aBonus)
      })
      
      // Top-k 선택 (같은 요약에 속한 개념들은 항상 포함)
      const sameSummaryNodes = similarities.filter(s => s.sameSummaryIndices.length > 0)
      const otherNodes = similarities.filter(s => s.sameSummaryIndices.length === 0)
      
      // 같은 요약에 속한 개념들은 모두 포함
      const selectedNodes = [...sameSummaryNodes]
      
      // 나머지 노드 중에서 Top-k 선택
      const remainingSlots = Math.max(0, k - selectedNodes.length)
      selectedNodes.push(...otherNodes.slice(0, remainingSlots))
      
      if (i === 0) {
        console.log(`Node 0: Selected ${selectedNodes.length} edges (${sameSummaryNodes.length} same summary, ${selectedNodes.length - sameSummaryNodes.length} top-k)`)
      }
      
      // 엣지 생성
      for (const selected of selectedNodes) {
        const edgeSummaryIndices = Array.from(new Set([...conceptISummaryIndices, ...selected.conceptJSummaryIndices]))
        // LLM 정제 필요 여부: 같은 요약에 속하지 않고, 유사도가 중간 범위인 경우
        const needsRefinement = selected.sameSummaryIndices.length === 0 && selected.similarity >= 0.2 && selected.similarity < 0.5
        
        // 엣지 가중치: 하이브리드 점수를 사용하되, 최소값 보장
        const edgeWeight = Math.max(0.1, selected.combinedScore)
        
        initialEdges.push({
          source: `concept_${i}`,
          target: `concept_${selected.j}`,
          conceptI,
          conceptJ: selected.conceptJ,
          similarity: Math.round(selected.similarity * 10000) / 10000,
          weight: edgeWeight,
          combinedScore: Math.round(selected.combinedScore * 10000) / 10000,
          cooccurrenceCount: selected.cooccurrenceCount,
          summaryIndices: edgeSummaryIndices,
          sameSummaryIndices: selected.sameSummaryIndices,
          needsRefinement,
        })
        edgeCount++
      }
      
      if (i < 3) {
        const cooccurrenceEdges = selectedNodes.filter(n => n.cooccurrenceCount > 0).length
        console.log(`Node ${i} (${conceptI}): Selected ${selectedNodes.length} edges (${sameSummaryNodes.length} same summary, ${cooccurrenceEdges} co-occurrence, ${selectedNodes.length - sameSummaryNodes.length} top-k)`)
      }
    }
    
    const cooccurrenceEdges = initialEdges.filter(e => e.cooccurrenceCount > 0).length
    console.log('Initial edges created (Hybrid method - Top-k + Co-occurrence):', {
      totalEdges: initialEdges.length,
      edgesWithCooccurrence: cooccurrenceEdges,
      edgesNeedingRefinement: initialEdges.filter(e => e.needsRefinement).length,
      edgeCount,
      skippedCount,
      noEmbeddingCount,
      averageEdgesPerNode: (initialEdges.length / allConcepts.length).toFixed(2),
      totalConceptPairs: (allConcepts.length * (allConcepts.length - 1)) / 2,
    })
    
    // 2단계: 필요할 때만 LLM으로 관계 정제
    // 같은 요약에 속한 개념들은 이미 관계가 명확하므로 정제 불필요
    // 유사도가 중간 범위인 엣지들만 선택적으로 정제
    const edgesToRefine = initialEdges.filter(e => e.needsRefinement).slice(0, 20) // 최대 20개만 정제 (비용 절감)
    
    console.log(`Refining ${edgesToRefine.length} edges with LLM...`)
    
    const refinedEdges = await Promise.all(
      edgesToRefine.map(async (edge) => {
        try {
          // 두 개념이 실제로 관련이 있는지 LLM으로 확인
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: '당신은 개념 간 관계를 분석하는 전문가입니다. 두 개념이 의미적으로 관련이 있는지 판단하여 JSON 형식으로 응답하세요. 응답 형식: {"related": true/false, "reason": "이유"}',
              },
              {
                role: 'user',
                content: `다음 두 개념이 의미적으로 관련이 있는지 판단해주세요:\n\n개념1: ${edge.conceptI}\n개념2: ${edge.conceptJ}\n\n응답은 반드시 {"related": true/false, "reason": "이유"} 형식이어야 합니다.`,
              },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          })
          
          const responseText = completion.choices[0]?.message?.content || '{}'
          const parsed = JSON.parse(responseText)
          const isRelated = parsed.related === true
          
          if (!isRelated) {
            // LLM이 관련이 없다고 판단하면 엣지 제거
            console.log(`Edge removed by LLM: ${edge.conceptI} - ${edge.conceptJ} (reason: ${parsed.reason || 'N/A'})`)
            return null
          }
          
          // 관련이 있다고 판단되면 가중치를 약간 증가 (LLM 검증됨)
          return {
            ...edge,
            weight: Math.min(1.0, edge.weight * 1.2), // 검증된 엣지는 가중치 증가
            llmVerified: true,
          }
        } catch (error) {
          console.error(`Error refining edge ${edge.conceptI} - ${edge.conceptJ}:`, error)
          // 정제 실패 시 원본 엣지 유지
          return edge
        }
      })
    )
    
    // 정제된 엣지와 정제되지 않은 엣지 결합
    const finalEdges = [
      ...initialEdges.filter(e => !e.needsRefinement), // 정제 불필요한 엣지들
      ...refinedEdges.filter(e => e !== null), // 정제된 엣지들 (null 제거)
    ]
    
    // 최종 엣지를 그래프에 추가
    finalEdges.forEach(edge => {
      conceptGraph.edges.push({
        source: edge.source,
        target: edge.target,
        similarity: edge.similarity,
        weight: edge.weight,
        summaryIndices: edge.summaryIndices,
        combinedScore: edge.combinedScore, // 하이브리드 점수
        cooccurrenceCount: edge.cooccurrenceCount, // 공기 횟수
      })
    })
    
    console.log('Concept graph created:', {
      nodes: conceptGraph.nodes.length,
      edges: conceptGraph.edges.length,
      initialEdges: initialEdges.length,
      refinedEdges: refinedEdges.filter(e => e !== null).length,
      removedEdges: refinedEdges.filter(e => e === null).length,
      sampleEdges: conceptGraph.edges.slice(0, 10).map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        summaryIndices: e.summaryIndices,
      })),
      edgesWithSummaryIndices: conceptGraph.edges.filter(e => e.summaryIndices && e.summaryIndices.length > 0).length,
      edgesWithoutSummaryIndices: conceptGraph.edges.filter(e => !e.summaryIndices || e.summaryIndices.length === 0).length,
    })
    
    // 디버깅을 위한 상세 정보 추가
    const debugInfo = {
      totalConcepts: allConcepts.length,
      totalConceptEmbeddings: conceptEmbeddings.length,
      conceptsBySummaryLengths: conceptsBySummary.map((c, idx) => ({ summaryIndex: idx, conceptCount: c.length })),
      conceptGraphNodes: conceptGraph.nodes.length,
      conceptGraphEdges: conceptGraph.edges.length,
      sampleNodes: conceptGraph.nodes.slice(0, 5).map(n => ({
        id: n.id,
        label: n.label,
        summaryIndices: n.summaryIndices,
      })),
      sampleEdges: conceptGraph.edges.slice(0, 10).map(e => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
        similarity: e.similarity,
        summaryIndices: e.summaryIndices,
      })),
    }
    
    console.log('API: Returning concept graph with debug info:', debugInfo)
    
    return NextResponse.json({
      results,
      totalSummaries: validSummaries.length,
      conceptGraph,
      conceptsBySummary,
      debugInfo, // 디버깅 정보 추가
    })
  } catch (error: any) {
    console.error('Similarity analysis error:', error)
    return NextResponse.json(
      {
        error: '유사도 분석에 실패했습니다.',
        details: error.message || '알 수 없는 오류가 발생했습니다',
      },
      { status: 500 }
    )
  }
}

