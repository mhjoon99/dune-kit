import { describe, expect, test } from 'claude-code/testing'

import { RULES } from '../hooks/register'

const BASE = [{ id: 'intro', text: 'core', scope: 'shared' as const }]
const FACTS = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] }

describe('규칙 전달', () => {
  test('시스템 프롬프트 끝에 주석·플랜 규칙을 session 구획으로 붙인다', async ($, on) => {
    const reads: string[] = []
    on('fs.read', ($$, e) => {
      reads.push(e.path)
      return { value: `  글:${e.path}\n` }
    })
    on('prompt.compose', () => ({ sections: BASE }))
    const { sections } = await $.prompt.compose(FACTS)
    expect(sections.map(s => s.id)).toEqual(['intro', ...RULES.map(r => r.id)])
    expect(sections.slice(1).every(s => s.scope === 'session')).toBe(true)
    expect(sections[1]?.text).toBe(`글:${reads[0]}`)
    expect(reads.map(p => p.replace(/^.*[\\/]rules[\\/]/, 'rules/'))).toEqual(RULES.map(r => r.file))
  })

  test('파일은 한 번만 읽는다', async ($, on) => {
    let n = 0
    on('fs.read', () => {
      n++
      return { value: '글' }
    })
    on('prompt.compose', () => ({ sections: BASE }))
    await $.prompt.compose(FACTS)
    await $.prompt.compose(FACTS)
    expect(n).toBe(RULES.length)
  })

  test('규칙 파일을 못 읽으면 프롬프트를 그대로 둔다', async ($, on) => {
    on('fs.read', () => {
      throw new Error('ENOENT')
    })
    on('prompt.compose', () => ({ sections: BASE }))
    expect((await $.prompt.compose(FACTS)).sections).toEqual(BASE)
  })
})
