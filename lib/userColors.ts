// 멤버별 색상 팔레트 (관리자 콘셉트 네트워크 그래프와 동일한 규칙)
export const USER_COLORS = ['#ef4444', '#eab308', '#22c55e', '#3b82f6'] // 빨강, 노랑, 초록, 파랑

// 이름을 가나다순으로 정렬해 일관된 색상 매핑을 만든다
export function buildColorMap(names: string[]): Map<string, string> {
  const sorted = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'ko-KR')
  )
  const map = new Map<string, string>()
  sorted.forEach((name, i) => {
    map.set(name, USER_COLORS[i % USER_COLORS.length])
  })
  return map
}
