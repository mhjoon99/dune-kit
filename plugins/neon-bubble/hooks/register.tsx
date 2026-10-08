// neon-bubble 진입점: 상태 띠, 알림, 패널, 가드(차단·묻기), flow compact, 스피너·턴 요약, 리플레이, 모델 분배.
// 엔진 규칙상 $ 를 받는 함수는 이 파일 안에 있어야 해서 그리기·git 읽기도 여기 둔다.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Frozen, PluginOptions, Register, RenderElement, RenderInput, Timer } from 'claude-code'

import type { NeonReplayEdit, NeonRule } from '../types'
import { COMPACT_INSTRUCTIONS, FLOW_LABELS, classifyInput, flowGate, rememberPrompt } from './flow'
import {
  ASK_REJECTED,
  C,
  PROMPT_HINT_TAIL,
  askQuestion,
  forecastLabel,
  forecastTurns,
  formatDuration,
  formatReset,
  gauge,
  hhmm,
  makeDiff,
  nextAlerts,
  percentStyle,
  planBand,
  prettyModel,
  previewClean,
  previewPush,
  previewReset,
  previewRestore,
  previewRm,
  replayHeader,
  sectionLimits,
  sparkline,
  spinnerSuffix,
  toolStyle,
  turnSummary,
} from './format'
import type { BandInput, Thresholds } from './format'
import type { PreviewPlan } from './guard-rules'
import { EFFORTS, KNOWN_AGENT_TYPES, MODEL_ALIASES, draftToRoute, routeFor, routeLogLine, sanitizeRoutes } from './route'
import {
  RULES,
  cleanDryRunArgs,
  baseName,
  branchDirs,
  isAbsolute,
  isIpExempt,
  isMemoryPath,
  joinPath,
  longestCommentBlock,
  needsUntrackedEnv,
  parentDir,
  parseCommand,
  parseHead,
  parseShortstat,
  privateIps,
  relativeTo,
  scanCommand,
  splitList,
} from './guard-rules'

// ── $.state 참조(계약은 types/index.d.ts) ──
const branchAtom = atom({ plugin: 'neon-bubble', key: 'branch' } as const, null)
const diffAtom = atom({ plugin: 'neon-bubble', key: 'diff' } as const, null)
const projectAtom = atom({ plugin: 'neon-bubble', key: 'project' } as const, null)
const modelAtom = atom({ plugin: 'neon-bubble', key: 'model' } as const, null)
const usageAtom = atom({ plugin: 'neon-bubble', key: 'usage' } as const, null)
const nowAtom = atom({ plugin: 'neon-bubble', key: 'now' } as const, 0)
const allowAtom = atom({ plugin: 'neon-bubble', key: 'allow' } as const, [])
const alertsAtom = atom({ plugin: 'neon-bubble', key: 'alerts' } as const, {})
const editsAtom = atom({ plugin: 'neon-bubble', key: 'edits' } as const, [])
const callsAtom = atom({ plugin: 'neon-bubble', key: 'calls' } as const, [])
const samplesAtom = atom({ plugin: 'neon-bubble', key: 'samples' } as const, [])
const memoryAtom = atom({ plugin: 'neon-bubble', key: 'memory' } as const, [])
const notesAtom = atom({ plugin: 'neon-bubble', key: 'notes' } as const, [])
const notesKeyAtom = atom({ plugin: 'neon-bubble', key: 'notesKey' } as const, null)
const promptsAtom = atom({ plugin: 'neon-bubble', key: 'prompts' } as const, [])
const turnAtom = atom({ plugin: 'neon-bubble', key: 'turnId' } as const, null)
const commentWarnedAtom = atom({ plugin: 'neon-bubble', key: 'commentWarned' } as const, [])
const turnLiveAtom = atom({ plugin: 'neon-bubble', key: 'turnLive' } as const, null)
const tickAtom = atom({ plugin: 'neon-bubble', key: 'tick' } as const, 0)
const ctxSizesAtom = atom({ plugin: 'neon-bubble', key: 'ctxSizes' } as const, [])
const ctxWindowAtom = atom({ plugin: 'neon-bubble', key: 'ctxWindow' } as const, null)
const replayAtom = atom({ plugin: 'neon-bubble', key: 'replay' } as const, [])
const replayViewAtom = atom({ plugin: 'neon-bubble', key: 'replayView' } as const, { back: 1, index: 0 })
const routesAtom = atom({ plugin: 'neon-bubble', key: 'routes' } as const, [])
const routeHitsAtom = atom({ plugin: 'neon-bubble', key: 'routeHits' } as const, 0)
const agentTypesAtom = atom({ plugin: 'neon-bubble', key: 'agentTypes' } as const, [])
const routeDraftAtom = atom({ plugin: 'neon-bubble', key: 'routeDraft' } as const, { agentType: 'Explore', model: 'sonnet', effort: 'default' })

const REPLAY_PANE = 'neon-replay'
const ROUTES_PANE = 'neon-routes'
const ROUTES_KEY = 'modelRoutes'

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const COMMENT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
const DIFF_TRIGGERS = new Set(['Bash', 'PowerShell', 'Edit', 'Write', 'MultiEdit'])

const str = (o: PluginOptions, k: string, d: string) => (typeof o[k] === 'string' ? (o[k] as string) : d)
const num = (o: PluginOptions, k: string, d: number) => (typeof o[k] === 'number' ? (o[k] as number) : d)
const bool = (o: PluginOptions, k: string, d: boolean) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : d)

type Args = Record<string, unknown>
const argsOf = (e: unknown) => e as Args
const text = (v: unknown) => (typeof v === 'string' ? v : '')

const filePathOf = (a: Args) => text(a.file_path) || text(a.notebook_path)

/** 도구가 새로 쓰는 내용(Write 전체, Edit/MultiEdit 의 new_string, 노트북 셀). */
function newContents(tool: string, a: Args): { text: string; old: string; whole: boolean }[] {
  if (tool === 'Write') return [{ text: text(a.content), old: '', whole: true }]
  if (tool === 'Edit') return [{ text: text(a.new_string), old: text(a.old_string), whole: false }]
  if (tool === 'NotebookEdit') return [{ text: text(a.new_source), old: '', whole: false }]
  if (tool === 'MultiEdit' && Array.isArray(a.edits)) {
    return (a.edits as Args[]).map(x => ({ text: text(x.new_string), old: text(x.old_string), whole: false }))
  }
  return []
}

function summarize(tool: string, a: Args): string {
  if (SHELL_TOOLS.has(tool)) return text(a.command).replace(/\s+/g, ' ').trim().slice(0, 40)
  const file = filePathOf(a)
  if (file !== '') return baseName(file)
  const hint = text(a.pattern) || text(a.url) || text(a.description) || text(a.query)
  return hint.replace(/\s+/g, ' ').slice(0, 40)
}

const DENY_PREFIX = '🛑 neon-bubble 가드:'

let turnTicker: Timer | undefined
// 메인 대화의 마지막 요청이 본 컨텍스트 크기(토큰), 턴 끝에 기록
let lastCtxSize: number | undefined
// agentId → 에이전트 type, 그리고 턴·에이전트별 로그 1회
const agentTypeCache = new Map<string, string>()
const routeLogged = new Set<string>()

let timers: Timer[] = []

let branchBusy = false
let diffBusy = false
// 2초마다 위로 걸어 올라가지 않도록 세션 위치의 저장소 루트를 기억한다
let topCache: { cwd: string; top: GitTop } | undefined

async function sessionTop($: EngineInterface): Promise<GitTop | undefined> {
  const cwd = await $.session.cwd()
  if (topCache?.cwd === cwd) return topCache.top
  const top = await findGitTop($, cwd)
  topCache = top === undefined ? undefined : { cwd, top }
  return top
}

// 브랜치: .git/HEAD 를 직접 읽고, 바뀐 경우에만 쓴다
async function refreshBranch($: EngineInterface) {
  if (branchBusy) return
  branchBusy = true
  try {
    const top = await sessionTop($)
    if (top === undefined) return
    const branch = await readBranch($, top)
    if (branch !== undefined && branch !== (await read($, branchAtom))) await update($, branchAtom, () => branch)
    const project = baseName(top.top)
    if (project !== (await read($, projectAtom))) await update($, projectAtom, () => project)
  } catch {
    // 실패하면 이전 값 유지
  } finally {
    branchBusy = false
  }
}

async function refreshDiff($: EngineInterface) {
  if (diffBusy) return
  diffBusy = true
  try {
    const top = await sessionTop($)
    if (top === undefined) return
    const diff = await readDiff($, top.top)
    const prev = await read($, diffAtom)
    if (diff !== undefined && (prev === null || prev.added !== diff.added || prev.removed !== diff.removed)) await update($, diffAtom, () => diff)
  } catch {
    // 실패하면 이전 값 유지
  } finally {
    diffBusy = false
  }
}

async function refreshMeta($: EngineInterface) {
  try {
    const model = await $.session.model()
    if (model !== (await read($, modelAtom))) await update($, modelAtom, () => model)
    const now = await $.clock.now()
    // 분이 바뀔 때만 써서 띠를 필요 이상 다시 그리지 않는다
    if (Math.floor(now / 60000) !== Math.floor((await read($, nowAtom)) / 60000)) await update($, nowAtom, () => now)
  } catch {
    // 다음 주기에 다시
  }
}

// 1회 허용 소비: 남은 차단이 없을 때만 허용분을 쓴다
async function settle($: EngineInterface, rules: readonly NeonRule[]): Promise<NeonRule[]> {
  const allowed = await read($, allowAtom)
  const blocked = rules.filter(r => !allowed.includes(r))
  if (blocked.length === 0 && rules.length > 0) {
    await update($, allowAtom, list => list.filter(r => !rules.includes(r)))
    $.ui.toast(`🔓 1회 허용 사용: ${rules.join(', ')}`)
  }
  return blocked
}

// ── git 읽기 ──

type GitTop = { top: string; headPath: string }

/** dir 에서 위로 올라가며 `.git`(폴더 또는 worktree 의 `gitdir:` 파일)을 찾는다. */
async function findGitTop($: EngineInterface, dir: string): Promise<GitTop | undefined> {
  let cur: string | undefined = dir
  for (let depth = 0; depth < 40 && cur !== undefined; depth += 1) {
    const dotGit = joinPath(cur, '.git')
    const stat = await $.fs.stat(dotGit).catch(() => undefined)
    if (stat?.kind === 'dir') return { top: cur, headPath: joinPath(dotGit, 'HEAD') }
    if (stat?.kind === 'file') {
      const text = await $.fs.read(dotGit).catch(() => '')
      const m = /^gitdir:\s*(.+)$/m.exec(text)
      if (m !== null) {
        const gitdir = (m[1] as string).trim()
        return { top: cur, headPath: joinPath(isAbsolute(gitdir) ? gitdir : joinPath(cur, gitdir), 'HEAD') }
      }
    }
    cur = parentDir(cur)
  }
  return undefined
}

async function readBranch($: EngineInterface, top: GitTop): Promise<string | undefined> {
  const text = await $.fs.read(top.headPath).catch(() => undefined)
  return text === undefined ? undefined : parseHead(text)
}

/** 명령의 실행 위치(상대/절대/없음) → 그 위치의 현재 브랜치. */
async function branchAt($: EngineInterface, cwd: string, dir: string | undefined): Promise<string | undefined> {
  const where = dir === undefined ? cwd : isAbsolute(dir) ? dir : joinPath(cwd, dir)
  const top = await findGitTop($, where)
  return top === undefined ? undefined : readBranch($, top)
}

async function readDiff($: EngineInterface, top: string): Promise<{ added: number; removed: number } | undefined> {
  const run = await $.process.run(['git', 'diff', '--shortstat', 'HEAD'], { cwd: top, timeoutMs: 10_000 }).catch(() => undefined)
  if (run === undefined || run.exitCode !== 0) return undefined
  return parseShortstat(run.stdout)
}

/** 작업트리의 추적 안 된(무시되지 않은) .env 계열 파일. */
async function untrackedEnv($: EngineInterface, cwd: string): Promise<string[]> {
  const run = await $.process.run(['git', 'ls-files', '--others', '--exclude-standard'], { cwd, timeoutMs: 10_000 }).catch(() => undefined)
  if (run === undefined || run.exitCode !== 0) return []
  return run.stdout
    .split(/\r?\n/)
    .filter(line => /(^|\/)\.env(\.[^/]*)?$/i.test(line) && !/\.env\.(example|sample|template)$/i.test(line))
}

/** 파일이 git 에 올라가는(또는 올라갈) 대상인지. 저장소 밖이거나 .gitignore 에 걸리면 false. */
async function isCommittable($: EngineInterface, top: string, path: string): Promise<boolean> {
  const tracked = await $.process.run(['git', 'ls-files', '--error-unmatch', '--', path], { cwd: top, timeoutMs: 10_000 }).catch(() => undefined)
  if (tracked?.exitCode === 0) return true
  const ignored = await $.process.run(['git', 'check-ignore', '-q', '--', path], { cwd: top, timeoutMs: 10_000 }).catch(() => undefined)
  return ignored?.exitCode !== 0
}

// ── 상태 띠 ──

type BandEvent = Frozen<RenderInput<'AbovePrompt'>>

async function drawBand($: EngineInterface, e: BandEvent, t: Thresholds): Promise<RenderElement | undefined> {
  if (e.props.hasSurvey) return undefined
  const [branch, diff, project, model, usage, now, sizes, window] = await Promise.all([
    read($, branchAtom),
    read($, diffAtom),
    read($, projectAtom),
    read($, modelAtom),
    read($, usageAtom),
    read($, nowAtom),
    read($, ctxSizesAtom),
    read($, ctxWindowAtom),
  ])
  const five = usage?.limits.find(l => l.kind === 'five_hour')
  const seven = usage?.limits.find(l => l.kind === 'seven_day')
  const data: BandInput = {
    model: model === null ? undefined : prettyModel(model),
    branch: branch ?? undefined,
    diff: diff ?? undefined,
    project: project ?? undefined,
    ctxPercent: usage?.ctxPercent,
    costUsd: usage?.costUsd,
    elapsed: usage?.startedAt !== undefined && now > 0 ? formatDuration(now - usage.startedAt) : undefined,
    five: five === undefined ? undefined : { percent: five.percentUsed, reset: formatReset(five.resetsAt, now) },
    seven: seven === undefined ? undefined : { percent: seven.percentUsed, reset: formatReset(seven.resetsAt, now) },
    forecast: forecastLabel(forecastTurns(sizes, window ?? undefined)),
  }
  const plan = planBand(data, e.props.bodyColumns)
  const { Box, Text } = $.ui.resolve(e)

  const sep = () => (
    <Text color={C.sub} dimColor>
      {'  ✧  '}
    </Text>
  )
  const gap = () => <Text>{'   '}</Text>
  const meter = (percent: number, cells: number) => {
    const style = percentStyle(percent, t.warn, t.alert)
    return [
      ...gauge(percent, cells).map(cell => <Text color={cell.color}>{cell.glyph}</Text>),
      <Text color={style.color} bold={style.bold}>
        {` ${Math.round(percent)}%`}
      </Text>,
    ]
  }

  const row1: RenderElement[] = []
  if (data.model !== undefined) row1.push(<Text color={C.text}>{`⚡ ${data.model}`}</Text>)
  if (data.branch !== undefined) {
    if (row1.length > 0) row1.push(sep())
    row1.push(<Text color={C.text}>{`🔮 ${data.branch}`}</Text>)
    if (data.diff !== undefined && (data.diff.added > 0 || data.diff.removed > 0)) {
      row1.push(<Text color={C.add}>{` +${data.diff.added}`}</Text>)
      row1.push(<Text color={C.del}>{` −${data.diff.removed}`}</Text>)
    }
  }
  if (plan.showProject && data.project !== undefined) {
    if (row1.length > 0) row1.push(sep())
    row1.push(<Text color={C.text}>{`🫧 ${data.project}`}</Text>)
  }

  const row2: RenderElement[] = []
  if (data.ctxPercent !== undefined) {
    row2.push(<Text color={C.text}>{'🧠 '}</Text>, ...meter(data.ctxPercent, plan.cells))
    if (data.forecast !== undefined) row2.push(<Text color={C.sub}>{` · ${data.forecast}`}</Text>)
  }
  if (plan.showCost && data.costUsd !== undefined) {
    if (row2.length > 0) row2.push(gap())
    row2.push(<Text color={C.text}>{`💎 $${data.costUsd.toFixed(2)}`}</Text>)
  }
  if (plan.showElapsed && data.elapsed !== undefined) {
    if (row2.length > 0) row2.push(gap())
    row2.push(<Text color={C.text}>{`🌙 ${data.elapsed}`}</Text>)
  }

  const row3: RenderElement[] = []
  if (data.five !== undefined) {
    row3.push(<Text color={C.text}>{'🚀 5h '}</Text>, ...meter(data.five.percent, plan.cells))
    if (data.five.reset !== undefined) row3.push(<Text color={C.sub}>{` ↻ ${data.five.reset}`}</Text>)
  }
  if (data.seven !== undefined) {
    if (row3.length > 0) row3.push(gap())
    row3.push(<Text color={C.text}>{'🪐 7d '}</Text>, ...meter(data.seven.percent, plan.smallCells))
  }

  // 값이 없는 칸·행은 그리지 않는다("loading..." 없음)
  const rows = (
    [
      ['row1', row1],
      ['row2', row2],
      ['row3', row3],
    ] as const
  ).filter(([, r]) => r.length > 0)
  if (rows.length === 0) return undefined
  return (
    <Box flexDirection="column">
      {rows.map(([key, r]) => (
        <Box key={key} flexDirection="row">
          {r}
        </Box>
      ))}
    </Box>
  )
}

// ── 사이드 패널 ──

const PANE_ID = 'neon-panel'
const PANE_TITLE = '네온 패널'

type PaneEvent = Frozen<RenderInput<'Pane'>>

const TITLE = { edits: '#ff6ac1', calls: '#b388ff', usage: '#5ce1e6', memory: '#ffb86c', notes: '#e0c3ff' } as const

async function saveNotes($: EngineInterface): Promise<void> {
  const key = await read($, notesKeyAtom)
  const notes = await read($, notesAtom)
  if (key !== null) await $.store.set(key, notes).catch(() => undefined)
}

async function drawPanel($: EngineInterface, e: PaneEvent): Promise<RenderElement> {
  const [edits, calls, samples, memory, notes, sizes, window] = await Promise.all([
    read($, editsAtom),
    read($, callsAtom),
    read($, samplesAtom),
    read($, memoryAtom),
    read($, notesAtom),
    read($, ctxSizesAtom),
    read($, ctxWindowAtom),
  ])
  const forecast = forecastLabel(forecastTurns(sizes, window ?? undefined))
  const els = $.ui.resolve(e)
  const { Box, Text, Button } = els
  const Input = 'Input' in els ? els.Input : undefined
  const limit = sectionLimits(e.props.scroll.bodyRows || e.viewport?.rows || 40)
  const width = Math.max(10, e.props.bodyColumns)
  const title = (text: string, color: string) => (
    <Text color={color} bold>
      {text}
    </Text>
  )
  const dim = (text: string) => <Text color={C.sub}>{text}</Text>

  const editRows = [...edits].sort((a, b) => b.at - a.at).slice(0, limit.edits)
  const callRows = calls.slice(-limit.calls).reverse()
  const ctxLine = sparkline(samples.slice(-Math.min(30, width - 8)).map(s => s.ctx))
  const fiveLine = sparkline(samples.slice(-Math.min(30, width - 8)).map(s => s.five))
  const lastCtx = [...samples].reverse().find(s => s.ctx !== undefined)?.ctx
  const lastFive = [...samples].reverse().find(s => s.five !== undefined)?.five
  const memRows = memory.slice(-limit.memory).reverse()
  const noteRows = notes.slice(-limit.notes)

  const addNote = (value: string) => {
    const text = value.trim()
    if (text === '') return
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    void update($, notesAtom, list => [...list, { id, text, done: false }]).then(() => saveNotes($))
  }
  const toggleNote = (id: string) =>
    void update($, notesAtom, list => list.map(n => (n.id === id ? { ...n, done: !n.done } : n))).then(() => saveNotes($))
  const deleteNote = (id: string) =>
    void update($, notesAtom, list => list.filter(n => n.id !== id)).then(() => saveNotes($))

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        {title('✏️ 수정한 파일', TITLE.edits)}
        {editRows.length === 0 && dim('아직 없음')}
        {editRows.map(row => (
          <Text color={C.text} wrap="truncate-start">
            {`${row.path}`}
            <Text color={C.sub}>{` ×${row.count}`}</Text>
          </Text>
        ))}
      </Box>
      <Box flexDirection="column">
        {title('🛠 도구 호출', TITLE.calls)}
        {callRows.length === 0 && dim('아직 없음')}
        {callRows.map(call => (
          <Text color={call.failed ? C.fail : C.text} wrap="truncate-end">
            <Text color={C.sub}>{`${hhmm(call.at)} `}</Text>
            {`${call.tool} ${call.summary}`}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column">
        {title('📈 사용량 추이', TITLE.usage)}
        <Text color={C.text}>
          {'ctx '}
          <Text color={TITLE.usage}>{ctxLine === '' ? '—' : ctxLine}</Text>
          {lastCtx === undefined ? '' : ` ${Math.round(lastCtx)}%`}
        </Text>
        <Text color={C.text}>
          {'5h  '}
          <Text color={TITLE.edits}>{fiveLine.trim() === '' ? '—' : fiveLine}</Text>
          {lastFive === undefined ? '' : ` ${Math.round(lastFive)}%`}
        </Text>
        <Text color={C.sub}>{forecast === undefined ? '예보: 아직 추정 불가' : `예보: 가득 찰 때까지 ${forecast.replace('☁️ ', '')}`}</Text>
      </Box>
      <Box flexDirection="column">
        {title('💾 메모리 변경', TITLE.memory)}
        {memRows.length === 0 && dim('아직 없음')}
        {memRows.map(m => (
          <Text color={C.text}>
            <Text color={C.sub}>{`${hhmm(m.at)} `}</Text>
            {`${m.name} ${m.kind}`}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column">
        {title('📝 메모', TITLE.notes)}
        {Input !== undefined && <Input key="memo-input" placeholder="한 줄 메모 + Enter" submitLabel="추가" onSubmit={addNote} />}
        {noteRows.length === 0 && dim('메모 없음')}
        {noteRows.map(n => (
          <Box key={`note-${n.id}`} flexDirection="row" gap={1}>
            <Button key={`done-${n.id}`} label={n.done ? '↺' : '✓'} plain dimColor onPress={() => toggleNote(n.id)} />
            <Button key={`del-${n.id}`} label="✕" plain dimColor onPress={() => deleteNote(n.id)} />
            <Text color={n.done ? C.sub : C.text} strikethrough={n.done} wrap="truncate-end">
              {n.text}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// flow 전환: compact 후 보류했던 프롬프트를 사람 말로 다시 보낸다. 어느 단계가 실패해도 프롬프트는 살린다.
async function compactThenResubmit($: EngineInterface, typed: string) {
  let compacted = false
  try {
    const done = await $.session.compact({ instructions: COMPACT_INSTRUCTIONS })
    compacted = done.skip === undefined
  } catch {
    // compact 가 안 되면 정리 없이 그대로 다시 보낸다
  }
  await update($, promptsAtom, list => (compacted ? [typed.slice(0, 300)] : rememberPrompt(list, typed))).catch(() => undefined)
  if (compacted) $.ui.toast('🧹 새 작업 흐름 — 이전 흐름을 정리했어요')
  try {
    await $.prompt.submit({ text: typed, asUser: true })
  } catch {
    const filled = await $.prompt.fill({ text: typed }).catch(() => undefined)
    $.ui.toast(filled?.isFilled === true ? '⚠️ 프롬프트를 다시 보내지 못해 입력칸에 되돌려 두었어요' : `⚠️ 프롬프트 재전송 실패 — 다시 입력해 주세요: ${typed.slice(0, 80)}`, { timeoutMs: 15000 })
  }
}


// ── 묻는 가드: 미리보기 ──

const run5s = async ($: EngineInterface, argv: string[], cwd: string): Promise<string> => {
  const r = await $.process.run(argv, { cwd, timeoutMs: 5000 })
  if (r.exitCode !== 0) throw new Error(r.stderr)
  return r.stdout
}

/** rm 대상을 상한(항목 2000·폴더 200) 안에서 훑어 파일 수·크기·상위 경로를 센다. */
async function walkTargets($: EngineInterface, targets: readonly string[], at: string): Promise<string | undefined> {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  let files = 0
  let bytes = 0
  let dirs = 0
  let truncated = false
  const top: string[] = []
  for (const raw of targets) {
    const t = raw.replace(/^['"]|['"]$/g, '')
    const path = /^(~|\$HOME|\$\{HOME\}|%USERPROFILE%|\$env:USERPROFILE)$/i.test(t) ? home : t === '*' || t === '.' || t === './' ? at : joinPath(at, t.replace(/^(~|\$HOME)[\\/]/, `${home ?? '~'}/`))
    if (path === undefined) continue
    const stat = await $.fs.stat(path).catch(() => undefined)
    if (stat === undefined) continue
    if (stat.kind !== 'dir') {
      files += 1
      bytes += stat.size
      top.push(baseName(path))
      continue
    }
    const queue = [path]
    while (queue.length > 0) {
      if (dirs >= 200 || files >= 2000) {
        truncated = true
        break
      }
      const dir = queue.shift() as string
      dirs += 1
      const entries = await $.fs.list(dir).catch(() => [])
      for (const entry of entries) {
        const full = joinPath(dir, entry.name)
        if (top.length < 5 && dir === path) top.push(relativeTo(at, full))
        if (entry.kind === 'dir') queue.push(full)
        else {
          files += 1
          bytes += entry.size
        }
      }
    }
  }
  return files === 0 && top.length === 0 ? undefined : previewRm(files, bytes, top, truncated)
}

/** 읽기 전용 명령으로 "무엇이 바뀌는지" 한 줄을 만든다. 실패하면 undefined(미리보기 생략). */
async function collectPreview($: EngineInterface, plan: PreviewPlan, cwd: string): Promise<string | undefined> {
  const at = plan.dir === undefined ? cwd : isAbsolute(plan.dir) ? plan.dir : joinPath(cwd, plan.dir)
  try {
    if (plan.kind === 'reset') {
      const status = await run5s($, ['git', 'status', '--short'], at)
      const stash = await run5s($, ['git', 'stash', 'list'], at).catch(() => '')
      return previewReset(status, stash)
    }
    if (plan.kind === 'clean') return previewClean(await run5s($, ['git', ...cleanDryRunArgs(plan.args)], at))
    if (plan.kind === 'restore') return previewRestore(await run5s($, ['git', 'diff', '--stat'], at))
    if (plan.kind === 'push') {
      if (plan.branch === undefined) return undefined
      const ref = `${plan.remote}/${plan.branch}`
      await run5s($, ['git', 'rev-parse', '--verify', '--quiet', `refs/remotes/${ref}`], at)
      return previewPush(await run5s($, ['git', 'log', '--oneline', `HEAD..${ref}`], at), ref)
    }
    return await walkTargets($, plan.targets, at)
  } catch {
    return undefined
  }
}

// ── 턴 진행 ──

function stopTicker() {
  turnTicker?.cancel()
  turnTicker = undefined
}

/** 턴 중 1초마다 경과·비용을 갱신해 스피너 꼬리를 다시 그린다. */
function startTicker($: EngineInterface) {
  stopTicker()
  turnTicker = $.clock.every(1000, () => {
    void (async () => {
      const now = await $.clock.now()
      const usage = await $.session.usage().catch(() => undefined)
      if (usage?.cost !== undefined) {
        const cost = usage.cost.usd
        await update($, turnLiveAtom, live => (live === null ? null : { ...live, costNow: cost }))
      }
      await update($, tickAtom, () => now)
    })().catch(() => undefined)
  })
}

// ── 리플레이 ──

/** 성공한 편집을 현재 턴 기록에 붙인다(턴당 50개, 최근 10턴). */
async function recordReplay($: EngineInterface, edit: NeonReplayEdit) {
  const turnId = (await read($, turnAtom)) ?? 'none'
  await update($, replayAtom, turns => {
    const last = turns.at(-1)
    if (last !== undefined && last.turnId === turnId) {
      return [...turns.slice(0, -1), { turnId, edits: [...last.edits, edit].slice(0, 50) }]
    }
    return [...turns, { turnId, edits: [edit] }].slice(-10)
  })
}

function replayDiff(tool: string, a: Args, before: string | undefined): string {
  if (tool === 'Write') return makeDiff(before ?? '', text(a.content))
  if (tool === 'Edit') return makeDiff(text(a.old_string), text(a.new_string))
  if (tool === 'NotebookEdit') return makeDiff('', text(a.new_source))
  if (tool === 'MultiEdit' && Array.isArray(a.edits)) {
    return (a.edits as Args[]).map(x => makeDiff(text(x.old_string), text(x.new_string))).join('\n')
  }
  return ''
}

type ReplayEvent = Frozen<RenderInput<'Pane'>>

async function drawReplay($: EngineInterface, e: ReplayEvent): Promise<RenderElement> {
  const [turns, view] = await Promise.all([read($, replayAtom), read($, replayViewAtom)])
  const { Box, Text, Button, Code } = $.ui.resolve(e)
  const edits = turns.at(-view.back)?.edits ?? []
  const index = Math.min(Math.max(0, view.index), Math.max(0, edits.length - 1))
  const edit = edits[index]
  const move = (by: number) => void update($, replayViewAtom, v => ({ ...v, index: Math.min(Math.max(0, v.index + by), Math.max(0, edits.length - 1)) }))
  if (edit === undefined) return <Text color={C.sub}>되돌려 볼 편집이 없어요</Text>
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Button key="prev" label="이전" hotkey="p" onPress={() => move(-1)} />
        <Button key="next" label="다음" hotkey="n" variant="primary" onPress={() => move(1)} />
        <Text color={C.text} bold>
          {replayHeader(index, edits.length, edit.path, edit.tool)}
        </Text>
      </Box>
      <Code source={edit.diff} format="diff" path={edit.path} wrap="truncate-end" />
    </Box>
  )
}

// ── 모델 분배 ──

async function agentTypeOf($: EngineInterface, agentId: string): Promise<string | undefined> {
  const cached = agentTypeCache.get(agentId)
  if (cached !== undefined) return cached
  const agents = await $.agent.list().catch(() => [])
  for (const a of agents) agentTypeCache.set(a.id, a.type)
  const types = [...new Set(agents.map(a => a.type))]
  if (types.length > 0) await update($, agentTypesAtom, list => [...new Set([...list, ...types])].slice(-30)).catch(() => undefined)
  return agentTypeCache.get(agentId)
}

async function saveRoutes($: EngineInterface) {
  await $.store.set(ROUTES_KEY, await read($, routesAtom)).catch(() => undefined)
}

async function drawRoutes($: EngineInterface, e: ReplayEvent): Promise<RenderElement> {
  const [routes, hits, known, draft] = await Promise.all([read($, routesAtom), read($, routeHitsAtom), read($, agentTypesAtom), read($, routeDraftAtom)])
  const els = $.ui.resolve(e)
  const { Box, Text, Button } = els
  const Select = 'Select' in els ? els.Select : undefined
  const Input = 'Input' in els ? els.Input : undefined
  const typeOptions = [...new Set([...KNOWN_AGENT_TYPES, ...known, ...routes.map(r => r.agentType), draft.agentType])].map(v => ({ value: v }))
  const modelOptions = [...new Set([...MODEL_ALIASES, draft.model])].map(v => ({ value: v }))
  const effortOptions = [{ value: 'default', label: '(기본)' }, ...EFFORTS.map(v => ({ value: v }))]
  const setDraft = (patch: Partial<{ agentType: string; model: string; effort: string }>) => void update($, routeDraftAtom, d => ({ ...d, ...patch }))
  const add = () =>
    void (async () => {
      const d = await read($, routeDraftAtom)
      const route = draftToRoute(d.agentType, d.model, d.effort)
      if (route === undefined) return
      await update($, routesAtom, list => [...list.filter(r => r.agentType.toLowerCase() !== route.agentType.toLowerCase()), route])
      await saveRoutes($)
    })()
  const remove = (i: number) =>
    void update($, routesAtom, list => list.filter((_, k) => k !== i)).then(() => saveRoutes($))

  return (
    <Box flexDirection="column" gap={1}>
      <Text color="#b388ff" bold>
        🔀 서브에이전트 모델 분배
      </Text>
      <Box flexDirection="column">
        {routes.length === 0 && <Text color={C.sub}>규칙 없음 — 모든 요청이 원래 모델로 갑니다</Text>}
        {routes.map((r, i) => (
          <Box key={`route-${i}`} flexDirection="row" gap={1}>
            <Button key={`route-del-${i}`} label="삭제" plain dimColor onPress={() => remove(i)} />
            <Text color={C.text}>{`${r.agentType} → ${r.model}${r.effort !== undefined ? ` (${r.effort})` : ''}`}</Text>
          </Box>
        ))}
      </Box>
      {Select !== undefined && (
        <Box flexDirection="column">
          <Select key="route-type" label="에이전트 " options={typeOptions} value={draft.agentType} onSelect={v => setDraft({ agentType: v })} />
          {Input !== undefined && <Input key="route-type-custom" placeholder="에이전트 type 직접 입력" onSubmit={v => setDraft({ agentType: v.trim() })} />}
          <Select key="route-model" label="모델 " options={modelOptions} value={draft.model} onSelect={v => setDraft({ model: v })} />
          {Input !== undefined && <Input key="route-model-custom" placeholder="모델 별칭/ID 직접 입력" onSubmit={v => setDraft({ model: v.trim() })} />}
          <Select key="route-effort" label="effort " options={effortOptions} value={draft.effort} onSelect={v => setDraft({ effort: v })} />
          <Button key="route-add" label="규칙 추가" variant="primary" onPress={add} />
        </Box>
      )}
      <Text color={C.sub}>{`이번 세션에서 바뀐 요청: ${hits}`}</Text>
    </Box>
  )
}

export const register: Register = (on, options) => {
  const protectedBranches = splitList(str(options, 'protectedBranches', 'main,master,stage'))
  const ipExempt = splitList(str(options, 'ipExemptPaths', 'docs/,.claude/,.env,.env.local'))
  const commentMax = num(options, 'commentMaxLines', 3)
  const autoCompact = bool(options, 'autoCompact', true)
  const compactMin = num(options, 'compactMinPercent', 30)
  const thresholds = { warn: num(options, 'warnPercent', 80), alert: num(options, 'alertPercent', 95) }
  const autoOpenPanel = bool(options, 'autoOpenPanel', true)
  const neonToolRows = bool(options, 'neonToolRows', true)

  // ── 세션 시작: 명령 등록, 초기값, 타이머, 패널 자동 열기 ──
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'side-panel', description: '네온 사이드 패널 열기/닫기', immediate: true }).catch(() => undefined)
    await $.command.register({ name: 'guard-allow', description: '차단 규칙 하나를 다음 1회만 허용', argumentHint: '<env|no-verify|protected-branch|private-ip>', immediate: true }).catch(() => undefined)
    await $.command.register({ name: 'replay', description: '직전 턴의 파일 편집을 한 단계씩 다시 보기', argumentHint: '[몇 턴 전]', immediate: true }).catch(() => undefined)
    await $.command.register({ name: 'model-route', description: '서브에이전트 type 별 모델 분배 규칙', immediate: true }).catch(() => undefined)

    for (const t of timers) t.cancel()
    timers = [
      $.clock.every(2000, () => void refreshBranch($)),
      $.clock.every(5000, () => {
        void refreshDiff($)
        void refreshMeta($)
      }),
    ]

    void (async () => {
      await Promise.all([refreshBranch($), refreshDiff($), refreshMeta($)])
      const usage = await $.session.usage().catch(() => undefined)
      if (usage !== undefined) {
        await update($, usageAtom, prev => ({
          ctxPercent: usage.context.percent ?? prev?.ctxPercent,
          costUsd: usage.cost?.usd ?? prev?.costUsd,
          startedAt: usage.startedAt,
          limits: usage.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
        }))
      }
      const root = (await $.session.repo().catch(() => null))?.root ?? (await $.session.root().catch(() => e.cwd))
      const key = `notes:${root.replace(/\\/g, '/').toLowerCase()}`
      const stored = await $.store.get(key).catch(() => undefined)
      await update($, notesKeyAtom, () => key)
      if (Array.isArray(stored)) await update($, notesAtom, () => stored as never)
      const routes = sanitizeRoutes(await $.store.get(ROUTES_KEY).catch(() => undefined))
      await update($, routesAtom, () => routes)
    })().catch(() => undefined)

    if (autoOpenPanel && e.isInteractive) {
      // 묻지 않고 여는 패널은 엔진이 144칸 이상에서만 자리를 준다(좁으면 대기)
      void $.ui.open({ id: PANE_ID, title: PANE_TITLE }).catch(() => undefined)
    }
    return next(e)
  })

  // ── 측정: 띠 값, 추이 샘플, 사용량 알림 ──
  on('session.measure', async ($, e, next) => {
    try {
      const limits = e.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt }))
      await update($, usageAtom, prev => ({
        ctxPercent: e.context.percent ?? prev?.ctxPercent,
        costUsd: e.cost?.usd ?? prev?.costUsd,
        startedAt: prev?.startedAt,
        limits: limits.length > 0 ? limits : prev?.limits ?? [],
      }))
      const five = limits.find(l => l.kind === 'five_hour')?.percentUsed
      await update($, samplesAtom, list => [...list, { ctx: e.context.percent, five }].slice(-30))
      if (e.context.window !== (await read($, ctxWindowAtom))) await update($, ctxWindowAtom, () => e.context.window)
      const now = await $.clock.now()
      const memo = await read($, alertsAtom)
      const { memo: nextMemo, toasts } = nextAlerts(memo, { ctxPercent: e.context.percent, limits }, now, thresholds)
      await update($, alertsAtom, () => nextMemo)
      for (const t of toasts) $.ui.toast(t, { timeoutMs: 6000 })
    } catch {
      // 측정 표시는 실패해도 세션에 영향 없음
    }
    return next(e)
  })

  // turn.start 는 메인 대화에서만 온다
  on('turn.start', async ($, e, next) => {
    try {
      await update($, turnAtom, () => e.turnId)
      const now = await $.clock.now()
      const cost = (await $.session.usage().catch(() => undefined))?.cost?.usd
      await update($, turnLiveAtom, () => ({ turnId: e.turnId, startedAt: now, tools: 0, costStart: cost, costNow: cost }))
      await update($, tickAtom, () => now)
      await update($, replayAtom, turns => [...turns, { turnId: e.turnId, edits: [] }].slice(-10))
      routeLogged.clear()
      startTicker($)
    } catch {
      // 표시용 기록 실패는 무시
    }
    return next(e)
  })

  // 메인 대화 요청마다 컨텍스트 크기를 재고, 서브에이전트 요청은 규칙대로 모델을 바꾼다
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const result = yield* next(e)
      const u = result.usage
      if (u !== null) lastCtxSize = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens
      return result
    }
    const routes = await read($, routesAtom)
    if (routes.length === 0) return yield* next(e)
    const type = await agentTypeOf($, e.agentId).catch(() => undefined)
    const rule = routeFor(routes, type)
    if (rule === undefined || type === undefined) return yield* next(e)
    await update($, routeHitsAtom, n => n + 1)
    const mark = `${e.turnId}:${e.agentId}`
    if (!routeLogged.has(mark)) {
      routeLogged.add(mark)
      $.ui.log(routeLogLine(type, rule))
    }
    return yield* next(rule.effort === undefined ? { ...e, model: rule.model } : { ...e, model: rule.model, effort: rule.effort })
  })

  on('turn.complete', async ($, e, next) => {
    void refreshMeta($)
    if (e.agentId !== undefined) return next(e)
    stopTicker()
    const live = await read($, turnLiveAtom).catch(() => null)
    await update($, turnLiveAtom, () => null).catch(() => undefined)
    if (lastCtxSize !== undefined) {
      const size = lastCtxSize
      await update($, ctxSizesAtom, list => [...list, size].slice(-20)).catch(() => undefined)
    }
    const done = await next(e)
    if (e.isAborted) return done
    // 답 아래에 한 줄: 다른 텍스트를 돌려주면 엔진이 답 밑에 보여 준다
    return { ...done, text: turnSummary(e.durationMs, live?.tools ?? 0, e.usage) }
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await Promise.all([
        update($, promptsAtom, () => []),
        update($, commentWarnedAtom, () => []),
        update($, editsAtom, () => []),
        update($, callsAtom, () => []),
        update($, memoryAtom, () => []),
        update($, samplesAtom, () => []),
        update($, ctxSizesAtom, () => []),
        update($, replayAtom, () => []),
        update($, turnLiveAtom, () => null),
      ]).catch(() => undefined)
      lastCtxSize = undefined
      stopTicker()
    }
    return next(e)
  })

  // ── flow 단위 자동 compact ──
  on('prompt.submit', async ($, e, next) => {
    if (!autoCompact) return next(e)
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') return next(e)
    const typed = e.text
    if (typed.trim().startsWith('/')) return next(e)
    const history = await read($, promptsAtom)
    // 실행 중인 턴에 끼어든 프롬프트는 그 턴의 연속이고, 그 사이 compact 는 거부된다
    if (e.turnId === undefined) {
      const usage = await $.session.usage().catch(() => undefined)
      const gate = flowGate(typed, history, usage?.context.percent, compactMin)
      if (gate.decision === 'classify') {
        const label = await $.model.classify(classifyInput(history, typed), FLOW_LABELS).catch(() => undefined)
        // prompt.submit 안에서는 compact 가 거부되므로: 지금은 보류(drop)하고 턴 밖에서 compact → 재전송
        if (label === 'new' && (e.attachments ?? []).length === 0) {
          $.clock.after(0, () => void compactThenResubmit($, typed))
          return { drop: '🧹 새 작업 흐름 — 이전 흐름을 정리(compact)한 뒤 이 프롬프트를 그대로 다시 보냅니다' }
        }
      }
    }
    await update($, promptsAtom, list => rememberPrompt(list, typed))
    return next(e)
  }).catch(($, e, next) => next(e))

  // ── 관찰: 도구 호출 기록, 수정 파일, 메모리 변경, 주석 과잉 경고 ──
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    // 가드의 $.ui.ask 도 이 길로 오므로 묻기 대화상자는 기록하지 않는다
    if (tool === 'AskUserQuestion') return next(e)
    const a = argsOf(e)
    const file = filePathOf(a)
    let memoryExisted: boolean | undefined
    let before: string | undefined
    try {
      await update($, turnLiveAtom, live => (live === null ? null : { ...live, tools: live.tools + 1 }))
      if (tool === 'Write' && file !== '') before = await $.fs.read(file).catch(() => undefined)
      if (COMMENT_TOOLS.has(tool) && file !== '') {
        const longest = Math.max(0, ...newContents(tool, a).map(c => longestCommentBlock(c.text, file, c.whole)))
        if (longest > commentMax) {
          const turn = (await read($, turnAtom)) ?? 'none'
          const mark = `${turn}:${file}`
          if (!(await read($, commentWarnedAtom)).includes(mark)) {
            await update($, commentWarnedAtom, list => [...list, mark].slice(-200))
            $.ui.toast(`💬 주석 ${longest}줄 — 주석은 '무엇을'과 '왜'만 1~2줄로 (comments 규칙)`)
          }
        }
      }
      if (COMMENT_TOOLS.has(tool) && isMemoryPath(file)) memoryExisted = await $.fs.exists(file)
    } catch {
      // 경고는 실패해도 도구 실행을 막지 않는다
    }

    const ran = await next(e)

    try {
      const failed = ran.deny !== undefined || ran.isError === true
      const at = await $.clock.now()
      await update($, callsAtom, list => [...list, { at, tool, summary: summarize(tool, a), failed }].slice(-60))
      if (!failed && FILE_TOOLS.has(tool) && file !== '') {
        const top = await findGitTop($, parentDir(file) ?? (await $.session.cwd()))
        const rel = relativeTo(top?.top, file)
        await update($, editsAtom, list => {
          const found = list.find(x => x.path === rel)
          const rest = list.filter(x => x.path !== rel)
          return [...rest, { path: rel, count: (found?.count ?? 0) + 1, at }].slice(-100)
        })
      }
      if (!failed && FILE_TOOLS.has(tool) && file !== '') {
        const top = await findGitTop($, parentDir(file) ?? (await $.session.cwd()))
        await recordReplay($, { path: relativeTo(top?.top, file), tool, diff: replayDiff(tool, a, before) })
      }
      if (!failed && memoryExisted !== undefined) {
        const kind: '생성' | '수정' = memoryExisted ? '수정' : '생성'
        await update($, memoryAtom, list => [...list, { name: baseName(file), kind, at }].slice(-30))
        $.ui.toast(`💾 메모리 · ${baseName(file)} ${kind}`)
      }
      if (DIFF_TRIGGERS.has(tool)) void refreshDiff($)
    } catch {
      // 기록 실패는 무시
    }
    return ran
  }).catch(($, e, next) => next(e))

  // ── 가드: 셸 명령 ──
  on('tool.call', { tool: /^(Bash|PowerShell)$/ }, async ($, e, next) => {
    const tool = String(e.tool)
    if (!SHELL_TOOLS.has(tool)) return next(e)
    const command = text(argsOf(e).command)
    const cwd = await $.session.cwd()
    const invs = parseCommand(command)
    const branches = new Map<string, string | undefined>()
    for (const dir of branchDirs(invs)) branches.set(dir ?? '', await branchAt($, cwd, dir))
    const top = await findGitTop($, cwd)
    const untracked = needsUntrackedEnv(invs) ? await untrackedEnv($, top?.top ?? cwd) : []
    const findings = scanCommand(command, {
      protectedBranches,
      branchOf: dir => branches.get(dir ?? ''),
      untrackedEnv: untracked,
      repoRoot: top?.top,
    })
    const denies = findings.flatMap(f => (f.kind === 'deny' ? [f] : []))
    const blocked = await settle($, denies.map(d => d.rule))
    if (blocked.length > 0) {
      const reasons = denies.filter(d => blocked.includes(d.rule)).map(d => d.reason)
      return { deny: `${DENY_PREFIX} ${reasons.join(' / ')}` }
    }
    const asks = findings.flatMap(f => (f.kind === 'ask' ? [f] : []))
    if (asks.length > 0) {
      const lines: string[] = []
      for (const f of asks) {
        const preview = f.preview === undefined ? undefined : await collectPreview($, f.preview, cwd)
        lines.push(preview ?? f.reason)
      }
      // 사람의 답을 기다리는 동안은 $.ui.ask 안에 머문다; 닫기·다른 입력·-p 는 거절로 본다
      const answer = await $.ui.ask(askQuestion(command, lines), { options: ['실행', '거부'], header: '네온 가드' }).catch(() => undefined)
      if (answer !== '실행') return { deny: ASK_REJECTED }
    }
    for (const f of findings) if (f.kind === 'warn') $.ui.toast(f.reason)
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${DENY_PREFIX} 검사 중 오류가 나 안전하게 막았습니다. 다시 시도하거나 사용자에게 확인하세요.` }))

  // ── 가드: 파일 내용의 사설 IP ──
  on('tool.call', { tool: /^(Edit|Write|MultiEdit|NotebookEdit)$/ }, async ($, e, next) => {
    const tool = String(e.tool)
    if (!FILE_TOOLS.has(tool)) return next(e)
    const a = argsOf(e)
    const file = filePathOf(a)
    const ips = newContents(tool, a).flatMap(c => privateIps(c.text).filter(ip => !c.old.includes(ip)))
    if (file === '' || ips.length === 0) return next(e)
    const cwd = await $.session.cwd()
    const abs = isAbsolute(file) ? file : joinPath(cwd, file)
    const top = await findGitTop($, parentDir(abs) ?? cwd)
    if (top === undefined) return next(e)
    const rel = relativeTo(top.top, abs)
    if (isIpExempt(rel, ipExempt)) return next(e)
    if (!(await isCommittable($, top.top, rel))) return next(e)
    const blocked = await settle($, ['private-ip'])
    if (blocked.length > 0) {
      return {
        deny: `${DENY_PREFIX} ${rel} 에 사설 IP(${[...new Set(ips)].join(', ')})가 들어가 git 에 올라갑니다 — 환경변수·설정 파일(.env.local 등 ignore 대상)로 빼세요. 정말 필요하면 사용자에게 \`/guard-allow private-ip\` 실행을 요청하세요(다음 1회만 허용).`,
      }
    }
    return next(e)
  }).catch(($, e, next) => (next.called ? next(e) : { deny: `${DENY_PREFIX} 사설 IP 검사 중 오류가 나 안전하게 막았습니다. 다시 시도하세요.` }))

  // ── 명령 ──
  on('command.run', { command: 'guard-allow' }, async ($, e) => {
    // 모델은 슬래시 명령을 칠 수 없다: 사람이 입력한 경우만 승인으로 본다
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') return { text: '⛔ /guard-allow 는 사람이 직접 입력할 때만 동작합니다.' }
    const rule = RULES.find(r => r === e.args.trim())
    if (rule === undefined) return { text: `사용법: /guard-allow <${RULES.join('|')}>` }
    await update($, allowAtom, list => (list.includes(rule) ? list : [...list, rule]))
    $.ui.toast(`🔓 가드 '${rule}' — 다음 1회 허용`)
    return { text: `🔓 '${rule}' 규칙을 다음 1회만 통과시킵니다.` }
  })

  on('command.run', { command: 'side-panel' }, async $ => {
    const panes = await $.ui.panes()
    if (panes.some(p => p.id === PANE_ID)) {
      await $.ui.close({ id: PANE_ID })
      return { text: '네온 패널을 닫았습니다.' }
    }
    const opened = await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
    return { text: opened.isPlaced ? '네온 패널을 열었습니다.' : `네온 패널이 대기 중입니다: ${opened.reason}` }
  })

  on('command.run', { command: 'replay' }, async ($, e) => {
    const back = Math.max(1, Number.parseInt(e.args.trim() || '1', 10) || 1)
    const turns = await read($, replayAtom)
    const edits = turns.at(-back)?.edits ?? []
    if (edits.length === 0) {
      $.ui.toast(back === 1 ? '🎞 직전 턴에 파일 편집이 없어요' : `🎞 ${back}턴 전에 파일 편집이 없어요`)
      return { text: '되돌려 볼 편집이 없습니다.' }
    }
    await update($, replayViewAtom, () => ({ back, index: 0 }))
    await $.ui.open({ id: REPLAY_PANE, title: '리플레이', focus: true, closeOnEscape: true })
    return { text: `🎞 리플레이: 편집 ${edits.length}개 (n 다음 · p 이전 · Esc 닫기)` }
  })

  on('command.run', { command: 'model-route' }, async $ => {
    const agents = await $.agent.list().catch(() => [])
    const types = [...new Set(agents.map(a => a.type))]
    if (types.length > 0) await update($, agentTypesAtom, list => [...new Set([...list, ...types])].slice(-30))
    await $.ui.open({ id: ROUTES_PANE, title: '모델 분배', focus: true, closeOnEscape: true })
    const routes = await read($, routesAtom)
    return { text: `🔀 모델 분배 규칙 ${routes.length}개` }
  })

  // ── 그리기 ──
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => (await drawBand($, e, thresholds)) ?? next(e))

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, ($, e) => drawPanel($, e))

  on('ui.render', { component: 'Pane', requestId: REPLAY_PANE }, ($, e) => drawReplay($, e))

  on('ui.render', { component: 'Pane', requestId: ROUTES_PANE }, ($, e) => drawRoutes($, e))

  // 스피너: 엔진 것을 두고 꼬리만 붙인다
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const [live, tick] = await Promise.all([read($, turnLiveAtom), read($, tickAtom)])
    if (live === null) return next(e)
    const cost = live.costStart !== undefined && live.costNow !== undefined ? live.costNow - live.costStart : undefined
    const suffix = spinnerSuffix(live.tools, Math.max(0, tick - live.startedAt), cost) + e.props.suffix
    return next({ ...e, props: { ...e.props, suffix } })
  })

  // 도구 행: 엔진 행을 감싸 아이콘·색만 더한다
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const style = neonToolRows ? toolStyle(e.props.tool) : undefined
    if (style === undefined) return next(e)
    const drawn = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Text color={e.props.isErrored ? C.fail : style.color}>{`${style.icon} `}</Text>
        <Box flexDirection="column" flexGrow={1}>
          {drawn}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const first = e.props.calls[0]
    if (!neonToolRows || e.props.isExpanded || first === undefined) return next(e)
    const style = toolStyle(first.tool) ?? { icon: '🔍', color: '#b388ff' }
    const failed = e.props.calls.some(c => c.isErrored)
    const drawn = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Text color={failed ? C.fail : style.color}>{`${style.icon} `}</Text>
        <Box flexDirection="column" flexGrow={1}>
          {drawn}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) =>
    e.props.isDraft || e.props.isWorking ? next(e) : next({ ...e, props: { ...e.props, tail: PROMPT_HINT_TAIL } }),
  )
}
