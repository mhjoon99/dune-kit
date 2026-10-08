import { describe, expect, test } from 'claude-code/testing'

import { classifyInput, flowGate, isShortAck, rememberPrompt } from '../hooks/flow'
import { cellWidth, formatDuration, formatReset, gauge, gradientAt, nextAlerts, planBand, prettyModel, sectionLimits, sparkline } from '../hooks/format'
import { longestCommentBlock } from '../hooks/guard-rules'

const NOW = Date.parse('2026-10-08T10:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const MIN = 60000

describe('리셋 시간 포맷', () => {
  test('resetsAt - now 만으로 계산, 분 단위 내림', () => {
    expect(formatReset(iso(NOW + 83 * MIN + 59_000), NOW)).toBe('1h23m')
    expect(formatReset(iso(NOW + 45 * MIN), NOW)).toBe('45m')
    expect(formatReset(iso(NOW + 65 * MIN), NOW)).toBe('1h05m')
    expect(formatReset(iso(NOW - 5 * MIN), NOW)).toBe('0m')
    expect(formatReset(undefined, NOW)).toBeUndefined()
    expect(formatReset('not-a-date', NOW)).toBeUndefined()
  })
  test('세션 시작 시각과 무관(5h59m 버그 재발 방지)', () => {
    // 세션을 막 시작했어도 창은 2시간 뒤 리셋: 5h59m 가 아니라 2h00m
    expect(formatReset(iso(NOW + 120 * MIN), NOW)).toBe('2h00m')
    expect(formatReset(iso(NOW + 120 * MIN), NOW)).not.toBe('5h59m')
  })
  test('경과 시간', () => {
    expect(formatDuration(42 * MIN)).toBe('42m')
    expect(formatDuration(65 * MIN + 30_000)).toBe('1h05m')
    expect(formatDuration(3 * 24 * 60 * MIN)).toBe('3d00h')
  })
})

describe('게이지', () => {
  test('반올림한 칸 수와 그라데이션 양 끝', () => {
    expect(gauge(62, 12).filter(c => c.glyph === '●')).toHaveLength(7)
    expect(gauge(81, 12).filter(c => c.glyph === '●')).toHaveLength(10)
    expect(gauge(24, 6).filter(c => c.glyph === '●')).toHaveLength(1)
    expect(gauge(100, 12)[0]?.color).toBe('#ff6ac1')
    expect(gauge(100, 12)[11]?.color).toBe('#5ce1e6')
    expect(gradientAt(0.5)).toBe('#b388ff')
    expect(gauge(0, 6).every(c => c.color === '#3d3a4a')).toBe(true)
  })
  test('좁으면 칸을 줄이고(최소 6) 그래도 넘치면 경로→비용→경과 순으로 뺀다', () => {
    const d = {
      model: 'Opus 5.5',
      branch: 'feat/statusline',
      diff: { added: 12, removed: 3 },
      project: 'interweb-api',
      ctxPercent: 62,
      costUsd: 1.84,
      elapsed: '42m',
      five: { percent: 81, reset: '1h23m' },
      seven: { percent: 24 },
    }
    expect(planBand(d, 120)).toEqual({ cells: 12, smallCells: 6, showProject: true, showCost: true, showElapsed: true })
    const mid = planBand(d, 52)
    expect(mid.cells).toBeLessThan(12)
    expect(mid.cells).toBeGreaterThanOrEqual(6)
    const narrow = planBand(d, 30)
    expect(narrow.cells).toBe(6)
    expect(narrow.showProject).toBe(false)
    expect(narrow.showCost).toBe(false)
  })
  test('표시 이름, 칸 폭, 스파크라인', () => {
    expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5')
    expect(prettyModel('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5')
    expect(prettyModel('Opus 5.5')).toBe('Opus 5.5')
    expect(cellWidth('🧠 ab')).toBe(5)
    expect(sparkline([0, 50, 100, undefined])).toBe('▁▅█ ')
  })
  test('패널 섹션 개수는 높이에 맞춰 줄어든다', () => {
    expect(sectionLimits(80)).toEqual({ edits: 12, calls: 15, memory: 6, notes: 8 })
    const small = sectionLimits(24)
    expect(small.calls).toBeLessThan(15)
    expect(small.edits).toBeGreaterThanOrEqual(1)
  })
})

describe('사용량 알림', () => {
  const t = { warn: 80, alert: 95 }
  test('같은 창·같은 단계는 리셋 전까지 한 번만', () => {
    const r = iso(NOW + 83 * MIN)
    const a = nextAlerts({}, { limits: [{ kind: 'five_hour', percentUsed: 81, resetsAt: r }] }, NOW, t)
    expect(a.toasts).toEqual(['🚀 5시간 사용량 81% · 1h23m 후 리셋'])
    const b = nextAlerts(a.memo, { limits: [{ kind: 'five_hour', percentUsed: 85, resetsAt: r }] }, NOW, t)
    expect(b.toasts).toEqual([])
    const c = nextAlerts(b.memo, { limits: [{ kind: 'five_hour', percentUsed: 96, resetsAt: r }] }, NOW, t)
    expect(c.toasts).toEqual(['⚠️ 5시간 사용량 96% · 1h23m 후 리셋'])
    const d = nextAlerts(c.memo, { limits: [{ kind: 'five_hour', percentUsed: 82, resetsAt: iso(NOW + 300 * MIN) }] }, NOW, t)
    expect(d.toasts).toHaveLength(1)
  })
  test('컨텍스트는 compact 로 내려갔다 다시 넘으면 다시 알림', () => {
    const a = nextAlerts({}, { ctxPercent: 96, limits: [] }, NOW, t)
    expect(a.toasts).toEqual(['⚠️ 컨텍스트 96% — /compact 를 고려하세요'])
    const b = nextAlerts(a.memo, { ctxPercent: 97, limits: [] }, NOW, t)
    expect(b.toasts).toEqual([])
    const c = nextAlerts(b.memo, { ctxPercent: 20, limits: [] }, NOW, t)
    const d = nextAlerts(c.memo, { ctxPercent: 81, limits: [] }, NOW, t)
    expect(d.toasts).toHaveLength(1)
  })
})

describe('flow 단축 규칙', () => {
  const history = ['로그인 API 에 refresh token 을 추가해줘']
  test('짧은 맞장구는 분류 없이 continue', () => {
    for (const ack of ['응 진행해', '좋아', 'ㅇㅇ', 'ok go ahead']) {
      expect(isShortAck(ack)).toBe(true)
      expect(flowGate(ack, history, 60, 30)).toEqual({ decision: 'pass', why: 'short-ack' })
    }
  })
  test('슬래시·첫 프롬프트·작은 컨텍스트는 통과, 그 외는 분류', () => {
    const long = '이번엔 결제 모듈의 환불 처리 로직을 새로 설계해서 구현해줘'
    expect(flowGate('/compact', history, 90, 30).decision).toBe('pass')
    expect(flowGate(long, [], 90, 30)).toEqual({ decision: 'pass', why: 'first' })
    expect(flowGate(long, history, 10, 30)).toEqual({ decision: 'pass', why: 'small-context' })
    expect(flowGate(long, history, 50, 30)).toEqual({ decision: 'classify' })
  })
  test('분류 입력은 최근 3개(각 300자)만', () => {
    const h = rememberPrompt(rememberPrompt(rememberPrompt(rememberPrompt([], 'a'), 'b'), 'c'), 'x'.repeat(500))
    expect(h).toHaveLength(3)
    expect(h[2]).toHaveLength(300)
    const input = classifyInput(h, '새 일')
    expect(input).toContain('새 요청: 새 일')
    expect(input).not.toContain('1. a')
  })
})

describe('주석 카운터', () => {
  test('연속 주석 블록 길이', () => {
    const src = ['const a = 1', '// one', '// two', '// three', '// four', 'const b = 2'].join('\n')
    expect(longestCommentBlock(src, 'x.ts', true)).toBe(4)
  })
  test('파일 머리 주석과 선언 앞 doc 주석은 제외', () => {
    const src = [
      '#!/usr/bin/env node',
      '// 파일 설명 1',
      '// 파일 설명 2',
      '// 파일 설명 3',
      '// 파일 설명 4',
      '',
      '/**',
      ' * 긴 docstring',
      ' * 둘째 줄',
      ' * 셋째 줄',
      ' */',
      'export function f() {}',
      '// 짧은 주석',
    ].join('\n')
    expect(longestCommentBlock(src, 'x.ts', true)).toBe(1)
    // 부분 수정(Edit)에서는 머리 주석으로 보지 않는다
    expect(longestCommentBlock(src.split('\n').slice(1).join('\n'), 'x.ts', false)).toBe(4)
  })
  test('# / -- / ; / 블록 주석 / YAML', () => {
    expect(longestCommentBlock('x = 1\n# a\n# b\n# c\n# d\n', 'a.py', true)).toBe(4)
    expect(longestCommentBlock('select 1;\n-- a\n-- b\n', 'q.sql', true)).toBe(2)
    expect(longestCommentBlock('[a]\nx=1\n; a\n; b\n; c\n; d\n; e\n', 'c.ini', true)).toBe(5)
    expect(longestCommentBlock('int x;\n/* a\n b\n c\n d */\nint y;', 'a.c', true)).toBe(4)
    expect(longestCommentBlock('k: v\n# a\n# b\n# c\n# d\nz: 1\n', 'c.yaml', true)).toBe(4)
    expect(longestCommentBlock('# 제목\n## 부제\n### 셋\n#### 넷\n', 'README.md', true)).toBe(0)
  })
  test('Python docstring 은 주석이 아니다', () => {
    const py = ['def f():', '    """', '    길다', '    아주 길다', '    정말 길다', '    """', '    return 1'].join('\n')
    expect(longestCommentBlock(py, 'a.py', true)).toBe(0)
  })
})
