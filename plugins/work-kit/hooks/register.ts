// work-kit: 내장 /init 을 가로채 업무 하네스 단계를 합친다.
// /init 은 모델에게 숨은 프롬프트(door 'note')를 보내는 명령이라, 그 행이 저장되기 직전에
// work-kit 지시문을 덧붙인다. `/init --plain` 은 손대지 않고 내장 그대로 돈다.
import type { Register } from 'claude-code'
import { buildAddendum } from './addendum'

// /init 이 돈 뒤 명령 행 → 숨은 프롬프트 행 순으로 저장된다. 그 사이만 덧붙일 자리로 본다.
export const ARM_MS = 15_000

// 덧붙일 자리를 못 찾으면 내장 /init 만 조용히 돈다 — Claude Code 가 기록 모양을 바꿨다는 신호라 알린다.
export const MISSED_TOAST =
  'work-kit: /init 프롬프트를 찾지 못해 내장 /init 만 돌았습니다. Claude Code 업데이트로 기록 모양이 바뀌었을 수 있습니다'

export function splitPlain(args: string): { plain: boolean; args: string } {
  const words = args.split(/\s+/).filter(Boolean)
  const plain = words.includes('--plain')
  return { plain, args: words.filter(w => w !== '--plain').join(' ') }
}

export const register: Register = on => {
  // run 이 0 이 아니면 그 /init 의 숨은 프롬프트를 기다리는 중이다
  let run = 0
  let runs = 0
  let armedAt = 0
  let sawCommand = false

  on('command.run', { command: 'init' }, async ($, e, next) => {
    const { plain, args } = splitPlain(e.args)
    if (plain) return next({ ...e, args })
    const mine = ++runs
    run = mine
    armedAt = await $.clock.now()
    sawCommand = false
    // 다시 불러오기·세션 종료로 잠이 취소되면 알릴 것도 없다
    void $.clock
      .sleep(ARM_MS)
      .then(() => {
        if (run !== mine) return
        run = 0
        return $.ui.toast(MISSED_TOAST)
      })
      .catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.append', { door: 'command' }, async ($, e, next) => {
    if (run && !e.agentId) {
      const text = e.message.content.map(c => (c.type === 'text' ? c.text : '')).join('')
      if (text.includes('<command-name>/init</command-name>')) sawCommand = true
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.append', { door: 'note' }, async ($, e, next) => {
    if (!run || !sawCommand || e.agentId) return next(e)
    const fresh = (await $.clock.now()) - armedAt < ARM_MS
    run = 0
    sawCommand = false
    if (!fresh) return next(e)
    const content = [...e.message.content, { type: 'text' as const, text: buildAddendum($.plugin.root) }]
    return next({ ...e, message: { ...e.message, content } })
  }).catch(($, e, next) => next(e))
}
