import { describe, expect, mock, test } from 'claude-code/testing'

import { BUNDLES, PLACEHOLDERS, buildAddendum } from '../hooks/addendum'
import { ARM_MS, MISSED_TOAST, splitPlain } from '../hooks/register'

describe('/init --plain', () => {
  test('--plain 을 떼어 내고 나머지 인수는 남긴다', async () => {
    expect(splitPlain('--plain')).toEqual({ plain: true, args: '' })
    expect(splitPlain('foo --plain bar')).toEqual({ plain: true, args: 'foo bar' })
    expect(splitPlain('')).toEqual({ plain: false, args: '' })
  })
})

describe('지시문', () => {
  const text = buildAddendum('C:\\kit\\work-kit')

  test('템플릿 경로는 / 구분자로 플러그인 폴더를 가리킨다', async () => {
    expect(text).toContain('C:/kit/work-kit/templates/rules/core.md')
    expect(text).not.toContain('C:\\kit')
  })

  test('묶음 6개와 순서 ①~⑥ 이 모두 들어간다', async () => {
    expect(BUNDLES.map(b => b.label)).toEqual(['업무 매뉴얼', 'Git·커밋·MR', '이슈', '보고', '저장소 정책', '작업 태도'])
    for (const b of BUNDLES) expect(text).toContain(`(\`${b.key}\`)`)
    for (const step of ['① 묶음 선택', '② 프로젝트 기본', '③ 분석 방향', '④ 분석', '⑤ 채운 값 확인', '⑥ 생성']) expect(text).toContain(step)
  })

  test('자리표시값마다 설명 행이 있다', async () => {
    for (const [k] of PLACEHOLDERS) expect(text).toContain(`| \`${k}\` |`)
  })

  test('메모리는 local 설정의 autoMemoryDirectory 로 저장소 .claude/memory 를 가리킨다', async () => {
    expect(text).toContain('"autoMemoryDirectory": "{{projectAbs}}/.claude/memory"')
    expect(text).toContain('.claude/settings.local.json')
  })
})

describe('훅', () => {
  const ORIGIN = { kind: 'composer' as const }
  const PRESENTATION = { isFullscreen: false, columns: 120 }
  let n = 0
  const row = (door: 'command' | 'note', text: string) => ({
    door,
    origin: ORIGIN,
    uuid: `row-${++n}`,
    message: { type: 'user' as const, role: 'user' as const, ...(door === 'note' ? { isMeta: true as const } : {}), content: [{ type: 'text' as const, text }] },
  })
  const INIT_ROW = '<command-message>init</command-message>\n<command-name>/init</command-name>'
  const noteText = (rows: { appended: () => readonly { door: string; message: { content: readonly unknown[] } }[] }) =>
    JSON.stringify(rows.appended().filter(r => r.door === 'note').map(r => r.message.content))

  test('/init 의 숨은 프롬프트 끝에 work-kit 지시문을 붙인다', async ($, on) => {
    mock.clock(on, { now: 0 })
    const rows = mock.session(on)
    on('command.run', () => ({ text: '' }))
    await $.command.run({ command: 'init', args: '', origin: ORIGIN, presentation: PRESENTATION })
    await $.session.append(row('command', INIT_ROW))
    await $.session.append(row('note', 'Set up a minimal CLAUDE.md'))
    const note = noteText(rows)
    expect(note).toContain('Set up a minimal CLAUDE.md')
    expect(note).toContain('work-kit: 이 /init 에 업무 하네스를 합친다')
  })

  test('한 번만 붙인다 — 다음 숨은 행은 그대로', async ($, on) => {
    mock.clock(on, { now: 0 })
    const rows = mock.session(on)
    on('command.run', () => ({ text: '' }))
    await $.command.run({ command: 'init', args: '', origin: ORIGIN, presentation: PRESENTATION })
    await $.session.append(row('command', INIT_ROW))
    await $.session.append(row('note', 'first'))
    await $.session.append(row('note', 'second'))
    const notes = rows.appended().filter(r => r.door === 'note').map(r => JSON.stringify(r.message.content))
    expect(notes[0]).toContain('work-kit')
    expect(notes[1]).not.toContain('work-kit')
  })

  test('/init --plain 은 손대지 않는다', async ($, on) => {
    mock.clock(on, { now: 0 })
    const rows = mock.session(on)
    on('command.run', () => ({ text: '' }))
    await $.command.run({ command: 'init', args: '--plain', origin: ORIGIN, presentation: PRESENTATION })
    await $.session.append(row('command', INIT_ROW))
    await $.session.append(row('note', 'Set up a minimal CLAUDE.md'))
    expect(noteText(rows)).not.toContain('work-kit')
  })

  test('/init 뒤라도 명령 행 없이 온 숨은 행은 고치지 않는다', async ($, on) => {
    mock.clock(on, { now: 0 })
    const rows = mock.session(on)
    on('command.run', () => ({ text: '' }))
    await $.command.run({ command: 'init', args: '', origin: ORIGIN, presentation: PRESENTATION })
    await $.session.append(row('note', 'other'))
    expect(noteText(rows)).not.toContain('work-kit')
  })

  test('/init 없이 온 숨은 행은 고치지 않는다', async ($, on) => {
    mock.clock(on, { now: 0 })
    const rows = mock.session(on)
    await $.session.append(row('command', INIT_ROW))
    await $.session.append(row('note', 'hello'))
    expect(noteText(rows)).not.toContain('work-kit')
  })
})

describe('못 찾았을 때 알림', () => {
  const ORIGIN = { kind: 'composer' as const }
  const PRESENTATION = { isFullscreen: false, columns: 120 }
  const row = (door: 'command' | 'note', text: string, uuid: string) => ({
    door,
    origin: ORIGIN,
    uuid,
    message: { type: 'user' as const, role: 'user' as const, content: [{ type: 'text' as const, text }] },
  })

  test('기록 모양이 달라 덧붙이지 못하면 토스트로 알린다', async ($, on) => {
    const clock = mock.clock(on, { now: 0 })
    mock.session(on)
    const toasts: string[] = []
    on('ui.toast', ($$, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('command.run', () => ({ text: '' }))
    await $.command.run({ command: 'init', args: '', origin: ORIGIN, presentation: PRESENTATION })
    await $.session.append(row('command', '<command-name>/setup</command-name>', 'a'))
    await $.session.append(row('note', 'Set up a minimal CLAUDE.md', 'b'))
    await clock.advance(ARM_MS)
    await clock.settle()
    expect(toasts).toEqual([MISSED_TOAST])
  })

  test('덧붙였으면 알리지 않는다', async ($, on) => {
    const clock = mock.clock(on, { now: 0 })
    mock.session(on)
    const toasts: string[] = []
    on('ui.toast', ($$, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('command.run', () => ({ text: '' }))
    await $.command.run({ command: 'init', args: '', origin: ORIGIN, presentation: PRESENTATION })
    await $.session.append(row('command', '<command-name>/init</command-name>', 'a'))
    await $.session.append(row('note', 'Set up a minimal CLAUDE.md', 'b'))
    await clock.advance(ARM_MS)
    await clock.settle()
    expect(toasts).toEqual([])
  })
})
