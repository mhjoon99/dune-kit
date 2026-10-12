import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BAND_PROPS, COMPOSER, NOW, PRESENTATION, installWorld } from './world'
import type { World } from './world'

const MIN = 60000
const iso = (ms: number) => new Date(ms).toISOString()

/** 세션 시작 + 측정까지 흘려 상태 띠 값이 채워진 상태로 만든다. */
async function boot($: Engine, on: On, w: World & { ask?: '실행' | '거부' | 'reject' } = {}) {
  const world = installWorld(on, w)
  const asked: string[] = []
  on('session.start', ($$, e) => ({ cwd: e.cwd }))
  on('session.measure', ($$, e) => ({ changed: e.changed }))
  on('tool.call', ($$, e) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'ran' }
    const q = e.questions[0]
    asked.push(q?.question ?? '')
    if (w.ask === undefined || w.ask === 'reject') return { deny: 'dismissed' }
    return { result: { questions: e.questions, answers: { [q?.question ?? '']: w.ask } } }
  })
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: false })
  await world.clock.settle()
  return { ...world, asked }
}

const texts = async (ui: { findAll: (q: { type?: string }) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text)

describe('상태 띠', () => {
  test('터미널·데스크톱에서 3행: 모델/브랜치/폴더, 컨텍스트/비용/경과, 5h/7d', async ($, on) => {
    await boot($, on, { usage: { startedAt: NOW - 42 * MIN } })
    await $.session.measure({
      context: { window: 200000, percent: 62 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 81, resetsAt: iso(NOW + 83 * MIN + 20_000) },
        { kind: 'seven_day', percentUsed: 24, resetsAt: iso(NOW + 4000 * MIN) },
        { kind: 'seven_day_fable', percentUsed: 40, resetsAt: iso(NOW + (2 * 24 * 60 + 320) * MIN) },
      ],
      cost: { usd: 1.84 },
      changed: ['context', 'rateLimits', 'cost'],
    })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'neon-bubble', surface, component: 'AbovePrompt', props: BAND_PROPS })
      expect(await ui.find({ key: 'row1' })).toBeDefined()
      expect(await ui.find({ key: 'row2' })).toBeDefined()
      expect(await ui.find({ key: 'row3' })).toBeDefined()
      expect(await ui.find({ key: 'row4' })).toBeUndefined()
      const all = (await texts(ui)).join('')
      for (const part of ['⚡️ Opus 5.5', '🔮 feat/statusline', ' +12', ' −3', '🫧 repo', '🧠 ', ' 62%', '💎 $1.84', '🌙 42m', '🚀 5h ', ' 81%', ' ↻ 1h23m', '🪐 7d ', ' 24%', ' ↻ 2d18h', '🪶 Fable ', ' 40%', ' ↻ 2d05h']) {
        expect(all, `${surface}: ${part}`).toContain(part)
      }
      expect(all).not.toContain('loading')
      const cells = (await texts(ui)).filter(t => t === '●' || t === '○')
      expect(cells).toHaveLength(12 + 12 + 6 + 6)
      const pct81 = await ui.find({ type: 'Text', text: ' 81%' })
      expect(pct81?.props.color).toBe('#ffb86c')
      await ui.unmount()
    }
  })

  test('리셋은 resetsAt 기준: 막 시작한 세션도 2h00m', async ($, on) => {
    await boot($, on, { usage: { startedAt: NOW - MIN } })
    await $.session.measure({
      context: { window: 200000, percent: 10 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 30, resetsAt: iso(NOW + 120 * MIN) }],
      changed: ['rateLimits'],
    })
    const ui = await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
    const all = (await texts(ui)).join('')
    expect(all).toContain('↻ 2h00m')
    expect(all).not.toContain('5h59m')
  })

  test('구독이 아니면 3행 생략, 설문 중이면 엔진 것을 그대로', async ($, on) => {
    await boot($, on)
    await $.session.measure({ context: { window: 200000, percent: 5 }, rateLimits: [], changed: ['context'] })
    const ui = await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
    expect(await ui.find({ key: 'row3' })).toBeUndefined()
    expect(await ui.find({ key: 'row2' })).toBeDefined()
  })

  test('좁은 폭에서는 게이지가 줄어든다(최소 6칸)', async ($, on) => {
    await boot($, on)
    await $.session.measure({
      context: { window: 200000, percent: 62 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 50, resetsAt: iso(NOW + 30 * MIN) }],
      changed: ['context'],
    })
    const ui = await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND_PROPS, bodyColumns: 34 } })
    const cells = (await texts(ui)).filter(t => t === '●' || t === '○')
    expect(cells.length).toBeLessThan(24)
    expect(cells.length).toBeGreaterThanOrEqual(12)
  })
})

describe('가드(엔진 경유)', () => {
  test('/guard-allow 는 무조건 차단 규칙을 다음 1회만 통과시킨다', async ($, on) => {
    const { toasts } = await boot($, on)
    const add = { tool: 'Bash', command: 'git add .env' } as const
    const first = await $.tool.call(add)
    expect(first.deny).toContain('/guard-allow env')
    const allowed = await $.command.run({ command: 'guard-allow', args: 'env', origin: COMPOSER, presentation: PRESENTATION })
    expect(allowed.text).toContain('env')
    const second = await $.tool.call(add)
    expect(second.deny).toBeUndefined()
    expect(second.result).toBe('ran')
    expect(toasts.join('\n')).toContain('1회 허용 사용')
    expect((await $.tool.call(add)).deny).toContain('env')
  })

  test('묻기 규칙은 /guard-allow 대상이 아니다', async ($, on) => {
    await boot($, on)
    const r = await $.command.run({ command: 'guard-allow', args: 'force-push', origin: COMPOSER, presentation: PRESENTATION })
    expect(r.text).toContain('사용법')
  })

  test('/guard-allow 는 플러그인이 대신 실행할 수 없다', async ($, on) => {
    await boot($, on)
    const r = await $.command.run({ command: 'guard-allow', args: 'env', origin: { kind: 'plugin', name: 'other' }, presentation: PRESENTATION })
    expect(r.text).toContain('사람')
    expect((await $.tool.call({ tool: 'Bash', command: 'git add .env' })).deny).toContain('env')
  })

  test('보호 브랜치: git -C sub commit 도 막고, 작업 브랜치는 통과', async ($, on) => {
    await boot($, on, { branch: 'main' })
    expect((await $.tool.call({ tool: 'Bash', command: 'git -C sub commit -m wip' })).deny).toContain('main')
    expect((await $.tool.call({ tool: 'Bash', command: 'sudo FOO=1 git commit --no-verify' })).deny).toContain('no-verify')
    expect((await $.tool.call({ tool: 'Bash', command: 'git status' })).result).toBe('ran')
  })

  test('사설 IP: 추적 대상 파일은 막고 docs/ 는 통과', async ($, on) => {
    await boot($, on, { tracked: ['src/config.ts'] })
    const bad = await $.tool.call({ tool: 'Write', file_path: '/repo/src/config.ts', content: 'export const HOST = "192.168.0.10"\n' })
    expect(bad.deny).toContain('192.168.0.10')
    const docs = await $.tool.call({ tool: 'Write', file_path: '/repo/docs/net.md', content: '내부망 10.0.0.5' })
    expect(docs.result).toBe('ran')
    const local = await $.tool.call({ tool: 'Write', file_path: '/repo/src/a.ts', content: 'const h = "127.0.0.1"; const d = "203.0.113.9"' })
    expect(local.result).toBe('ran')
  })

  test('주석 과잉은 경고만, 같은 파일·같은 턴에 한 번', async ($, on) => {
    const { toasts } = await boot($, on)
    const content = ['const a = 1', '// 1', '// 2', '// 3', '// 4', '// 5', 'const b = 2'].join('\n')
    const r = await $.tool.call({ tool: 'Write', file_path: '/repo/src/x.ts', content })
    expect(r.result).toBe('ran')
    await $.tool.call({ tool: 'Write', file_path: '/repo/src/x.ts', content })
    expect(toasts.filter(t => t.startsWith('💬 주석 5줄'))).toHaveLength(1)
  })

  test('메모리 파일을 쓰면 토스트', async ($, on) => {
    const { toasts } = await boot($, on)
    await $.tool.call({ tool: 'Write', file_path: 'C:\\Users\\u\\.claude\\projects\\p\\memory\\notes.md', content: '기억' })
    expect(toasts).toContain('💾 메모리 · notes.md 생성')
  })
})

describe('묻는 가드', () => {
  const STATUS = ' M src/a.py\n M src/b.py\n?? new.txt\n'
  test('실행을 고르면 미리보기와 함께 묻고 통과', async ($, on) => {
    const { asked } = await boot($, on, { ask: '실행', status: STATUS })
    const r = await $.tool.call({ tool: 'Bash', command: 'git reset --hard' })
    expect(r.result).toBe('ran')
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('⚠️ 되돌릴 수 없는 명령이에요 — git reset --hard')
    expect(asked[0]).toContain('날아갈 변경: 2개 파일 (src/a.py, src/b.py)')
  })
  test('거부를 고르면 deny', async ($, on) => {
    await boot($, on, { ask: '거부' })
    const r = await $.tool.call({ tool: 'Bash', command: 'git push --force origin feat/statusline' })
    expect(r.deny).toBe('사용자가 이 명령을 거절했어요. 다른 방법을 쓰기 전에 먼저 물어보세요.')
  })
  test('닫기·-p 처럼 ask 가 reject 되면 deny', async ($, on) => {
    await boot($, on, { ask: 'reject' })
    const r = await $.tool.call({ tool: 'Bash', command: 'rm -rf .' })
    expect(r.deny).toContain('거절')
  })
  test('무조건 차단 4종은 묻지 않고 deny', async ($, on) => {
    const { asked } = await boot($, on, { ask: '실행', branch: 'main', tracked: ['src/c.ts'] })
    expect((await $.tool.call({ tool: 'Bash', command: 'git add .env.local' })).deny).toContain('env')
    expect((await $.tool.call({ tool: 'Bash', command: 'git commit --no-verify -m x' })).deny).toContain('no-verify')
    expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })).deny).toContain('main')
    expect((await $.tool.call({ tool: 'Write', file_path: '/repo/src/c.ts', content: 'h = "10.1.2.3"' })).deny).toContain('10.1.2.3')
    expect(asked).toHaveLength(0)
  })
})

describe('flow 자동 compact', () => {
  async function flowWorld($: Engine, on: On, label: string, compactFails = false) {
    const seen = { classify: 0, compact: 0, entered: [] as { text: string; origin: string }[] }
    on('model.classify', () => {
      seen.classify += 1
      return { value: label }
    })
    on('session.compact', ($$, e) => {
      seen.compact += 1
      if (compactFails) return { skip: 'busy' }
      expect(e.instructions).toContain('작업 흐름')
      return { messages: [{ role: 'user' as const, text: '요약', toolUses: [] }] }
    })
    on('prompt.submit', ($$, e) => {
      seen.entered.push({ text: e.text, origin: e.origin.kind })
      return { text: e.text }
    })
    const world = await boot($, on, { usage: { ctx: 55 } })
    return { ...world, seen }
  }
  const submit = ($: Engine, text: string) => $.prompt.submit({ text, origin: COMPOSER, wait: false })

  test('첫 프롬프트·짧은 맞장구는 분류 없이 통과', async ($, on) => {
    const { seen } = await flowWorld($, on, 'new')
    expect((await submit($, '로그인 API 에 refresh token 발급을 추가해줘')).text).toContain('refresh')
    expect((await submit($, '응 진행해')).text).toBe('응 진행해')
    expect((await submit($, 'ㅇㅇ')).text).toBe('ㅇㅇ')
    expect(seen.classify).toBe(0)
    expect(seen.compact).toBe(0)
  })

  test('새 작업이면 보류 → compact → 같은 텍스트 재전송', async ($, on) => {
    const { seen, toasts, clock } = await flowWorld($, on, 'new')
    await submit($, '로그인 API 에 refresh token 발급을 추가해줘')
    const text = '이번엔 결제 모듈의 환불 처리 로직을 새로 설계해서 구현해줘'
    const r = await submit($, text)
    expect(r.drop).toContain('새 작업 흐름')
    expect(seen.classify).toBe(1)
    await clock.settle()
    expect(seen.compact).toBe(1)
    expect(toasts).toContain('🧹 새 작업 흐름 — 이전 흐름을 정리했어요')
    expect(seen.entered.at(-1)).toEqual({ text, origin: 'plugin' })
  })

  test('compact 가 실패해도 프롬프트는 다시 보낸다', async ($, on) => {
    const { seen, clock, toasts } = await flowWorld($, on, 'new', true)
    await submit($, '로그인 API 에 refresh token 발급을 추가해줘')
    const text = '이번엔 결제 모듈의 환불 처리 로직을 새로 설계해서 구현해줘'
    await submit($, text)
    await clock.settle()
    expect(seen.compact).toBe(1)
    expect(toasts).not.toContain('🧹 새 작업 흐름 — 이전 흐름을 정리했어요')
    expect(seen.entered.at(-1)?.text).toBe(text)
  })

  test('이어지는 작업이면 compact 하지 않는다', async ($, on) => {
    const { seen } = await flowWorld($, on, 'continue')
    await submit($, '로그인 API 에 refresh token 발급을 추가해줘')
    await submit($, '방금 만든 refresh token 로직에 만료 테스트도 추가해줘')
    expect(seen.classify).toBe(1)
    expect(seen.compact).toBe(0)
  })

  test('autoCompact 를 끄면 분류도 하지 않는다', { options: { autoCompact: false } }, async ($, on) => {
    const { seen } = await flowWorld($, on, 'new')
    await submit($, '로그인 API 에 refresh token 발급을 추가해줘')
    await submit($, '이번엔 결제 모듈의 환불 처리 로직을 새로 설계해서 구현해줘')
    expect(seen.classify).toBe(0)
  })
})

describe('사이드 패널', () => {
  const PANE = { title: '네온 패널', isFocused: false, bodyColumns: 60, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 60 }, view: {} }

  test('터미널: 메모 추가·완료·삭제, 도구 호출 기록', async ($, on) => {
    await boot($, on)
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' })
    const ui = await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'Pane', requestId: 'neon-panel', props: PANE })
    const before = (await texts(ui)).join('\n')
    expect(before).toContain('✏️ 수정한 파일')
    expect(before).toContain('src/a.ts')
    expect((await ui.find({ type: 'Link' }))?.props.href).toBe('file:///repo/src/a.ts')
    expect(before).toContain('Bash npm test')
    await ui.input({ key: 'memo-input', text: '리뷰 코멘트 반영' })
    expect(await ui.find({ type: 'Text', text: '리뷰 코멘트 반영' })).toBeDefined()
    const done = (await ui.findAll({ type: 'Button' })).find(b => b.key?.startsWith('done-'))
    expect(done).toBeDefined()
    await ui.press({ key: done?.key ?? '' })
    expect((await ui.find({ type: 'Text', text: '리뷰 코멘트 반영' }))?.props.strikethrough).toBe(true)
    await ui.press({ key: (done?.key ?? '').replace('done-', 'del-') })
    expect(await ui.find({ type: 'Text', text: '리뷰 코멘트 반영' })).toBeUndefined()
  })

  test('mobile: 입력칸 없이 목록만', async ($, on) => {
    await boot($, on)
    const ui = await $.ui.mount({ plugin: 'neon-bubble', surface: 'mobile', component: 'Pane', requestId: 'neon-panel', props: PANE })
    expect(await ui.find({ key: 'memo-input' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '📝 메모' })).toBeDefined()
  })
})

// ── v0.2: 턴·스피너·리플레이·모델 분배·힌트 ──

const USAGE = { input_tokens: 1000, output_tokens: 1234, cache_read_input_tokens: 10000, cache_creation_input_tokens: 1300, model: 'claude-opus-5-5' }

async function bootTurns($: Engine, on: On, agents: { id: string; type: string }[] = [], w: World = {}) {
  const steps: { model: string; effort?: unknown; agentId?: string }[] = []
  const logs: string[] = []
  on('turn.start', ($$, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($$, e) => ({ text: e.answer }))
  on('turn.step', async function* ($$, e) {
    steps.push({ model: e.model, effort: e.effort, agentId: e.agentId })
    // 요청마다 컨텍스트가 5k 씩 자란다
    const usage = { ...USAGE, input_tokens: USAGE.input_tokens + steps.length * 5000 }
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  on('agent.list', () => ({ value: agents.map(a => ({ ...a, description: '', status: 'running' as const })) }))
  on('ui.log', ($$, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  const world = await boot($, on, w)
  return { ...world, steps, logs }
}

/** 스트림을 끝까지 흘리고 결과를 돌려준다. */
async function drain<C, R>(stream: AsyncGenerator<C, R>): Promise<R> {
  for (;;) {
    const r = await stream.next()
    if (r.done === true) return r.value
  }
}

const step = (agentId?: string) => ({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 3, ...(agentId === undefined ? {} : { agentId }) })

describe('스피너·턴 요약·남은 턴', () => {
  test('스피너 꼬리는 도구 수·경과·비용을 붙이고 1초마다 갱신', async ($, on) => {
    on('ui.render', { component: 'Spinner' }, ($$, e) => {
      const { Text } = $$.ui.resolve(e)
      return <Text>{`${e.props.word}${e.props.suffix}`}</Text>
    })
    const { clock } = await bootTurns($, on)
    await $.turn.start({ text: '작업', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    await clock.advance(12_000)
    const props = { word: 'Sauteing', message: null, suffix: '…', mode: 'tool-use' as const }
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'neon-bubble', surface, component: 'Spinner', props })
      expect(await ui.find({ type: 'Text', text: 'Sauteing · 🛠 2 · ⏱ 12s…' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('메인 턴 끝에 요약 줄, 서브에이전트·중단 턴은 그대로', async ($, on) => {
    await bootTurns($, on)
    await $.turn.start({ text: '작업', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'ls' })
    const base = { answer: '답', durationMs: 12_400, turnId: 't1', usage: USAGE }
    const main = await $.turn.complete({ ...base, isAborted: false, reason: 'answer' })
    expect(main.text).toBe('✓ 12s · 도구 1 · 입력 12.3k · 출력 1.2k · 캐시 81%')
    const sub = await $.turn.complete({ ...base, isAborted: false, reason: 'answer', agentId: 'a1' })
    expect(sub.text).toBe('답')
    const aborted = await $.turn.complete({ ...base, isAborted: true, reason: 'aborted' })
    expect(aborted.text).toBe('답')
  })

  test('메인 요청의 usage 로 남은 턴을 띠에 붙인다', async ($, on) => {
    await bootTurns($, on)
    await $.session.measure({ context: { window: 100_000, percent: 40 }, rateLimits: [], changed: ['context'] })
    const turn = async (id: string) => {
      await $.turn.start({ text: '작업', turnId: id })
      await drain($.turn.step({ ...step(), turnId: id }))
      await $.turn.complete({ answer: '', durationMs: 1000, turnId: id, isAborted: false, reason: 'answer' })
    }
    await turn('t1')
    // 한 턴만으로는 증가량을 모른다 → 남은 턴 생략
    let ui = await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
    expect(JSON.stringify(await ui.drawn())).not.toContain('⏳')
    await ui.unmount()
    await turn('t2')
    ui = await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })
    // 100k 창, 턴당 +5k, 현재 ~23k → 10턴 넘게 남음
    expect(JSON.stringify(await ui.drawn())).toContain('⏳ 10+턴')
  })
})

describe('리플레이', () => {
  const PANE = { title: '리플레이', isFocused: true, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }

  test('/replay 로 직전 턴 편집을 n/p 로 넘긴다', async ($, on) => {
    await bootTurns($, on)
    await $.turn.start({ text: '편집', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.py', old_string: 'x = 1', new_string: 'x = 2' })
    await $.tool.call({ tool: 'Write', file_path: '/repo/src/b.py', content: 'print(1)\n' })
    await $.turn.complete({ answer: '', durationMs: 1000, turnId: 't1', isAborted: false, reason: 'answer' })
    const r = await $.command.run({ command: 'replay', args: '', origin: COMPOSER, presentation: PRESENTATION })
    expect(r.text).toContain('편집 2개')
    const ui = await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'Pane', requestId: 'neon-replay', props: PANE })
    expect(await ui.find({ type: 'Text', text: '1/2 · src/a.py · Edit' })).toBeDefined()
    const code = await ui.find({ type: 'Code' })
    expect(code?.props.format).toBe('diff')
    expect(String(code?.props.source)).toContain('-x = 1\n+x = 2')
    await ui.press({ key: 'next' })
    expect(await ui.find({ type: 'Text', text: '2/2 · src/b.py · Write' })).toBeDefined()
    await ui.press({ key: 'next' })
    expect(await ui.find({ type: 'Text', text: '2/2 · src/b.py · Write' })).toBeDefined()
    await ui.press({ key: 'prev' })
    expect(await ui.find({ type: 'Text', text: '1/2 · src/a.py · Edit' })).toBeDefined()
  })

  test('편집이 없으면 토스트, /replay 2 는 두 턴 전', async ($, on) => {
    const { toasts } = await bootTurns($, on)
    await $.turn.start({ text: '편집', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.py', old_string: 'a', new_string: 'b' })
    await $.turn.start({ text: '질문만', turnId: 't2' })
    const none = await $.command.run({ command: 'replay', args: '', origin: COMPOSER, presentation: PRESENTATION })
    expect(none.text).toContain('없습니다')
    expect(toasts.join()).toContain('직전 턴에 파일 편집이 없어요')
    const two = await $.command.run({ command: 'replay', args: '2', origin: COMPOSER, presentation: PRESENTATION })
    expect(two.text).toContain('편집 1개')
  })
})

describe('모델 분배', () => {
  const PANE = { title: '모델 분배', isFocused: true, bodyColumns: 80, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }

  test('규칙이 없으면 아무것도 바꾸지 않는다', async ($, on) => {
    const { steps } = await bootTurns($, on, [{ id: 'a1', type: 'Explore' }])
    await drain($.turn.step(step('a1')))
    expect(steps.at(-1)?.model).toBe('claude-opus-5-5')
  })

  test('규칙이 있으면 해당 서브에이전트만 바꾸고 메인·모르는 agentId 는 그대로', async ($, on) => {
    const { steps, logs } = await bootTurns($, on, [{ id: 'a1', type: 'Explore' }, { id: 'a2', type: 'Plan' }])
    await $.command.run({ command: 'model-route', args: '', origin: COMPOSER, presentation: PRESENTATION })
    const ui = await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'Pane', requestId: 'neon-routes', props: PANE })
    expect(await ui.find({ type: 'Text', text: '규칙 없음' })).toBeDefined()
    await ui.select({ key: 'route-type', value: 'Explore' })
    await ui.select({ key: 'route-model', value: 'haiku' })
    await ui.select({ key: 'route-effort', value: 'low' })
    await ui.press({ key: 'route-add' })
    expect(await ui.find({ type: 'Text', text: 'Explore → haiku (low)' })).toBeDefined()

    await drain($.turn.step(step('a1')))
    expect(steps.at(-1)).toMatchObject({ model: 'haiku', effort: 'low', agentId: 'a1' })
    await drain($.turn.step(step('a1')))
    expect(logs.filter(l => l === 'model-route: Explore → haiku (low)')).toHaveLength(1)
    await drain($.turn.step(step()))
    expect(steps.at(-1)?.model).toBe('claude-opus-5-5')
    await drain($.turn.step(step('a2')))
    expect(steps.at(-1)?.model).toBe('claude-opus-5-5')
    await drain($.turn.step(step('ghost')))
    expect(steps.at(-1)?.model).toBe('claude-opus-5-5')
    expect(await ui.find({ type: 'Text', text: '바뀐 요청: 2' })).toBeDefined()

    await ui.press({ key: 'route-del-0' })
    expect(await ui.find({ type: 'Text', text: '규칙 없음' })).toBeDefined()
  })
})

describe('도구 행·프롬프트 힌트', () => {
  test('ToolUse 는 엔진 행을 감싸 아이콘을 붙이고, 실패는 빨강', async ($, on) => {
    on('ui.render', ($$, e) => {
      const { Text } = $$.ui.resolve(e)
      return <Text>engine-row</Text>
    })
    await boot($, on)
    const props = { tool_use_id: 'tu1', tool: 'Bash', input: { command: 'ls' }, isRunning: false, isErrored: true, isInterrupted: false }
    const ui = await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'ToolUse', requestId: 'tu1', props })
    expect((await ui.find({ type: 'Text', text: '🐚 ' }))?.props.color).toBe('#ff5c8a')
    expect(await ui.find({ type: 'Text', text: 'engine-row' })).toBeDefined()
    const plain = await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'ToolUse', requestId: 'tu2', props: { ...props, tool: 'TodoWrite', tool_use_id: 'tu2' } })
    expect(await plain.find({ type: 'Text', text: '🐚 ' })).toBeUndefined()
  })

  test('neonToolRows 를 끄면 엔진 행 그대로', { options: { neonToolRows: false } }, async ($, on) => {
    on('ui.render', ($$, e) => {
      const { Text } = $$.ui.resolve(e)
      return <Text>engine-row</Text>
    })
    await boot($, on)
    const props = { tool_use_id: 'tu1', tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false }
    const ui = await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'ToolUse', requestId: 'tu1', props })
    expect(await ui.find({ type: 'Text', text: '🐚 ' })).toBeUndefined()
  })

  test('PromptHint 꼬리: 입력·작업 중엔 생략', async ($, on) => {
    const seen: (string | undefined)[] = []
    on('ui.render', { component: 'PromptHint' }, ($$, e) => {
      seen.push(e.props.tail)
      const { Text } = $$.ui.resolve(e)
      return <Text>{e.props.hint}</Text>
    })
    await boot($, on)
    const props = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
    await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'PromptHint', props })
    await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'PromptHint', props: { ...props, isDraft: true } })
    await $.ui.mount({ plugin: 'neon-bubble', surface: 'terminal', component: 'PromptHint', props: { ...props, isWorking: true } })
    expect(seen).toEqual(['/side-panel · /replay · /model-route', undefined, undefined])
  })
})
