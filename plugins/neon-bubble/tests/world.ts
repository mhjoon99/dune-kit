// 테스트용 가짜 세계: 엔진 아래에서 $ 호출(파일·프로세스·세션·시계)에 답한다.
import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

export const NOW = Date.parse('2026-10-08T10:00:00Z')

export type World = {
  branch?: string
  files?: Record<string, string>
  tracked?: string[]
  untracked?: string[]
  shortstat?: string
  status?: string
  stash?: string
  model?: string
  usage?: { ctx?: number; startedAt?: number; cost?: number; limits?: { kind: string; percentUsed: number; resetsAt?: string }[] }
}

const ok = (stdout = '', exitCode = 0) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

/** /repo 에 저장소가 있는 세계를 깔고, 띄운 토스트를 모아 돌려준다. */
export function installWorld(on: On, w: World = {}) {
  const toasts: string[] = []
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  const files: Record<string, string> = { '/repo/.git/HEAD': `ref: refs/heads/${w.branch ?? 'feat/statusline'}\n`, ...w.files }
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.root', () => ({ value: '/repo' }))
  on('session.repo', () => ({ value: { root: '/repo', remote: null, internal: false, name: null } }))
  on('session.model', () => ({ value: w.model ?? 'claude-opus-5-5' }))
  on('session.usage', () => ({
    value: {
      startedAt: w.usage?.startedAt ?? NOW - 42 * 60000,
      context: { window: 200000, percent: w.usage?.ctx },
      rateLimits: w.usage?.limits ?? [],
      cost: w.usage?.cost === undefined ? undefined : { usd: w.usage.cost },
    },
  }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('fs.stat', ($, e) => {
    if (e.path === '/repo/.git' || e.path === '/repo') return { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false } }
    if (files[e.path] !== undefined) return { value: { kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false } }
    return { deny: `ENOENT: ${e.path}` }
  })
  on('fs.exists', ($, e) => ({ value: files[e.path] !== undefined || e.path === '/repo/.git' }))
  on('fs.read', ($, e) => (files[e.path] !== undefined ? { value: files[e.path] as string } : { deny: `ENOENT: ${e.path}` }))
  on('process.run', ($, e) => {
    const argv = e.argv.join(' ')
    if (argv.startsWith('git diff --shortstat')) return ok(w.shortstat ?? ' 2 files changed, 12 insertions(+), 3 deletions(-)\n')
    if (argv.startsWith('git ls-files --others')) return ok((w.untracked ?? []).join('\n'))
    if (argv.startsWith('git ls-files --error-unmatch')) return ok('', (w.tracked ?? []).includes(e.argv.at(-1) ?? '') ? 0 : 1)
    if (argv.startsWith('git check-ignore')) return ok('', 1)
    if (argv === 'git status --short') return ok(w.status ?? '')
    if (argv === 'git stash list') return ok(w.stash ?? '')
    return ok()
  })
  return { toasts, clock }
}

export const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}

export const COMPOSER = { kind: 'composer' as const }
export const PRESENTATION = { isFullscreen: false, columns: 120 }
