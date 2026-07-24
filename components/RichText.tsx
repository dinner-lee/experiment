'use client'

import React from 'react'

// 채팅 메시지의 최소 마크다운 렌더링: **텍스트** → 굵게
// (줄바꿈은 부모의 whitespace-pre-wrap이 처리)
export default function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*\n]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  )
}
