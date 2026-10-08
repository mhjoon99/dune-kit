import { describe, expect, test } from 'claude-code/testing'

import {
  askQuestion,
  forecastLabel,
  forecastTurns,
  formatTokens,
  makeDiff,
  previewClean,
  previewPush,
  previewReset,
  previewRestore,
  previewRm,
  replayHeader,
  spinnerSuffix,
  toolStyle,
  turnSummary,
} from '../hooks/format'
import { draftToRoute, routeFor, routeLogLine, sanitizeRoutes } from '../hooks/route'

describe('미리보기 문자열', () => {
  test('reset: 날아갈 파일과 stash 수(추적 안 된 ?? 제외)', () => {
    expect(previewReset(' M src/a.py\nM  src/b.py\n?? junk\n', 'stash@{0}: x\nstash@{1}: y\n')).toBe('날아갈 변경: 2개 파일 (src/a.py, src/b.py) · stash 2개')
    expect(previewReset('', '')).toBe('날아갈 변경: 없음')
    const many = Array.from({ length: 7 }, (_, i) => ` M f${i}.ts`).join('\n')
    expect(previewReset(many, '')).toBe('날아갈 변경: 7개 파일 (f0.ts, f1.ts, f2.ts, f3.ts, f4.ts, …)')
  })
  test('clean / restore / push / rm', () => {
    expect(previewClean('Would remove build/\nWould remove tmp.log\n')).toBe('지워질 파일: 2개 (build/, tmp.log)')
    expect(previewClean('')).toBe('지워질 파일: 없음')
    expect(previewRestore(' src/a.ts | 4 ++--\n 1 file changed, 2 insertions(+), 2 deletions(-)\n')).toBe(
      '되돌릴 변경: 1개 파일 (src/a.ts) · 1 file changed, 2 insertions(+), 2 deletions(-)',
    )
    expect(previewPush('abc123 fix\ndef456 feat\n', 'origin/main')).toBe('덮어써질 원격 커밋 2개 (origin/main): abc123 fix, def456 feat')
    expect(previewPush('', 'origin/main')).toBe('덮어써질 원격 커밋: 없음 (origin/main)')
    expect(previewRm(12, 2048, ['src', 'README.md'], false)).toBe('지워질 파일: 12개 · 2.0KB (src, README.md)')
    expect(previewRm(2000, 5 * 1024 ** 2, [], true)).toBe('지워질 파일: 2000+개 · 5.0MB+')
  })
  test('질문 문구', () => {
    const q = askQuestion('git   reset --hard', ['날아갈 변경: 3개 파일 (src/a.py, …)'])
    expect(q).toBe('⚠️ 되돌릴 수 없는 명령이에요 — git reset --hard\n날아갈 변경: 3개 파일 (src/a.py, …)\n실행할까요?')
  })
})

describe('턴 요약·스피너·예보', () => {
  test('턴 요약 포맷과 캐시율', () => {
    const usage = { input_tokens: 1000, output_tokens: 1234, cache_read_input_tokens: 10000, cache_creation_input_tokens: 1300 }
    expect(turnSummary(12_400, 5, usage)).toBe('✓ 12s · 도구 5 · 입력 12.3k · 출력 1.2k · 캐시 81%')
    expect(turnSummary(65_000, 0, undefined)).toBe('✓ 1m05s · 도구 0')
    expect(formatTokens(999)).toBe('999')
  })
  test('스피너 꼬리(비용 모르면 생략)', () => {
    expect(spinnerSuffix(3, 12_900, 0.0412)).toBe(' · 🛠 3 · ⏱ 12s · 💎 $0.04')
    expect(spinnerSuffix(0, 0, undefined)).toBe(' · 🛠 0 · ⏱ 0s')
  })
  test('예보: 최근 증가 평균으로 남은 턴', () => {
    expect(forecastTurns([10_000, 20_000, 30_000], 100_000)).toBe(7)
    expect(forecastTurns([10_000], 100_000)).toBeUndefined()
    expect(forecastTurns([50_000, 40_000], 100_000)).toBeUndefined()
    expect(forecastTurns([10_000, 11_000], 200_000)).toBe(189)
    expect(forecastLabel(4)).toBe('☁️ ~4턴')
    expect(forecastLabel(189)).toBe('☁️ 10+턴')
    expect(forecastLabel(undefined)).toBeUndefined()
  })
})

describe('리플레이 diff', () => {
  test('공통 앞뒤를 맥락으로 남긴 hunk', () => {
    const d = makeDiff('a\nb\nc\nd', 'a\nb\nX\nd')
    expect(d).toBe('@@ -1,4 +1,4 @@\n a\n b\n-c\n+X\n d')
  })
  test('새 파일과 상한', () => {
    expect(makeDiff('', 'x\ny')).toBe('@@ -0,0 +1,2 @@\n+x\n+y')
    expect(makeDiff('a'.repeat(50_000), 'b').length).toBeLessThan(20_100)
    expect(replayHeader(2, 7, 'src/app/main.py', 'Edit')).toBe('3/7 · src/app/main.py · Edit')
  })
})

describe('모델 분배 규칙', () => {
  const routes = [
    { agentType: 'Explore', model: 'haiku' },
    { agentType: 'code-reviewer', model: 'opus', effort: 'high' as const },
  ]
  test('타입으로 찾기(대소문자 무시), 없으면 undefined', () => {
    expect(routeFor(routes, 'explore')?.model).toBe('haiku')
    expect(routeFor(routes, 'Plan')).toBeUndefined()
    expect(routeFor(routes, undefined)).toBeUndefined()
    expect(routeFor([], 'Explore')).toBeUndefined()
  })
  test('저장값 정리·폼 변환·로그', () => {
    expect(sanitizeRoutes([{ agentType: 'a', model: 'b', effort: 'bogus' }, { agentType: '' }, 3])).toEqual([{ agentType: 'a', model: 'b' }])
    expect(sanitizeRoutes(undefined)).toEqual([])
    expect(draftToRoute(' Explore ', 'sonnet', 'default')).toEqual({ agentType: 'Explore', model: 'sonnet' })
    expect(draftToRoute('x', 'opus', 'max')).toEqual({ agentType: 'x', model: 'opus', effort: 'max' })
    expect(draftToRoute('', 'opus', 'max')).toBeUndefined()
    expect(routeLogLine('code-explorer', { agentType: 'code-explorer', model: 'sonnet' })).toBe('model-route: code-explorer → sonnet')
  })
})

describe('도구 행 스타일', () => {
  test('도구별 아이콘·색', () => {
    expect(toolStyle('Bash')).toEqual({ icon: '🐚', color: '#5ce1e6' })
    expect(toolStyle('Write')?.icon).toBe('📝')
    expect(toolStyle('Grep')?.color).toBe('#b388ff')
    expect(toolStyle('mcp__github__x')?.icon).toBe('🔌')
    expect(toolStyle('WebFetch')?.color).toBe('#8be9fd')
    expect(toolStyle('TodoWrite')).toBeUndefined()
  })
})
