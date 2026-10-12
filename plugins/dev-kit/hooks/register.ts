// dev-kit: 항상 지킬 규칙(주석, 플랜 핵심)을 시스템 프롬프트 끝에 붙인다.
// 플러그인의 규칙 파일은 자동으로 읽히지 않아서, 프롬프트를 조립할 때마다 rules/ 의 글을 한 구획씩 더한다.
// 글이 매번 같아야 프롬프트 캐시가 유지되므로 파일은 한 번만 읽는다.
import type { PromptComposeSection, Register } from 'claude-code'

export const RULES = [
  { id: 'dev-kit:comments', file: 'rules/comments.md' },
  { id: 'dev-kit:plans', file: 'rules/plans.md' },
] as const

export const register: Register = on => {
  let loaded: Promise<PromptComposeSection[]> | undefined

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    loaded ??= Promise.all(
      RULES.map(async r => ({
        id: r.id,
        text: (await $.fs.read(`${$.plugin.root}/${r.file}`)).trim(),
        scope: 'session' as const,
      })),
    )
    let rules: PromptComposeSection[]
    try {
      rules = await loaded
    } catch {
      // 다음 조립 때 다시 읽는다
      loaded = undefined
      return result
    }
    const have = new Set(result.sections.map(s => s.id))
    return { sections: [...result.sections, ...rules.filter(r => !have.has(r.id))] }
  }).catch(($, e, next) => next(e))
}
