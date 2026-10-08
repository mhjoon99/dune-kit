// 상태 띠·패널·알림에 쓰는 순수 계산: 색, 게이지, 시간 포맷, 배치, 알림 단계.
import type { NeonAlertMemo, NeonLimit } from '../types'

export const C = {
  text: '#f8f8f2',
  sub: '#6e6a86',
  empty: '#3d3a4a',
  add: '#5ce1e6',
  del: '#ff6ac1',
  pct: '#e0c3ff',
  pctWarn: '#ffb86c',
  pctAlert: '#ff5c8a',
  fail: '#ff5c8a',
} as const

const STOPS = ['#ff6ac1', '#b388ff', '#5ce1e6'] as const

const hex = (c: string) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)) as [number, number, number]
const toHex = (v: readonly number[]) => `#${v.map(x => Math.round(x).toString(16).padStart(2, '0')).join('')}`

/** 0..1 위치의 그라데이션 색(#ff6ac1 → #b388ff → #5ce1e6 선형 보간). */
export function gradientAt(t: number): string {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1)
  const i = Math.min(STOPS.length - 2, Math.floor(x))
  const f = x - i
  const a = hex(STOPS[i] as string)
  const b = hex(STOPS[i + 1] as string)
  return toHex(a.map((v, k) => v + ((b[k] as number) - v) * f))
}

export type Cell = { glyph: '●' | '○'; color: string }

/** 칸 수 n 게이지: 채운 칸은 칸 위치별 그라데이션, 빈 칸은 어두운 보라. */
export function gauge(percent: number, cells: number): Cell[] {
  const filled = Math.min(cells, Math.max(0, Math.round((percent / 100) * cells)))
  return Array.from({ length: cells }, (_, i) =>
    i < filled ? { glyph: '●', color: gradientAt(cells === 1 ? 0 : i / (cells - 1)) } : { glyph: '○', color: C.empty },
  )
}

export function percentStyle(percent: number, warn = 80, alert = 95): { color: string; bold: boolean } {
  if (percent >= alert) return { color: C.pctAlert, bold: true }
  if (percent >= warn) return { color: C.pctWarn, bold: false }
  return { color: C.pct, bold: false }
}

/** 남은/지난 시간: 분 단위 내림, `45m` / `1h05m` / `2d03h`. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(minutes / 60)
  if (h >= 48) return `${Math.floor(h / 24)}d${String(h % 24).padStart(2, '0')}h`
  if (h > 0) return `${h}h${String(minutes % 60).padStart(2, '0')}m`
  return `${minutes}m`
}

/** 리셋까지 남은 시간은 오직 `resetsAt - now`. 값이 없거나 깨졌으면 undefined. */
export function formatReset(resetsAt: string | undefined, now: number): string | undefined {
  if (resetsAt === undefined) return undefined
  const at = Date.parse(resetsAt)
  if (Number.isNaN(at)) return undefined
  return formatDuration(at - now)
}

export const formatCost = (usd: number) => `$${usd.toFixed(2)}`

/** `claude-opus-5-5[1m]` → `Opus 5.5`; 이미 표시 이름이면 그대로. */
export function prettyModel(model: string): string {
  const id = model.replace(/\[.*?\]/g, '').trim()
  const m = /claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/i.exec(id)
  if (m === null) return id
  const family = (m[1] as string).charAt(0).toUpperCase() + (m[1] as string).slice(1).toLowerCase()
  return m[3] === undefined ? `${family} ${m[2]}` : `${family} ${m[2]}.${m[3]}`
}

/** 터미널 칸 폭 추정: 이모지·한글 등 넓은 글자는 2칸. */
export function cellWidth(s: string): number {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number
    if (cp === 0xfe0f || cp === 0x200d) continue
    const wide =
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x2600 && cp <= 0x27bf && ch !== '✧') ||
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0x3000 && cp <= 0x9fff)
    w += wide ? 2 : 1
  }
  return w
}

export const SPARKS = '▁▂▃▄▅▆▇█'

export function sparkline(values: readonly (number | undefined)[]): string {
  return values
    .map(v => (v === undefined ? ' ' : (SPARKS[Math.min(7, Math.max(0, Math.floor((v / 100) * 8)))] as string)))
    .join('')
}

// ── 상태 띠 배치 ────────────────────────────────────────────

export type BandInput = {
  model?: string
  branch?: string
  diff?: { added: number; removed: number }
  project?: string
  ctxPercent?: number
  costUsd?: number
  elapsed?: string
  five?: { percent: number; reset?: string }
  seven?: { percent: number; reset?: string }
  forecast?: string
}

export type BandPlan = {
  cells: number
  smallCells: number
  showProject: boolean
  showCost: boolean
  showElapsed: boolean
}

const SEP = '  ✧  '

export function row1Text(d: BandInput, showProject: boolean): string {
  const parts: string[] = []
  if (d.model !== undefined) parts.push(`⚡ ${d.model}`)
  if (d.branch !== undefined) {
    const diff = d.diff !== undefined && (d.diff.added > 0 || d.diff.removed > 0) ? ` +${d.diff.added} −${d.diff.removed}` : ''
    parts.push(`🔮 ${d.branch}${diff}`)
  }
  if (showProject && d.project !== undefined) parts.push(`🫧 ${d.project}`)
  return parts.join(SEP)
}

export function row2Text(d: BandInput, plan: Pick<BandPlan, 'cells' | 'showCost' | 'showElapsed'>): string {
  const parts: string[] = []
  if (d.ctxPercent !== undefined) parts.push(`🧠 ${'●'.repeat(plan.cells)} ${Math.round(d.ctxPercent)}%${d.forecast !== undefined ? ` · ${d.forecast}` : ''}`)
  if (plan.showCost && d.costUsd !== undefined) parts.push(`💎 ${formatCost(d.costUsd)}`)
  if (plan.showElapsed && d.elapsed !== undefined) parts.push(`🌙 ${d.elapsed}`)
  return parts.join('   ')
}

export function row3Text(d: BandInput, cells: number, smallCells: number): string {
  const parts: string[] = []
  if (d.five !== undefined) parts.push(`🚀 5h ${'●'.repeat(cells)} ${Math.round(d.five.percent)}%${d.five.reset !== undefined ? ` ↻ ${d.five.reset}` : ''}`)
  if (d.seven !== undefined) parts.push(`🪐 7d ${'●'.repeat(smallCells)} ${Math.round(d.seven.percent)}%`)
  return parts.join('   ')
}

/** 폭에 맞춰 게이지 칸(12→최소 6)을 줄이고, 그래도 넘치면 경로→비용→경과 순으로 뺀다. */
export function planBand(d: BandInput, columns: number): BandPlan {
  const plan: BandPlan = { cells: 12, smallCells: 6, showProject: true, showCost: true, showElapsed: true }
  const fits = () =>
    cellWidth(row1Text(d, plan.showProject)) <= columns &&
    cellWidth(row2Text(d, plan)) <= columns &&
    cellWidth(row3Text(d, plan.cells, plan.smallCells)) <= columns
  while (!fits() && plan.cells > 6) {
    plan.cells -= 1
    plan.smallCells = Math.min(6, plan.cells)
  }
  if (!fits()) plan.showProject = false
  if (!fits()) plan.showCost = false
  if (!fits()) plan.showElapsed = false
  return plan
}

// ── 사용량 알림 ─────────────────────────────────────────────

export type Thresholds = { warn: number; alert: number }

const LABEL: Record<string, { icon: string; name: string }> = {
  five_hour: { icon: '🚀', name: '5시간' },
  seven_day: { icon: '🪐', name: '7일' },
}

/**
 * 측정값으로 알림 단계를 갱신하고 새로 띄울 토스트를 돌려준다.
 * 창별로 같은 단계는 resetsAt 이 바뀌기 전까지 한 번만, 컨텍스트는 주의선 아래로 내려가면 초기화.
 */
export function nextAlerts(
  memo: NeonAlertMemo,
  measure: { ctxPercent?: number; limits: readonly NeonLimit[] },
  now: number,
  t: Thresholds,
): { memo: NeonAlertMemo; toasts: string[] } {
  const next: NeonAlertMemo = { ...memo }
  const toasts: string[] = []
  const levelOf = (p: number) => (p >= t.alert ? 2 : p >= t.warn ? 1 : 0)

  for (const limit of measure.limits) {
    const label = LABEL[limit.kind]
    if (label === undefined) continue
    const prev = next[limit.kind]
    const base = prev !== undefined && prev.resetsAt === limit.resetsAt ? prev.level : 0
    const level = levelOf(limit.percentUsed)
    if (level > base) {
      const reset = formatReset(limit.resetsAt, now)
      const icon = level === 2 ? '⚠️' : label.icon
      toasts.push(`${icon} ${label.name} 사용량 ${Math.round(limit.percentUsed)}%${reset !== undefined ? ` · ${reset} 후 리셋` : ''}`)
    }
    next[limit.kind] = { level: Math.max(level, base), resetsAt: limit.resetsAt }
  }

  if (measure.ctxPercent !== undefined) {
    const prev = next.context?.level ?? 0
    const level = levelOf(measure.ctxPercent)
    const pct = Math.round(measure.ctxPercent)
    if (level > prev) toasts.push(level === 2 ? `⚠️ 컨텍스트 ${pct}% — /compact 를 고려하세요` : `🧠 컨텍스트 ${pct}% — 곧 정리가 필요해요`)
    // compact 로 주의선 아래로 내려가면 다시 알릴 수 있게 초기화
    next.context = { level: level === 0 ? 0 : Math.max(level, prev) }
  }
  return { memo: next, toasts }
}

// ── 사이드 패널 ─────────────────────────────────────────────

export const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 패널 높이에 맞게 섹션별 최대 개수를 나눈다(기본 12/15/2/6/8). */
export function sectionLimits(rows: number): { edits: number; calls: number; memory: number; notes: number } {
  const want = { edits: 12, calls: 15, memory: 6, notes: 8 }
  // 제목 5줄 + 추이 2줄 + 메모 입력 1줄 + 섹션 사이 여백 4줄
  const room = Math.max(4, rows - 12)
  const total = want.edits + want.calls + want.memory + want.notes
  if (room >= total) return want
  const scale = room / total
  return {
    edits: Math.max(1, Math.floor(want.edits * scale)),
    calls: Math.max(1, Math.floor(want.calls * scale)),
    memory: Math.max(1, Math.floor(want.memory * scale)),
    notes: Math.max(1, Math.floor(want.notes * scale)),
  }
}

// ── 턴 요약·스피너·컨텍스트 예보 ────────────────────────────

/** 1234 → `1.2k`, 999 → `999`. */
export const formatTokens = (n: number) => (n < 1000 ? `${Math.round(n)}` : `${(n / 1000).toFixed(1)}k`)

/** 초 단위 경과: `12s`, `1m05s`. */
export function formatSeconds(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

export type TokenUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

/** `✓ 12s · 도구 5 · 입력 12.3k · 출력 1.2k · 캐시 81%` — usage 가 없으면 시간·도구만. */
export function turnSummary(durationMs: number, tools: number, usage: TokenUsage | undefined): string {
  const parts = [`✓ ${formatSeconds(durationMs)}`, `도구 ${tools}`]
  if (usage !== undefined) {
    const input = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
    parts.push(`입력 ${formatTokens(input)}`, `출력 ${formatTokens(usage.output_tokens)}`)
    if (input > 0) parts.push(`캐시 ${Math.round((usage.cache_read_input_tokens / input) * 100)}%`)
  }
  return parts.join(' · ')
}

/** 스피너 꼬리: ` · 🛠 3 · ⏱ 12s · 💎 $0.04` (비용 모르면 생략). 엔진의 말줄임은 호출 쪽에서 붙인다. */
export function spinnerSuffix(tools: number, elapsedMs: number, costUsd: number | undefined): string {
  const parts = [`🛠 ${tools}`, `⏱ ${formatSeconds(elapsedMs)}`]
  if (costUsd !== undefined && costUsd > 0) parts.push(`💎 $${costUsd.toFixed(2)}`)
  return ` · ${parts.join(' · ')}`
}

/**
 * 턴 끝 컨텍스트 크기 기록으로 "가득 찰 때까지 남은 턴"을 추정한다.
 * 최근 5번의 증가량 평균(증가한 것만); 추정 불가·증가 없음이면 undefined.
 */
export function forecastTurns(sizes: readonly number[], window: number | undefined): number | undefined {
  if (window === undefined || window <= 0 || sizes.length < 2) return undefined
  const deltas: number[] = []
  for (let i = 1; i < sizes.length; i += 1) deltas.push((sizes[i] as number) - (sizes[i - 1] as number))
  const recent = deltas.slice(-5).filter(d => d > 0)
  if (recent.length === 0) return undefined
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length
  const left = window - (sizes.at(-1) as number)
  return Math.max(0, Math.floor(left / avg))
}

export const forecastLabel = (turns: number | undefined) =>
  turns === undefined ? undefined : turns > 10 ? '☁️ 10+턴' : `☁️ ~${turns}턴`

// ── 편집 리플레이 diff ─────────────────────────────────────

const REPLAY_CAP = 20_000

const cut = (s: string) => (s.length > REPLAY_CAP ? s.slice(0, REPLAY_CAP) : s)

/** 두 텍스트의 공통 앞·뒤 줄을 빼고 한 덩어리 unified diff hunk 를 만든다(항목당 20KB 상한). */
export function makeDiff(before: string, after: string, startLine = 1): string {
  // 빈 텍스트는 0줄(새 파일·전체 삭제)
  const a = before === '' ? [] : cut(before).split('\n')
  const b = after === '' ? [] : cut(after).split('\n')
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1
  const ctxBefore = Math.min(head, 3)
  const ctxAfter = Math.min(tail, 3)
  const removed = a.slice(head, a.length - tail)
  const added = b.slice(head, b.length - tail)
  const pre = a.slice(head - ctxBefore, head)
  const post = a.slice(a.length - tail, a.length - tail + ctxAfter)
  const oldCount = pre.length + removed.length + post.length
  const newCount = pre.length + added.length + post.length
  const oldStart = oldCount === 0 ? startLine - 1 + head : startLine + head - ctxBefore
  const newStart = newCount === 0 ? startLine - 1 + head : startLine + head - ctxBefore
  const lines = [
    `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    ...pre.map(l => ` ${l}`),
    ...removed.map(l => `-${l}`),
    ...added.map(l => `+${l}`),
    ...post.map(l => ` ${l}`),
  ]
  return lines.join('\n')
}

export const replayHeader = (index: number, total: number, path: string, tool: string) => `${index + 1}/${total} · ${path} · ${tool}`

// ── 묻는 가드 미리보기 ─────────────────────────────────────

const listHead = (items: readonly string[], n = 5) =>
  items.length <= n ? items.join(', ') : `${items.slice(0, n).join(', ')}, …`

export const formatBytes = (n: number) =>
  n < 1024 ? `${n}B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)}KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)}MB` : `${(n / 1024 ** 3).toFixed(1)}GB`

export function previewRm(files: number, bytes: number, top: readonly string[], truncated: boolean): string {
  const count = truncated ? `${files}+개` : `${files}개`
  return `지워질 파일: ${count} · ${formatBytes(bytes)}${truncated ? '+' : ''}${top.length > 0 ? ` (${listHead(top)})` : ''}`
}

/** `git status --short` + `git stash list` → 날아갈 변경. */
export function previewReset(statusShort: string, stashList: string): string | undefined {
  const files = statusShort
    .split(/\r?\n/)
    .filter(l => l.trim() !== '' && !l.startsWith('??'))
    .map(l => l.slice(3).trim())
  const stashes = stashList.split(/\r?\n/).filter(l => l.trim() !== '').length
  if (files.length === 0 && stashes === 0) return '날아갈 변경: 없음'
  return `날아갈 변경: ${files.length}개 파일${files.length > 0 ? ` (${listHead(files)})` : ''}${stashes > 0 ? ` · stash ${stashes}개` : ''}`
}

/** `git clean -n` 출력(`Would remove x`) → 지워질 목록. */
export function previewClean(dryRun: string): string {
  const files = dryRun
    .split(/\r?\n/)
    .map(l => /^Would remove (.+)$/.exec(l.trim())?.[1])
    .filter((x): x is string => x !== undefined)
  return files.length === 0 ? '지워질 파일: 없음' : `지워질 파일: ${files.length}개 (${listHead(files)})`
}

/** `git diff --stat` → 되돌려질 변경. */
export function previewRestore(diffStat: string): string {
  const lines = diffStat.split(/\r?\n/).filter(l => l.includes('|'))
  const files = lines.map(l => (l.split('|')[0] as string).trim())
  const summary = diffStat.split(/\r?\n/).find(l => /files? changed/.test(l))?.trim()
  return files.length === 0 ? '되돌릴 변경: 없음' : `되돌릴 변경: ${files.length}개 파일 (${listHead(files)})${summary !== undefined ? ` · ${summary}` : ''}`
}

/** `git log --oneline HEAD..<remote>/<branch>` → 덮어써질 원격 커밋. */
export function previewPush(log: string, ref: string): string {
  const commits = log.split(/\r?\n/).filter(l => l.trim() !== '')
  return commits.length === 0 ? `덮어써질 원격 커밋: 없음 (${ref})` : `덮어써질 원격 커밋 ${commits.length}개 (${ref}): ${listHead(commits, 3)}`
}

export function askQuestion(command: string, previews: readonly string[]): string {
  const shown = command.replace(/\s+/g, ' ').trim()
  const head = `⚠️ 되돌릴 수 없는 명령이에요 — ${shown.length > 120 ? `${shown.slice(0, 117)}…` : shown}`
  return [head, ...previews, '실행할까요?'].join('\n')
}

export const ASK_REJECTED = '사용자가 이 명령을 거절했어요. 다른 방법을 쓰기 전에 먼저 물어보세요.'

// ── 도구 행 네온 ───────────────────────────────────────────

export type ToolStyle = { icon: string; color: string }

/** 도구 이름 → 아이콘·색. 모르는 도구는 undefined(엔진 기본 그대로). */
export function toolStyle(tool: string): ToolStyle | undefined {
  if (tool === 'Bash' || tool === 'PowerShell') return { icon: '🐚', color: '#5ce1e6' }
  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'NotebookEdit') return { icon: '✏️', color: '#ff6ac1' }
  if (tool === 'Write') return { icon: '📝', color: '#ff6ac1' }
  if (tool === 'Read') return { icon: '📖', color: '#b388ff' }
  if (tool === 'Grep' || tool === 'Glob') return { icon: '🔍', color: '#b388ff' }
  if (tool === 'Agent' || tool === 'Task') return { icon: '🤖', color: '#e0c3ff' }
  if (tool === 'WebFetch' || tool === 'WebSearch') return { icon: '🌐', color: '#8be9fd' }
  if (tool.startsWith('mcp__')) return { icon: '🔌', color: '#e0c3ff' }
  return undefined
}

export const PROMPT_HINT_TAIL = '/side-panel · /replay · /model-route'
