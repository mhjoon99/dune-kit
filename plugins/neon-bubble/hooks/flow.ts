// flow(이어지는 작업 묶음) 판정의 단축 규칙과 분류 입력.

export const FLOW_LABELS = ['continue', 'new'] as const

export const COMPACT_INSTRUCTIONS = '방금 끝난 작업 흐름의 결과·결정·남은 일만 짧게 남긴다'

export type FlowGate = { decision: 'pass'; why: string } | { decision: 'classify' }

/** 분류 없이 통과시킬지: 슬래시 명령, 첫 프롬프트, 컨텍스트가 적을 때, 짧은 맞장구. */
export function flowGate(text: string, history: readonly string[], ctxPercent: number | undefined, minPercent: number): FlowGate {
  const t = text.trim()
  if (t.startsWith('/')) return { decision: 'pass', why: 'slash' }
  if (history.length === 0) return { decision: 'pass', why: 'first' }
  if (ctxPercent === undefined || ctxPercent < minPercent) return { decision: 'pass', why: 'small-context' }
  if (isShortAck(t)) return { decision: 'pass', why: 'short-ack' }
  return { decision: 'classify' }
}

/** 20자 미만의 짧은 응답("응 진행해", "좋아", "ㅇㅇ")은 앞 작업의 연속으로 본다. */
export const isShortAck = (text: string) => [...text.trim()].length < 20

/** 분류기에 줄 텍스트: 최근 사용자 프롬프트 3개(각 300자) + 새 프롬프트. */
export function classifyInput(history: readonly string[], text: string): string {
  const recent = history.slice(-3).map((p, i) => `${i + 1}. ${p.slice(0, 300)}`)
  return [
    '아래 "새 요청"이 "이전 요청들"과 이어지는 같은 작업(같은 기능의 계획·구현·리뷰·수정)이면 continue,',
    '주제가 다른 별개의 새 작업이면 new 로 답한다.',
    '',
    '이전 요청들:',
    ...recent,
    '',
    `새 요청: ${text.slice(0, 1200)}`,
  ].join('\n')
}

export const rememberPrompt = (history: readonly string[], text: string) => [...history, text.slice(0, 300)].slice(-3)
