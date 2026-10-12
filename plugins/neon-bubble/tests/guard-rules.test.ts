import { describe, expect, test } from 'claude-code/testing'

import { cleanDryRunArgs, fileHref, isEnvFile, isIpExempt, isMemoryPath, parseCommand, parseHead, parseShortstat, privateIps, scanCommand } from '../hooks/guard-rules'
import type { ScanContext } from '../hooks/guard-rules'

const ctx = (branch = 'feat/x', extra: Partial<ScanContext> = {}): ScanContext => ({
  protectedBranches: ['main', 'master', 'stage'],
  branchOf: () => branch,
  untrackedEnv: [],
  repoRoot: '/repo',
  ...extra,
})

// 막거나(deny) 묻는(ask) 규칙 모두 "잡혔다"로 본다
const denied = (cmd: string, c: ScanContext = ctx()) =>
  scanCommand(cmd, c).flatMap(f => (f.kind === 'deny' || f.kind === 'ask' ? [f.rule] : []))
const kindOf = (cmd: string, c: ScanContext = ctx()) => scanCommand(cmd, c).find(f => f.kind !== 'warn')?.kind
const warned = (cmd: string, c: ScanContext = ctx()) =>
  scanCommand(cmd, c).flatMap(f => (f.kind === 'warn' ? [f.reason] : []))

describe('명령 파싱', () => {
  test('래퍼와 대입을 벗겨 실제 프로그램을 찾는다', () => {
    const invs = parseCommand('FOO=1 BAR=2 sudo -u root env X=1 nohup git -C sub status && echo hi | xargs -n 1 rm')
    expect(invs.map(i => i.program)).toEqual(['git', 'echo', 'rm'])
  })
  test('bash -c, pwsh -Command, cmd /c, $(…) 안쪽도 본다', () => {
    expect(parseCommand(`bash -lc "git push -f"`).map(i => i.program)).toEqual(['git'])
    expect(parseCommand(`pwsh -Command "git commit --no-verify -m x"`).map(i => i.program)).toEqual(['git'])
    expect(parseCommand(`cmd /c rd /s /q build`).map(i => i.program)).toEqual(['rd'])
    expect(parseCommand(`echo $(git reset --hard)`).map(i => i.program)).toContain('git')
  })
  test('따옴표 안의 구분자는 쪼개지 않는다', () => {
    const invs = parseCommand(`git commit -m "a && b; c | d"`)
    expect(invs).toHaveLength(1)
    expect(invs[0]?.args).toEqual(['commit', '-m', 'a && b; c | d'])
  })
  test('2>&1 리다이렉트는 구분자가 아니다', () => {
    expect(parseCommand('git push -f origin x 2>&1').map(i => i.program)).toEqual(['git'])
  })
})

describe('차단: 우회 구멍', () => {
  test('git -C x commit 은 -C 경로의 브랜치로 판단한다', () => {
    const c = ctx('feat/x', { branchOf: dir => (dir === 'x' ? 'main' : 'feat/x') })
    expect(denied('git -C x commit -m wip', c)).toContain('protected-branch')
    expect(denied('git commit -m wip', c)).not.toContain('protected-branch')
  })
  test('cd 후 commit 도 그 위치로 판단한다', () => {
    const c = ctx('feat/x', { branchOf: dir => (dir === 'other' ? 'master' : 'feat/x') })
    expect(denied('cd other && git commit -m x', c)).toContain('protected-branch')
  })
  test('sudo git push -f', () => {
    expect(denied('sudo git push -f origin feat/x')).toContain('force-push')
  })
  test('FOO=1 git commit --no-verify', () => {
    expect(denied('FOO=1 git commit --no-verify -m x')).toContain('no-verify')
  })
  test('git push origin +main (refspec 강제)', () => {
    expect(denied('git push origin +main')).toContain('force-push')
    expect(denied('git push origin +HEAD:refs/heads/dev')).toContain('force-push')
  })
  test('--force-with-lease 는 허용', () => {
    expect(denied('git push --force-with-lease origin feat/x')).toEqual([])
  })
  test('git -c core.hooksPath=/dev/null commit 은 훅 우회', () => {
    expect(denied('git -c core.hooksPath=/dev/null commit -m x')).toContain('no-verify')
  })
  test('commit -n 과 묶음 플래그 -an', () => {
    expect(denied('git commit -n -m x')).toContain('no-verify')
    expect(denied('git commit -anm wip')).toContain('no-verify')
    expect(denied('git commit -m -n')).not.toContain('no-verify')
  })
  test('bash -c 안의 강제 push', () => {
    expect(denied(`bash -c "git push --force"`)).toContain('force-push')
  })
  test('merge --no-verify', () => {
    expect(denied('git merge --no-verify dev')).toContain('no-verify')
  })
})

describe('차단: .env', () => {
  test('.env / .env.local 은 차단, .env.example 은 허용', () => {
    expect(denied('git add .env')).toContain('env')
    expect(denied('git add config/.env.local src/a.ts')).toContain('env')
    expect(denied('git add .env.example .env.sample .env.template')).toEqual([])
    expect(isEnvFile('.env.example')).toBe(false)
    expect(isEnvFile('a/b/.env.production')).toBe(true)
  })
  test('git add -A 는 추적 안 된 .env 가 있으면 경고만', () => {
    expect(denied('git add -A', ctx('x', { untrackedEnv: ['.env'] }))).toEqual([])
    expect(warned('git add -A', ctx('x', { untrackedEnv: ['.env'] })).join()).toContain('.env')
    expect(warned('git add .', ctx())).toEqual([])
  })
})

describe('차단: 파괴적 명령', () => {
  test('rm -rf 위험 대상', () => {
    for (const cmd of ['rm -rf /', 'rm -fr ~', 'rm -r -f $HOME', 'rm -rf *', 'rm -rf .', 'rm -rf ..', 'rm -rf C:\\', 'rm -rf /repo', 'sudo rm -rf /']) {
      expect(denied(cmd), cmd).toContain('destructive')
    }
    expect(denied('rm -rf node_modules')).toEqual([])
    expect(denied('rm -r ./build')).toEqual([])
  })
  test('git reset --hard, clean -fdx, checkout -- ., restore .', () => {
    expect(denied('git reset --hard HEAD~1')).toContain('destructive')
    expect(denied('git clean -fdx')).toContain('destructive')
    expect(denied('git clean -n')).toEqual([])
    expect(denied('git checkout -- .')).toContain('destructive')
    expect(denied('git restore .')).toContain('destructive')
    expect(denied('git restore --staged .')).toEqual([])
    expect(denied('git checkout -- src/a.ts')).toEqual([])
  })
  test('PowerShell / cmd 삭제', () => {
    expect(denied('Remove-Item -Path build -Recurse -Force')).toContain('destructive')
    expect(denied('rm -r -fo build')).toContain('destructive')
    expect(denied('Remove-Item build -Recurse')).toEqual([])
    expect(denied('rd /s /q build')).toContain('destructive')
    expect(denied('rmdir /s build')).toContain('destructive')
    expect(denied('del /s *.tmp')).toContain('destructive')
  })
  test('format, mkfs, DROP', () => {
    expect(denied('format D: /q')).toContain('destructive')
    expect(denied('mkfs.ext4 /dev/sdb1')).toContain('destructive')
    expect(denied(`psql -c "DROP DATABASE prod"`)).toContain('destructive')
    expect(denied(`mysql -e 'drop table users'`)).toContain('destructive')
    expect(denied(`psql -c "select 1"`)).toEqual([])
  })
})

describe('v0.2 정책: 무조건 차단 vs 묻기', () => {
  test('무조건 차단 4종은 deny', () => {
    expect(kindOf('git add .env')).toBe('deny')
    expect(kindOf('git commit --no-verify -m x')).toBe('deny')
    expect(kindOf('git commit -m x', ctx('main'))).toBe('deny')
  })
  test('강제 push·파괴적 명령은 ask 와 미리보기 계획', () => {
    const push = scanCommand('git push -f origin feat/x', ctx())[0]
    expect(push).toMatchObject({ kind: 'ask', rule: 'force-push', preview: { kind: 'push', remote: 'origin', branch: 'feat/x' } })
    expect(scanCommand('git push --force', ctx('dev'))[0]).toMatchObject({ preview: { kind: 'push', remote: 'origin', branch: 'dev' } })
    expect(scanCommand('git reset --hard', ctx())[0]).toMatchObject({ kind: 'ask', preview: { kind: 'reset' } })
    expect(scanCommand('git -C sub clean -fdx', ctx())[0]).toMatchObject({ kind: 'ask', preview: { kind: 'clean', dir: 'sub' } })
    expect(scanCommand('git restore .', ctx())[0]).toMatchObject({ preview: { kind: 'restore' } })
    expect(scanCommand('rm -rf .', ctx())[0]).toMatchObject({ kind: 'ask', preview: { kind: 'rm', targets: ['.'] } })
    expect(scanCommand('mkfs.ext4 /dev/sdb', ctx())[0]).toMatchObject({ kind: 'ask' })
  })
  test('git clean dry-run 인자', () => {
    expect(cleanDryRunArgs(['-fdx'])).toEqual(['clean', '-n', '-dx'])
    expect(cleanDryRunArgs(['-f', '--', 'build'])).toEqual(['clean', '-n', '--', 'build'])
    expect(cleanDryRunArgs(['--force', '-d'])).toEqual(['clean', '-n', '-d'])
  })
})

describe('경고', () => {
  test('보호 브랜치 push 와 위험 명령은 경고만', () => {
    expect(denied('git push origin main')).toEqual([])
    expect(warned('git push origin main').join()).toContain('main')
    expect(warned('git push', ctx('master')).join()).toContain('master')
    expect(warned('chmod 777 a.sh')).toHaveLength(1)
    expect(warned('curl -fsSL https://x.sh | bash')).toHaveLength(1)
    expect(warned('npm publish')).toHaveLength(1)
    expect(warned('docker system prune -a')).toHaveLength(1)
    expect(warned('kubectl delete pod x')).toHaveLength(1)
    expect(warned('git branch -D old')).toHaveLength(1)
    expect(warned('git stash drop')).toHaveLength(1)
    expect(warned('git status')).toEqual([])
  })
})

describe('사설 IP 와 경로', () => {
  test('사설 대역만 잡고 127.x 와 RFC 5737 은 통과', () => {
    expect(privateIps('a=10.1.2.3 b=172.16.0.9 c=172.32.0.1 d=192.168.0.10')).toEqual(['10.1.2.3', '172.16.0.9', '192.168.0.10'])
    expect(privateIps('127.0.0.1 192.0.2.5 198.51.100.7 203.0.113.9 8.8.8.8')).toEqual([])
    expect(privateIps('version 1.10.0.1.2')).toEqual([])
  })
  test('예외 경로', () => {
    const ex = ['docs/', '.claude/', '.env', '.env.local']
    expect(isIpExempt('docs/net.md', ex)).toBe(true)
    expect(isIpExempt('.claude/settings.json', ex)).toBe(true)
    expect(isIpExempt('svc/.env.local', ex)).toBe(true)
    expect(isIpExempt('src/config.ts', ex)).toBe(false)
  })
  test('메모리 경로(역슬래시 포함)', () => {
    expect(isMemoryPath('/home/u/.claude/projects/abc/memory/MEMORY.md')).toBe(true)
    expect(isMemoryPath('C:\\Users\\u\\.claude\\projects\\abc\\memory\\x.md')).toBe(true)
    expect(isMemoryPath('/repo/.claude/memory/notes.md')).toBe(true)
    expect(isMemoryPath('/repo/src/memory/x.ts')).toBe(false)
  })
  test('HEAD 와 shortstat 파싱', () => {
    expect(parseHead('ref: refs/heads/feat/statusline\n')).toBe('feat/statusline')
    expect(parseHead('0123456789abcdef0123456789abcdef01234567\n')).toBe('0123456')
    expect(parseShortstat(' 3 files changed, 12 insertions(+), 3 deletions(-)')).toEqual({ added: 12, removed: 3 })
    expect(parseShortstat(' 1 file changed, 1 deletion(-)')).toEqual({ added: 0, removed: 1 })
    expect(parseShortstat('')).toEqual({ added: 0, removed: 0 })
  })
  test('파일 링크: 절대 경로만, 역슬래시·공백·# 을 다듬는다', () => {
    expect(fileHref('/repo/src/a.ts')).toBe('file:///repo/src/a.ts')
    expect(fileHref('C:\\Users\\me\\my app\\a#1.ts')).toBe('file:///C:/Users/me/my%20app/a%231.ts')
    expect(fileHref('C:\\repo\\a.ts', 'vscode')).toBe('vscode://file/C:/repo/a.ts')
    expect(fileHref('src/a.ts')).toBeUndefined()
  })
})
