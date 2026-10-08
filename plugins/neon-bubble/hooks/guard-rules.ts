// 가드 판단용 순수 함수: 명령 파싱, 차단/경고 규칙, 사설 IP, 주석 블록, 메모리 경로.
import type { NeonRule } from '../types'

/** `/guard-allow` 로 1회 풀 수 있는 무조건 차단 규칙. */
export const RULES: readonly NeonRule[] = ['env', 'no-verify', 'protected-branch', 'private-ip']

/** 묻기 전에 보여 줄 미리보기를 무엇으로 만들지. */
export type PreviewPlan =
  | { kind: 'rm'; targets: string[]; dir?: string }
  | { kind: 'reset'; dir?: string }
  | { kind: 'clean'; dir?: string; args: string[] }
  | { kind: 'restore'; dir?: string }
  | { kind: 'push'; dir?: string; remote: string; branch?: string }

export type Finding =
  | { kind: 'deny'; rule: NeonRule; reason: string }
  | { kind: 'ask'; rule: NeonRule; reason: string; command: string; preview?: PreviewPlan }
  | { kind: 'warn'; reason: string }

/** 실제로 실행될 프로그램 하나: 래퍼를 벗긴 이름과 인자, 그 시점의 `cd` 위치. */
export type Invocation = { program: string; args: string[]; dir?: string; raw: string }

export type GitCall = { sub: string; args: string[]; dir?: string; configs: string[] }

export type ScanContext = {
  protectedBranches: readonly string[]
  /** git 실행 위치(dir, 상대/절대/없음)의 현재 브랜치. 모르면 undefined. */
  branchOf: (dir: string | undefined) => string | undefined
  /** 작업트리의 추적 안 된 .env 계열 파일. */
  untrackedEnv: readonly string[]
  /** 저장소 루트(정규화 전 그대로). rm 대상 비교용. */
  repoRoot?: string
}

// ── 토크나이저 ──────────────────────────────────────────────

type Lexed = { segments: string[][]; nested: string[]; raws: string[] }

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\r'

/** 따옴표를 존중하며 줄바꿈 ; && || | & 로 조각을 나누고 $(…) 안쪽은 따로 모은다. */
export function lex(input: string): Lexed {
  const segments: string[][] = []
  const raws: string[] = []
  const nested: string[] = []
  let words: string[] = []
  let word = ''
  let hasWord = false
  let segStart = 0
  let i = 0

  const pushWord = () => {
    if (hasWord) words.push(word)
    word = ''
    hasWord = false
  }
  const pushSeg = (end: number) => {
    pushWord()
    if (words.length > 0) {
      segments.push(words)
      raws.push(input.slice(segStart, end).trim())
    }
    words = []
  }

  while (i < input.length) {
    const c = input[i] as string
    const n = input[i + 1] ?? ''
    if (c === "'") {
      const end = input.indexOf("'", i + 1)
      const stop = end < 0 ? input.length : end
      word += input.slice(i + 1, stop)
      hasWord = true
      i = stop + 1
      continue
    }
    if (c === '"') {
      i += 1
      while (i < input.length && input[i] !== '"') {
        const d = input[i] as string
        if ((d === '\\' || d === '`') && (input[i + 1] === '"' || input[i + 1] === '\\')) {
          word += input[i + 1]
          i += 2
          continue
        }
        if (d === '$' && input[i + 1] === '(') {
          const close = matchParen(input, i + 1)
          nested.push(input.slice(i + 2, close))
          word += input.slice(i, close + 1)
          i = close + 1
          continue
        }
        word += d
        i += 1
      }
      hasWord = true
      i += 1
      continue
    }
    if (c === '\\' && n !== '' && n !== '\n') {
      // 경로 구분자(C:\x)일 수 있어 역슬래시는 글자로 남긴다
      word += n === ' ' ? ' ' : c + n
      hasWord = true
      i += 2
      continue
    }
    if (c === '$' && n === '(') {
      const close = matchParen(input, i + 1)
      nested.push(input.slice(i + 2, close))
      word += input.slice(i, close + 1)
      hasWord = true
      i = close + 1
      continue
    }
    if ((c === '<' || c === '>') && n === '(') {
      const close = matchParen(input, i + 1)
      nested.push(input.slice(i + 2, close))
      i = close + 1
      continue
    }
    if (c === '#' && !hasWord) {
      const nl = input.indexOf('\n', i)
      i = nl < 0 ? input.length : nl
      continue
    }
    if (c === '\n' || c === ';') {
      pushSeg(i)
      segStart = i + 1
      i += 1
      continue
    }
    if (c === '&' || c === '|') {
      const prev = input[i - 1] ?? ''
      // 2>&1, &>file, >&2 같은 리다이렉트는 구분자가 아니다
      if (c === '&' && (prev === '>' || prev === '<' || n === '>')) {
        word += c
        hasWord = true
        i += 1
        continue
      }
      const step = n === c || (c === '|' && n === '&') ? 2 : 1
      pushSeg(i)
      segStart = i + step
      i += step
      continue
    }
    if (isSpace(c)) {
      pushWord()
      i += 1
      continue
    }
    word += c
    hasWord = true
    i += 1
  }
  pushSeg(input.length)
  return { segments, nested, raws }
}

function matchParen(s: string, open: number): number {
  let depth = 0
  for (let j = open; j < s.length; j += 1) {
    const c = s[j]
    if (c === '(') depth += 1
    else if (c === ')') {
      depth -= 1
      if (depth === 0) return j
    }
  }
  return s.length
}

// ── 래퍼 벗기기 ─────────────────────────────────────────────

const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/
const KEYWORDS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '(', '}', ')'])
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish'])
const PWSH = new Set(['powershell', 'pwsh'])

// 래퍼별로 값을 받는 옵션
const WRAPPER_VALUE_OPTS: Record<string, ReadonlySet<string>> = {
  sudo: new Set(['-u', '-g', '-h', '-p', '-C', '-D', '-r', '-t', '-U', '-T', '--user', '--group', '--chdir']),
  doas: new Set(['-u', '-C']),
  command: new Set([]),
  env: new Set(['-u', '--unset', '-C', '--chdir']),
  nohup: new Set([]),
  exec: new Set(['-a']),
  xargs: new Set(['-n', '-I', '-P', '-L', '-d', '-s', '-E', '-a', '--max-args', '--max-procs', '--delimiter', '--arg-file']),
  nice: new Set(['-n', '--adjustment']),
  stdbuf: new Set(['-i', '-o', '-e']),
  timeout: new Set(['-s', '-k', '--signal', '--kill-after']),
  time: new Set(['-f', '-o']),
}

export const programName = (word: string) =>
  (word.split(/[\\/]/).pop() ?? word).toLowerCase().replace(/\.exe$/, '')

/** 명령 문자열 → 실제 실행될 프로그램 목록. bash -c, pwsh -Command, cmd /c, $(…) 안쪽도 펼친다. */
export function parseCommand(command: string, depth = 0): Invocation[] {
  if (depth > 4) return []
  const { segments, nested, raws } = lex(command)
  const out: Invocation[] = []
  let dir: string | undefined
  segments.forEach((seg, index) => {
    const raw = raws[index] ?? ''
    const words = unwrap(seg)
    if (words.length === 0) return
    const program = programName(words[0] as string)
    const args = words.slice(1)
    if (program === 'cd' || program === 'set-location' || program === 'pushd' || program === 'sl') {
      const target = args.find(a => !a.startsWith('-'))
      if (target !== undefined) dir = dir === undefined || isAbsolute(target) ? target : joinPath(dir, target)
      return
    }
    const inner = innerScript(program, args)
    if (inner !== undefined) {
      for (const one of parseCommand(inner, depth + 1)) {
        out.push({ ...one, dir: one.dir ?? dir })
      }
      return
    }
    out.push({ program, args, dir, raw })
  })
  for (const sub of nested) out.push(...parseCommand(sub, depth + 1))
  return out
}

function unwrap(seg: readonly string[]): string[] {
  // 리다이렉트 대상(>, >>, 2> 다음 낱말) 제거
  const cleaned: string[] = []
  for (let i = 0; i < seg.length; i += 1) {
    const w = seg[i] as string
    if (/^(\d*|&)(>>?|<)(&?\d*)?$/.test(w)) {
      i += 1
      continue
    }
    if (/^(\d*|&)(>>?|<)/.test(w)) continue
    cleaned.push(w)
  }
  let words = cleaned
  for (let guard = 0; guard < 16 && words.length > 0; guard += 1) {
    const head = words[0] as string
    if (ASSIGN.test(head) || KEYWORDS.has(head)) {
      words = words.slice(1)
      continue
    }
    const name = programName(head)
    const valueOpts = WRAPPER_VALUE_OPTS[name]
    if (valueOpts === undefined) break
    let k = 1
    while (k < words.length) {
      const w = words[k] as string
      if (name === 'env' && ASSIGN.test(w)) {
        k += 1
        continue
      }
      if (w === '--') {
        k += 1
        break
      }
      if (!w.startsWith('-') || w === '-') break
      k += valueOpts.has(w) ? 2 : 1
    }
    // timeout 은 옵션 뒤에 시간 인자가 하나 더 온다
    if (name === 'timeout' && k < words.length) k += 1
    words = words.slice(k)
  }
  return words
}

function innerScript(program: string, args: readonly string[]): string | undefined {
  if (SHELLS.has(program)) {
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i] as string
      if (/^-[a-zA-Z]*c[a-zA-Z]*$/.test(a)) return args[i + 1]
      if (!a.startsWith('-')) return undefined
    }
    return undefined
  }
  if (PWSH.has(program)) {
    for (let i = 0; i < args.length; i += 1) {
      const a = (args[i] as string).toLowerCase()
      if (a === '-c' || a === '-command' || a === '/c' || a === '-com') return args.slice(i + 1).join(' ')
      if (a === '-encodedcommand' || a === '-e' || a === '-ec') return undefined
    }
    const rest = args.filter(a => !a.startsWith('-'))
    return rest.length > 0 && !/\.ps1$/i.test(rest[0] as string) ? rest.join(' ') : undefined
  }
  if (program === 'cmd') {
    const at = args.findIndex(a => /^\/[ck]$/i.test(a))
    return at < 0 ? undefined : args.slice(at + 1).join(' ')
  }
  return undefined
}

// ── git ─────────────────────────────────────────────────────

const GIT_VALUE_GLOBALS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env', '--super-prefix'])

/** `git [전역 옵션…] <sub> <args…>` 에서 서브커맨드와 -C 경로·-c 설정을 뽑는다. */
export function gitCall(inv: Invocation): GitCall | undefined {
  if (inv.program !== 'git') return undefined
  let dir = inv.dir
  const configs: string[] = []
  let i = 0
  while (i < inv.args.length) {
    const a = inv.args[i] as string
    if (!a.startsWith('-')) break
    const eq = a.indexOf('=')
    const name = eq > 0 ? a.slice(0, eq) : a
    if (GIT_VALUE_GLOBALS.has(name)) {
      const value = eq > 0 ? a.slice(eq + 1) : inv.args[i + 1]
      if (name === '-C' && value !== undefined) dir = dir === undefined || isAbsolute(value) ? value : joinPath(dir, value)
      if (name === '-c' && value !== undefined) configs.push(value)
      i += eq > 0 ? 1 : 2
      continue
    }
    i += 1
  }
  const sub = inv.args[i]
  if (sub === undefined) return undefined
  return { sub, args: inv.args.slice(i + 1), dir, configs }
}

/** 브랜치를 알아야 하는 git 실행 위치들(commit, push). */
export function branchDirs(invs: readonly Invocation[]): (string | undefined)[] {
  const dirs: (string | undefined)[] = []
  for (const inv of invs) {
    const g = gitCall(inv)
    if (g !== undefined && (g.sub === 'commit' || g.sub === 'push') && !dirs.includes(g.dir)) dirs.push(g.dir)
  }
  return dirs
}

/** `git add -A/./--all` 이 있는지: 추적 안 된 .env 확인이 필요한지. */
export const needsUntrackedEnv = (invs: readonly Invocation[]) =>
  invs.some(inv => {
    const g = gitCall(inv)
    return g?.sub === 'add' && g.args.some(a => a === '-A' || a === '--all' || a === '.' || a === ':/' || a === '*')
  })

const ENV_ALLOWED = /^\.env\.(example|sample|template)$/i

/** `.env`, `.env.local` 같은 비밀 파일인지(.env.example/.sample/.template 제외). */
export function isEnvFile(path: string): boolean {
  const base = path.split(/[\\/]/).pop() ?? path
  if (ENV_ALLOWED.test(base)) return false
  return /^\.env(\..+)?$/i.test(base) || /^\.env\*$/.test(base)
}

const COMMIT_VALUE_OPTS = new Set(['-m', '-F', '-c', '-C', '-t', '--message', '--file', '--author', '--date', '--template', '--fixup', '--squash', '--reuse-message', '--reedit-message', '--trailer', '--cleanup'])

function commitSkipsHooks(args: readonly string[]): boolean {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] as string
    if (a === '--') return false
    if (a === '--no-verify') return true
    if (COMMIT_VALUE_OPTS.has(a)) {
      i += 1
      continue
    }
    if (/^-[a-zA-Z]+$/.test(a)) {
      for (const ch of a.slice(1)) {
        if (ch === 'n') return true
        if ('mFcCt'.includes(ch)) break
      }
    }
  }
  return false
}

const PUSH_VALUE_OPTS = new Set(['--repo', '--receive-pack', '--exec', '-o', '--push-option', '--signed'])

function pushPositionals(args: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] as string
    if (PUSH_VALUE_OPTS.has(a)) {
      i += 1
      continue
    }
    if (!a.startsWith('-')) out.push(a)
  }
  return out
}

function isForcePush(args: readonly string[]): boolean {
  for (const a of args) {
    if (a === '--force' || a === '--force=true') return true
    if (/^-[a-zA-Z]+$/.test(a) && a.slice(1).includes('f')) return true
  }
  const refspecs = pushPositionals(args).slice(1)
  return refspecs.some(r => r.startsWith('+'))
}

// ── 파괴적 명령 ─────────────────────────────────────────────

function rmIsRecursiveForce(args: readonly string[]): { hit: boolean; targets: string[] } {
  let r = false
  let f = false
  const targets: string[] = []
  let endOpts = false
  for (const a of args) {
    if (!endOpts && a === '--') {
      endOpts = true
      continue
    }
    if (!endOpts && a.startsWith('--')) {
      if (a === '--recursive') r = true
      if (a === '--force') f = true
      continue
    }
    if (!endOpts && /^-[a-zA-Z]+$/.test(a)) {
      if (/[rR]/.test(a)) r = true
      if (a.includes('f')) f = true
      continue
    }
    targets.push(a)
  }
  return { hit: r && f, targets }
}

const normalizeDir = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

function isDangerousTarget(target: string, repoRoot?: string): boolean {
  const t = target.trim()
  if (/^(\/|\/\*|~|~\/|~\/\*|\$HOME|\$\{HOME\}|\$HOME\/|\$HOME\/\*|\*|\.|\.\/|\.\/\*|\.\.|\.\.\/|\.\.\/\*|%USERPROFILE%|\$env:USERPROFILE)$/i.test(t)) return true
  if (/^[A-Za-z]:[\\/]?\*?$/.test(t)) return true
  if (repoRoot !== undefined && repoRoot !== '' && normalizeDir(t) === normalizeDir(repoRoot)) return true
  return false
}

const psMatches = (word: string, full: string, min: number) => {
  const w = word.toLowerCase().replace(/^-/, '').replace(/:.*$/, '')
  return w.length >= min && full.startsWith(w)
}

type Danger = { reason: string; preview?: PreviewPlan }

function destructiveReason(inv: Invocation, g: GitCall | undefined, repoRoot?: string): Danger | undefined {
  const { program, args, dir } = inv
  if (program === 'rm') {
    const { hit, targets } = rmIsRecursiveForce(args)
    if (hit && targets.some(t => isDangerousTarget(t, repoRoot))) {
      return { reason: `rm -rf 대상(${targets.join(' ')})이 루트·홈·현재/상위 폴더·저장소 전체입니다`, preview: { kind: 'rm', targets, dir } }
    }
  }
  if (program === 'remove-item' || program === 'ri' || program === 'rmdir' || program === 'rd' || program === 'del' || program === 'erase' || program === 'rm') {
    const recurse = args.some(a => a.startsWith('-') && psMatches(a, 'recurse', 1))
    const force = args.some(a => a.startsWith('-') && psMatches(a, 'force', 2))
    const targets = args.filter(a => !a.startsWith('-'))
    if (recurse && force) return { reason: 'Remove-Item -Recurse -Force 는 되돌릴 수 없는 재귀 삭제입니다', preview: { kind: 'rm', targets, dir } }
  }
  if ((program === 'rd' || program === 'rmdir') && args.some(a => /^\/s$/i.test(a))) {
    return { reason: 'rd/rmdir /s 는 폴더 전체를 지웁니다', preview: { kind: 'rm', targets: args.filter(a => !a.startsWith('/')), dir } }
  }
  if ((program === 'del' || program === 'erase') && args.some(a => /^\/s$/i.test(a))) return { reason: 'del /s 는 하위 폴더까지 지웁니다' }
  if (program === 'format' || program.startsWith('mkfs')) return { reason: `${program} 은 디스크를 포맷합니다` }
  if (g !== undefined) {
    if (g.sub === 'reset' && g.args.includes('--hard')) return { reason: 'git reset --hard 는 커밋 안 된 변경을 버립니다', preview: { kind: 'reset', dir: g.dir } }
    if (g.sub === 'clean' && g.args.some(a => a === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(a))) {
      return { reason: 'git clean -f 는 추적 안 된 파일을 지웁니다', preview: { kind: 'clean', dir: g.dir, args: g.args } }
    }
    if (g.sub === 'checkout') {
      const dash = g.args.indexOf('--')
      const paths = dash >= 0 ? g.args.slice(dash + 1) : g.args.filter(a => !a.startsWith('-'))
      if (paths.some(p => p === '.' || p === '*' || p === ':/' || p === './')) return { reason: 'git checkout -- . 는 작업트리 변경 전체를 되돌립니다', preview: { kind: 'restore', dir: g.dir } }
    }
    if (g.sub === 'restore') {
      const stagedOnly = g.args.some(a => a === '--staged' || a === '-S') && !g.args.some(a => a === '--worktree' || a === '-W')
      const paths = g.args.filter(a => !a.startsWith('-'))
      if (!stagedOnly && paths.some(p => p === '.' || p === '*' || p === ':/' || p === './')) return { reason: 'git restore . 는 작업트리 변경 전체를 되돌립니다', preview: { kind: 'restore', dir: g.dir } }
    }
  }
  if (/^(psql|mysql|mariadb|sqlcmd|sqlite3|clickhouse-client)$/.test(program)) {
    if (/\bdrop\s+(database|table|schema)\b/i.test(inv.raw)) return { reason: 'DROP DATABASE/TABLE 은 데이터를 지웁니다' }
  }
  return undefined
}

/** git clean 인자를 dry-run(-n)으로 바꾼다: -f 는 빼고 -d/-x/-X·경로는 유지. */
export function cleanDryRunArgs(args: readonly string[]): string[] {
  const out = ['clean', '-n']
  for (const a of args) {
    if (a === '--force' || a === '-n' || a === '--dry-run' || a === '-i' || a === '--interactive') continue
    if (/^-[a-zA-Z]+$/.test(a)) {
      const rest = a.slice(1).replace(/[fni]/g, '')
      if (rest !== '') out.push(`-${rest}`)
      continue
    }
    out.push(a)
  }
  return out
}

// ── 판정 ─────────────────────────────────────────────────────

const HOW = (rule: NeonRule) =>
  ` 정말 필요하면 사용자에게 \`/guard-allow ${rule}\` 실행을 요청한 뒤 다시 시도하세요(다음 1회만 허용).`

/** 명령 하나를 판정: 차단(deny)과 경고(warn) 목록. */
export function scanCommand(command: string, ctx: ScanContext): Finding[] {
  const invs = parseCommand(command)
  const found: Finding[] = []
  const deny = (rule: NeonRule, why: string) => {
    if (!found.some(f => f.kind === 'deny' && f.rule === rule)) found.push({ kind: 'deny', rule, reason: `${why}.${HOW(rule)}` })
  }
  const ask = (rule: NeonRule, why: string, preview?: PreviewPlan) => {
    if (!found.some(f => f.kind === 'ask' && f.reason === why)) found.push({ kind: 'ask', rule, reason: why, command, preview })
  }
  const warn = (reason: string) => {
    if (!found.some(f => f.kind === 'warn' && f.reason === reason)) found.push({ kind: 'warn', reason })
  }

  invs.forEach((inv, index) => {
    const g = gitCall(inv)
    if (g !== undefined) {
      if (g.configs.some(c => /^core\.hookspath=/i.test(c))) deny('no-verify', 'git -c core.hooksPath 로 훅을 우회할 수 없습니다')
      if (g.sub === 'add') {
        const paths = g.args.filter(a => !a.startsWith('-'))
        const bad = paths.filter(isEnvFile)
        if (bad.length > 0) deny('env', `git add 로 비밀 파일(${bad.join(', ')})을 올리려 합니다 — .gitignore 에 넣고 .env.example 을 쓰세요`)
        else if (needsUntrackedEnv([inv]) && ctx.untrackedEnv.length > 0) warn(`⚠️ git add 전체 — 추적 안 된 ${ctx.untrackedEnv.join(', ')} 이 함께 올라갈 수 있어요`)
      }
      if (g.sub === 'push') {
        if (isForcePush(g.args)) {
          const pos = pushPositionals(g.args)
          const dst = pos[1]?.replace(/^\+/, '').split(':').pop()?.replace(/^refs\/heads\//, '')
          const branch = dst !== undefined && dst !== '' && dst !== 'HEAD' ? dst : ctx.branchOf(g.dir)
          ask('force-push', '강제 push(--force, -f, +refspec)는 원격 기록을 덮어씁니다', { kind: 'push', dir: g.dir, remote: pos[0] ?? 'origin', branch })
        }
        if (g.args.includes('--no-verify')) deny('no-verify', 'git push --no-verify 로 훅을 우회할 수 없습니다')
        const refs = pushPositionals(g.args).slice(1)
        const targets = refs.length > 0 ? refs.map(r => r.replace(/^\+/, '').split(':').pop() ?? r) : [ctx.branchOf(g.dir) ?? '']
        const hit = targets.map(t => t.replace(/^refs\/heads\//, '')).find(t => ctx.protectedBranches.includes(t))
        if (hit !== undefined) warn(`🚧 보호 브랜치 ${hit} 로 push 합니다`)
      }
      if (g.sub === 'commit') {
        if (commitSkipsHooks(g.args)) deny('no-verify', 'git commit --no-verify(-n)로 훅을 우회할 수 없습니다')
        const branch = ctx.branchOf(g.dir)
        if (branch !== undefined && ctx.protectedBranches.includes(branch)) deny('protected-branch', `보호 브랜치 ${branch} 에 직접 커밋할 수 없습니다 — 작업 브랜치를 만드세요`)
      }
      if (g.sub === 'merge' && g.args.includes('--no-verify')) deny('no-verify', 'git merge --no-verify 로 훅을 우회할 수 없습니다')
      if (g.sub === 'branch' && g.args.some(a => a === '-D' || (/^-[a-zA-Z]+$/.test(a) && a.includes('D')) || (a === '--force' && g.args.some(b => b === '-d' || b === '--delete')))) warn('🌿 git branch -D — 병합 안 된 브랜치도 지웁니다')
      if (g.sub === 'stash' && (g.args[0] === 'drop' || g.args[0] === 'clear')) warn(`📦 git stash ${g.args[0]} — 스태시를 버립니다`)
    }
    const destructive = destructiveReason(inv, g, ctx.repoRoot)
    if (destructive !== undefined) ask('destructive', destructive.reason, destructive.preview)

    if (inv.program === 'chmod' && inv.args.some(a => /^0?777$/.test(a) || /^(a|ugo)[+=]rwx$/.test(a))) warn('🔓 chmod 777 — 모두에게 쓰기 권한을 줍니다')
    if ((inv.program === 'curl' || inv.program === 'wget' || inv.program === 'iwr' || inv.program === 'invoke-webrequest') && invs.slice(index + 1).some(n => SHELLS.has(n.program) || PWSH.has(n.program) || n.program === 'iex' || n.program === 'invoke-expression')) {
      warn('🌐 내려받은 스크립트를 바로 셸로 실행합니다')
    }
    if ((inv.program === 'npm' || inv.program === 'pnpm' || inv.program === 'yarn') && inv.args[0] === 'publish') warn('📦 npm publish — 패키지를 공개 배포합니다')
    if (inv.program === 'docker' && inv.args[0] === 'system' && inv.args[1] === 'prune') warn('🐳 docker system prune — 컨테이너·이미지를 정리합니다')
    if (inv.program === 'kubectl' && inv.args.includes('delete')) warn('☸️ kubectl delete — 클러스터 리소스를 지웁니다')
  })
  return found
}

// ── 사설 IP ─────────────────────────────────────────────────

const IPV4 = /(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d]|\.\d)/g

/** 10/8, 172.16/12, 192.168/16 주소들(127.x, RFC 5737 문서용 주소는 해당 없음). */
export function privateIps(text: string): string[] {
  const hits: string[] = []
  for (const m of text.matchAll(IPV4)) {
    const o = m.slice(1, 5).map(Number)
    if (o.some(x => x > 255)) continue
    const [a, b] = o as [number, number, number, number]
    const isPrivate = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    if (isPrivate && !hits.includes(m[0])) hits.push(m[0])
  }
  return hits
}

/** 저장소 상대 경로가 예외 목록(`docs/`, `.env` 등)에 걸리는지. */
export function isIpExempt(relPath: string, exempt: readonly string[]): boolean {
  const p = relPath.replace(/\\/g, '/').replace(/^\.\//, '')
  const base = p.split('/').pop() ?? p
  return exempt.some(raw => {
    const x = raw.trim().replace(/\\/g, '/').replace(/^\.\//, '')
    if (x === '') return false
    if (x.endsWith('/')) return p.startsWith(x) || p.includes(`/${x}`)
    return p === x || base === x
  })
}

// ── 주석 블록 ───────────────────────────────────────────────

type Syntax = { line: string[]; block: boolean }

function syntaxOf(path: string): Syntax | undefined {
  const name = (path.split(/[\\/]/).pop() ?? path).toLowerCase()
  const ext = name.includes('.') ? (name.split('.').pop() as string) : name
  if (['md', 'markdown', 'txt', 'json', 'lock', 'csv', 'svg', 'html', 'xml', 'rst'].includes(ext)) return undefined
  if (['py', 'sh', 'bash', 'zsh', 'yaml', 'yml', 'rb', 'toml', 'ps1', 'psm1', 'r', 'conf', 'cfg', 'dockerfile', 'makefile', 'tf', 'pl', 'gitignore', 'env'].includes(ext)) return { line: ['#'], block: false }
  if (['sql', 'lua', 'hs'].includes(ext)) return { line: ['--'], block: ext === 'sql' }
  if (['ini', 'clj', 'lisp', 'el', 'asm', 's'].includes(ext)) return { line: [';'], block: false }
  if (['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'mts', 'cts', 'go', 'java', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'rs', 'swift', 'kt', 'kts', 'scala', 'dart', 'scss', 'less', 'css', 'php', 'vue', 'svelte'].includes(ext)) {
    return { line: ext === 'css' ? [] : ['//'], block: true }
  }
  return { line: ['#', '//'], block: true }
}

const DECL = /^(export\s+)?(default\s+)?(async\s+)?(abstract\s+)?(function|class|interface|type|const|let|var|def|fn|pub|public|private|protected|static|enum|struct|impl|func|module|namespace)\b|^[\w$.]+\s*[:=(<]|^@\w+/

/**
 * 파일 머리 주석과 함수/클래스 doc 주석을 빼고, 가장 긴 연속 주석 줄 수.
 * `isWholeFile` 이 false(부분 수정)면 머리 주석 판단을 하지 않는다.
 */
export function longestCommentBlock(content: string, path: string, isWholeFile: boolean): number {
  const syntax = syntaxOf(path)
  if (syntax === undefined) return 0
  const lines = content.split(/\r?\n/)
  type Kind = 'code' | 'blank' | 'comment' | 'doc'
  const kinds: Kind[] = []
  let inBlock: 'plain' | 'doc' | undefined
  for (const rawLine of lines) {
    const t = rawLine.trim()
    if (inBlock !== undefined) {
      kinds.push(inBlock === 'doc' ? 'doc' : 'comment')
      if (t.includes('*/')) inBlock = undefined
      continue
    }
    if (t === '') {
      kinds.push('blank')
      continue
    }
    if (syntax.block && t.startsWith('/*')) {
      const isDoc = t.startsWith('/**') && !t.startsWith('/**/')
      kinds.push(isDoc ? 'doc' : 'comment')
      if (!t.slice(2).includes('*/')) inBlock = isDoc ? 'doc' : 'plain'
      continue
    }
    if (syntax.line.some(m => t.startsWith(m)) && !t.startsWith('#!') && !t.startsWith('#[') && !/^#(include|define|if|endif|pragma|region|endregion)\b/.test(t)) {
      kinds.push(t.startsWith('///') || t.startsWith('//!') ? 'doc' : 'comment')
      continue
    }
    kinds.push('code')
  }

  // 머리 주석: 파일 처음(셔뱅·빈 줄 제외)부터 이어지는 첫 주석 블록
  const skip = new Set<number>()
  if (isWholeFile) {
    let i = 0
    while (i < kinds.length && (kinds[i] === 'blank' || (lines[i] ?? '').trim().startsWith('#!'))) i += 1
    while (i < kinds.length && (kinds[i] === 'comment' || kinds[i] === 'doc')) {
      skip.add(i)
      i += 1
    }
  }

  let best = 0
  let i = 0
  while (i < kinds.length) {
    if (skip.has(i) || (kinds[i] !== 'comment' && kinds[i] !== 'doc')) {
      i += 1
      continue
    }
    const start = i
    let docOnly = true
    while (i < kinds.length && !skip.has(i) && (kinds[i] === 'comment' || kinds[i] === 'doc')) {
      if (kinds[i] === 'comment') docOnly = false
      i += 1
    }
    let next = i
    while (next < kinds.length && kinds[next] === 'blank') next += 1
    const follows = (lines[next] ?? '').trim()
    // 선언 바로 앞의 doc 주석(/** */, ///)은 docstring 으로 본다
    if (docOnly && DECL.test(follows)) continue
    best = Math.max(best, i - start)
  }
  return best
}

// ── 메모리 경로 ─────────────────────────────────────────────

export function isMemoryPath(path: string): boolean {
  const p = path.replace(/\\/g, '/')
  return p.includes('/.claude/memory/') || /\/\.claude\/projects\/[^/]+\/memory\//.test(p)
}

// ── 경로 도우미 ─────────────────────────────────────────────

export const isAbsolute = (p: string) => p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('~')

export function joinPath(base: string, rel: string): string {
  if (isAbsolute(rel)) return rel
  const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/'
  const parts = base.replace(/[\\/]+$/, '').split(/[\\/]/)
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (parts.length > 1) parts.pop()
      continue
    }
    parts.push(seg)
  }
  const joined = parts.join(sep)
  return joined === '' ? sep : joined
}

export function parentDir(p: string): string | undefined {
  const trimmed = p.replace(/[\\/]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (cut < 0) return undefined
  if (cut === 0) return trimmed === '/' || trimmed === '' ? undefined : '/'
  const parent = trimmed.slice(0, cut)
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent
}

export const baseName = (p: string) => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p

/** 루트 기준 상대 경로(루트 밖이면 원래 경로). 슬래시로 통일. */
export function relativeTo(root: string | undefined, path: string): string {
  const p = path.replace(/\\/g, '/')
  if (root === undefined) return p
  const r = root.replace(/\\/g, '/').replace(/\/+$/, '')
  const lowerP = p.toLowerCase()
  const lowerR = r.toLowerCase()
  return lowerP.startsWith(`${lowerR}/`) ? p.slice(r.length + 1) : p
}

/** `.git/HEAD` 내용 → 브랜치 이름, detached 면 짧은 SHA. */
export function parseHead(text: string): string | undefined {
  const t = text.trim()
  const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(t)
  if (ref !== null) return ref[1]
  if (/^[0-9a-f]{7,64}$/i.test(t)) return t.slice(0, 7)
  return undefined
}

/** `git diff --shortstat` 출력 → 추가/삭제 줄수. */
export function parseShortstat(text: string): { added: number; removed: number } {
  const added = /(\d+) insertions?\(\+\)/.exec(text)
  const removed = /(\d+) deletions?\(-\)/.exec(text)
  return { added: added ? Number(added[1]) : 0, removed: removed ? Number(removed[1]) : 0 }
}

export const splitList = (s: string) =>
  s
    .split(',')
    .map(x => x.trim())
    .filter(x => x !== '')
