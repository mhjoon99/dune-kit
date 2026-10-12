// README 이미지 생성: hooks/format.ts 의 실제 색·게이지·배치로 HTML 을 만들고 Edge headless 로 PNG 캡처.
// 실행: node plugins/neon-bubble/assets/render.mjs  (Node 22.6+ 의 TS 타입 제거, Windows 의 msedge 필요)
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { C, MODEL_ICON, gauge, percentStyle, planBand } = await import(pathToFileURL(join(here, '../hooks/format.ts')).href)

const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9333

const DATA = {
  model: 'Opus 5.5',
  branch: 'feat/statusline',
  diff: { added: 12, removed: 3 },
  project: 'interweb-api',
  ctxPercent: 62,
  costUsd: 1.84,
  elapsed: '42m',
  forecast: '⏳ ~4턴',
  five: { percent: 81, reset: '1h23m' },
  seven: { percent: 24, reset: '2d18h' },
  fable: { percent: 40, reset: '2d05h' },
}

// ── 조각: 상태 띠와 같은 색으로 텍스트를 그린다 ───────────────

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const EMOJI = /(\p{Extended_Pictographic}\uFE0F?)/gu
const t = (text, color = C.text, extra = '') =>
  `<span style="color:${color};${extra}">${esc(text).replace(EMOJI, '<span class="emoji">$1</span>')}</span>`
const sep = () => t('  ✧  ', C.sub, 'opacity:.7')
const gap = () => t('   ')
const meter = (percent, cells) => {
  const style = percentStyle(percent)
  return gauge(percent, cells).map(c => t(c.glyph, c.color)).join('') + t(` ${Math.round(percent)}%`, style.color, style.bold ? 'font-weight:700' : '')
}

const parts = {
  model: () => t(`${MODEL_ICON} ${DATA.model}`),
  branch: () => t(`🔮 ${DATA.branch}`),
  diff: () => t(` +${DATA.diff.added}`, C.add) + t(` −${DATA.diff.removed}`, C.del),
  project: () => t(`🫧 ${DATA.project}`),
  ctx: cells => t('🧠 ') + meter(DATA.ctxPercent, cells),
  forecast: () => t(` · ${DATA.forecast}`, C.sub),
  cost: () => t(`💎 $${DATA.costUsd.toFixed(2)}`),
  elapsed: () => t(`🌙 ${DATA.elapsed}`),
  five: cells => t('🚀 5h ') + meter(DATA.five.percent, cells),
  reset: r => t(` ↻ ${r}`, C.sub),
  seven: cells => t('🪐 7d ') + meter(DATA.seven.percent, cells),
  fable: cells => t('🪶 Fable ') + meter(DATA.fable.percent, cells),
}

/** register.tsx 의 drawBand 와 같은 순서·생략 규칙으로 3행을 만든다. */
function band(plan) {
  const row1 = [parts.model(), sep(), parts.branch() + parts.diff()]
  if (plan.showProject) row1.push(sep(), parts.project())
  const row2 = [parts.ctx(plan.cells) + parts.forecast()]
  if (plan.showCost) row2.push(gap(), parts.cost())
  if (plan.showElapsed) row2.push(gap(), parts.elapsed())
  const week = r => (plan.showWeekReset ? parts.reset(r) : '')
  const row3 = [
    parts.five(plan.cells) + parts.reset(DATA.five.reset),
    gap(),
    parts.seven(plan.smallCells) + week(DATA.seven.reset),
    gap(),
    parts.fable(plan.smallCells) + week(DATA.fable.reset),
  ]
  return [row1, row2, row3].map(r => `<div class="row">${r.join('')}</div>`).join('')
}

/** 설명 달린 한 행: 각 조각 아래에 └─┘ 괄호와 이름표. */
function annotated(segs) {
  return `<div class="ann">${segs
    .map(([html, label, color = '#8b85a8']) =>
      label === undefined
        ? `<div class="seg"><div class="code">${html}</div></div>`
        : `<div class="seg"><div class="code">${html}</div><div class="brace" style="border-color:${color}"></div><div class="lab" style="color:${color}">${label}</div></div>`,
    )
    .join('')}</div>`
}

const prompt = `<div class="prompt"><span style="color:${C.sub}">❯</span> <span class="caret"></span></div>`

const card = (body, { title, prompt: withPrompt = false } = {}) => `
  <div class="card">
    ${title === undefined ? '' : `<div class="bar"><i></i><i></i><i></i><span>${title}</span></div>`}
    <div class="body">${body}${withPrompt ? prompt : ''}</div>
  </div>`

const full = planBand(DATA, 120)
const narrow = planBand(DATA, 72)

const IMAGES = {
  band: card(band(full), { title: 'claude', prompt: true }),
  row1: card(
    annotated([
      [parts.model(), '모델 표시 이름', '#e0c3ff'],
      [sep()],
      [parts.branch(), 'git 브랜치', '#b388ff'],
      [parts.diff(), '변경 줄수', '#5ce1e6'],
      [sep()],
      [parts.project(), '프로젝트 폴더', '#ff6ac1'],
    ]),
    { title: '1행 · 모델 / 브랜치 / 폴더' },
  ),
  row2: card(
    annotated([
      [parts.ctx(12), '컨텍스트 사용률 (12칸)', '#e0c3ff'],
      [parts.forecast(), '가득 찰 때까지 남은 턴', '#b388ff'],
      [gap()],
      [parts.cost(), '세션 비용', '#5ce1e6'],
      [gap()],
      [parts.elapsed(), '경과 시간', '#ff6ac1'],
    ]),
    { title: '2행 · 컨텍스트 / 남은 턴 / 비용 / 경과' },
  ),
  row3: card(
    annotated([
      [parts.five(12), '5시간 한도', '#e0c3ff'],
      [parts.reset(DATA.five.reset), '리셋까지', C.sub],
      [gap()],
      [parts.seven(6) + parts.reset(DATA.seven.reset), '7일 한도 · 리셋까지', '#b388ff'],
      [gap()],
      [parts.fable(6) + parts.reset(DATA.fable.reset), 'Fable 주간 한도', '#5ce1e6'],
    ]),
    { title: '3행 · 레이트리밋 (구독일 때만)' },
  ),
  colors: card(
    `<div class="legend">
      <div class="li"><div class="code">${gauge(100, 12).map(c => t('●', c.color)).join('')}</div><div class="desc">채운 칸 — 칸 위치마다 <b style="color:#ff6ac1">#ff6ac1</b> → <b style="color:#b388ff">#b388ff</b> → <b style="color:#5ce1e6">#5ce1e6</b></div></div>
      <div class="li"><div class="code">${gauge(0, 12).map(c => t('○', c.color)).join('')}</div><div class="desc">빈 칸 — <b style="color:#8b85a8">#3d3a4a</b></div></div>
      <div class="li"><div class="code">${meter(62, 6)}</div><div class="desc">80% 미만</div></div>
      <div class="li"><div class="code">${meter(81, 6)}</div><div class="desc">80% 이상 — 주황</div></div>
      <div class="li"><div class="code">${meter(96, 6)}</div><div class="desc">95% 이상 — 빨강 굵게</div></div>
    </div>`,
    { title: '색 · 배경 없이 글자색만' },
  ),
  narrow: `<div class="stack">
    <div class="cap">넓을 때 · 120칸</div>${card(band(full))}
    <div class="cap">좁을 때 · 72칸 — 게이지 6칸, 주간 리셋 생략</div>${card(band(narrow))}
  </div>`,
}

const CSS = `
  * { box-sizing: border-box; margin: 0; }
  html, body { background: transparent; }
  body { padding: 24px; font-family: 'Malgun Gothic', sans-serif; }
  #shot { display: inline-block; padding: 2px; }
  .card { display: inline-block; background: #17141f; border: 1px solid #2c2740; border-radius: 12px; overflow: hidden;
          box-shadow: 0 8px 24px rgba(10, 6, 20, .35); }
  .bar { display: flex; align-items: center; gap: 7px; padding: 10px 14px; background: #1f1b2b; border-bottom: 1px solid #2c2740; }
  .bar i { width: 11px; height: 11px; border-radius: 50%; background: #ff6ac1; }
  .bar i:nth-child(2) { background: #b388ff; }
  .bar i:nth-child(3) { background: #5ce1e6; }
  .bar span { margin-left: 8px; color: #8b85a8; font-size: 12.5px; letter-spacing: .02em; }
  .body { padding: 16px 22px 18px; }
  .row, .code { font-family: 'JetBrainsMono Nerd Font', 'JetBrains Mono', Consolas, 'Malgun Gothic', monospace;
                font-size: 16px; line-height: 1.75; white-space: pre; }
  .emoji { font-family: 'Segoe UI Emoji'; }
  .prompt { margin-top: 12px; padding: 8px 12px; border: 1px solid #3a3452; border-radius: 8px;
            font-family: 'JetBrainsMono Nerd Font', Consolas, monospace; font-size: 15px; }
  .caret { display: inline-block; width: 8px; height: 16px; background: #e0c3ff; vertical-align: -3px; opacity: .8; }
  .ann { display: flex; align-items: flex-start; }
  .seg { display: flex; flex-direction: column; align-items: stretch; }
  .brace { height: 7px; margin: 2px 2px 0; border: 1.5px solid; border-top: none; border-radius: 0 0 4px 4px; opacity: .85; }
  .lab { margin-top: 5px; padding: 0 4px; font-size: 12.5px; text-align: center; white-space: nowrap; }
  .legend { display: grid; grid-template-columns: auto auto; column-gap: 22px; row-gap: 2px; align-items: center; }
  .li { display: contents; }
  .desc { color: #c9c3e0; font-size: 13.5px; }
  .desc b { font-family: Consolas, monospace; font-weight: 600; }
  .stack { display: flex; flex-direction: column; align-items: flex-start; }
  .cap { color: #8b85a8; font-size: 13px; margin: 14px 0 6px 2px; }
  .cap:first-child { margin-top: 0; }
  .stack .card { box-shadow: none; }
`

const page = body => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="shot">${body}</div></body></html>`

// ── Edge headless + DevTools 프로토콜로 #shot 영역만 2배율 캡처 ──

const profile = mkdtempSync(join(tmpdir(), 'neon-shot-'))
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })

try {
  let target
  for (let i = 0; i < 50 && target === undefined; i += 1) {
    await new Promise(r => setTimeout(r, 200))
    const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json()).catch(() => [])
    target = list.find(x => x.type === 'page')
  }
  if (target === undefined) throw new Error('Edge DevTools 에 연결하지 못했어요')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((ok, fail) => ((ws.onopen = ok), (ws.onerror = fail)))
  let seq = 0
  const waiting = new Map()
  const events = []
  ws.onmessage = m => {
    const msg = JSON.parse(m.data)
    if (msg.id !== undefined) waiting.get(msg.id)?.(msg)
    else events.push(msg.method)
  }
  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      const id = (seq += 1)
      waiting.set(id, msg => (msg.error ? fail(new Error(`${method}: ${msg.error.message}`)) : ok(msg.result)))
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false })
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } })

  for (const [name, body] of Object.entries(IMAGES)) {
    const html = join(profile, `${name}.html`)
    writeFileSync(html, page(body))
    events.length = 0
    await send('Page.navigate', { url: pathToFileURL(html).href })
    for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i += 1) await new Promise(r => setTimeout(r, 50))
    const { result } = await send('Runtime.evaluate', {
      expression: `document.fonts.ready.then(() => JSON.stringify(document.getElementById('shot').getBoundingClientRect()))`,
      awaitPromise: true,
      returnByValue: true,
    })
    const r = JSON.parse(result.value)
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: r.x - 16, y: r.y - 8, width: Math.ceil(r.width) + 32, height: Math.ceil(r.height) + 24, scale: 1 },
    })
    writeFileSync(join(here, `${name}.png`), Buffer.from(data, 'base64'))
    console.log(`${name}.png  ${Math.ceil(r.width) + 32}x${Math.ceil(r.height) + 24} (css px, 2배율 저장)`)
  }
  ws.close()
} finally {
  edge.kill()
  await new Promise(r => setTimeout(r, 500))
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 })
}
