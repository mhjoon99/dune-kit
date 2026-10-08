// 서브에이전트 모델 분배 규칙(순수 함수).
import type { NeonEffort, NeonRoute } from '../types'

export const EFFORTS: readonly NeonEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
export const MODEL_ALIASES = ['opus', 'sonnet', 'haiku'] as const
export const KNOWN_AGENT_TYPES = ['general-purpose', 'Explore', 'Plan'] as const

export const isEffort = (v: string): v is NeonEffort => (EFFORTS as readonly string[]).includes(v)

/** 에이전트 type 에 맞는 규칙(대소문자 무시, 마지막에 추가한 것이 우선). */
export function routeFor(routes: readonly NeonRoute[], agentType: string | undefined): NeonRoute | undefined {
  if (agentType === undefined) return undefined
  const t = agentType.toLowerCase()
  return [...routes].reverse().find(r => r.agentType.toLowerCase() === t)
}

/** 저장소에서 읽은 값을 규칙 표로 정리(잘못된 항목은 버림). */
export function sanitizeRoutes(raw: unknown): NeonRoute[] {
  if (!Array.isArray(raw)) return []
  const out: NeonRoute[] = []
  for (const item of raw as unknown[]) {
    if (typeof item !== 'object' || item === null) continue
    const r = item as Record<string, unknown>
    if (typeof r.agentType !== 'string' || typeof r.model !== 'string' || r.agentType === '' || r.model === '') continue
    const effort = typeof r.effort === 'string' && isEffort(r.effort) ? r.effort : undefined
    out.push(effort === undefined ? { agentType: r.agentType, model: r.model } : { agentType: r.agentType, model: r.model, effort })
  }
  return out
}

/** 추가 폼 → 규칙. 타입·모델이 비면 undefined. */
export function draftToRoute(agentType: string, model: string, effort: string): NeonRoute | undefined {
  const t = agentType.trim()
  const m = model.trim()
  if (t === '' || m === '') return undefined
  return isEffort(effort) ? { agentType: t, model: m, effort } : { agentType: t, model: m }
}

export const routeLogLine = (agentType: string, r: NeonRoute) =>
  `model-route: ${agentType} → ${r.model}${r.effort !== undefined ? ` (${r.effort})` : ''}`
