// neon-bubble 의 $.state 계약: 띠·패널이 그리는 값과 가드의 1회 허용 상태.

export type NeonRule =
  | 'env'
  | 'force-push'
  | 'no-verify'
  | 'protected-branch'
  | 'destructive'
  | 'private-ip'

export type NeonLimit = { kind: string; percentUsed: number; resetsAt?: string }

export type NeonUsage = {
  ctxPercent?: number
  costUsd?: number
  startedAt?: number
  limits: NeonLimit[]
}

export type NeonDiff = { added: number; removed: number }

export type NeonEdit = { path: string; count: number; at: number; file?: string }

export type NeonCall = { at: number; tool: string; summary: string; failed: boolean }

export type NeonSample = { ctx?: number; five?: number }

export type NeonMemory = { name: string; kind: '생성' | '수정'; at: number }

export type NeonNote = { id: string; text: string; done: boolean }

// 알림 단계 기억: 창(kind)별 마지막 단계(1 주의, 2 경고)와 그때의 resetsAt
export type NeonAlertMemo = Record<string, { level: number; resetsAt?: string }>

export type NeonEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

// 서브에이전트 모델 분배 규칙: agentType 의 요청을 model(·effort)로 보낸다
export type NeonRoute = { agentType: string; model: string; effort?: NeonEffort }

export type NeonRouteDraft = { agentType: string; model: string; effort: string }

export type NeonReplayEdit = { path: string; tool: string; diff: string }

export type NeonReplayTurn = { turnId: string; edits: NeonReplayEdit[] }

// 진행 중인 턴: 스피너 꼬리와 턴 요약 줄이 읽는다
export type NeonTurnLive = { turnId: string; startedAt: number; tools: number; costStart?: number; costNow?: number }

declare module 'claude-code' {
  interface PluginState {
    'neon-bubble': {
      branch: string | null
      diff: NeonDiff | null
      project: string | null
      model: string | null
      usage: NeonUsage | null
      now: number
      allow: NeonRule[]
      alerts: NeonAlertMemo
      edits: NeonEdit[]
      calls: NeonCall[]
      samples: NeonSample[]
      memory: NeonMemory[]
      notes: NeonNote[]
      notesKey: string | null
      prompts: string[]
      turnId: string | null
      commentWarned: string[]
      turnLive: NeonTurnLive | null
      tick: number
      ctxSizes: number[]
      ctxWindow: number | null
      replay: NeonReplayTurn[]
      replayView: { back: number; index: number }
      routes: NeonRoute[]
      routeHits: number
      agentTypes: string[]
      routeDraft: NeonRouteDraft
    }
  }
}
