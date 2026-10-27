import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.SHADOW_CITY_CHROME ??
  (process.platform === 'darwin' && existsSync(chromePath) ? chromePath : undefined)
const url = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/')
url.searchParams.set('seed', 'shadow-city-hero-01')
url.searchParams.set('population', process.env.SHADOW_CITY_POPULATION ?? '100')
const output = resolve('docs/screenshots')
const population = url.searchParams.get('population')
const habitsEnabled = url.searchParams.get('habits') !== 'off'
const prefix = `${habitsEnabled ? 'habits' : 'legacy'}-p${population}`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath,
  args: ['--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
const percentile = (items, ratio) => {
  const sorted = [...items].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? null
}
try {
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100,
    undefined, { timeout: 60_000 })
  await page.waitForTimeout(1000)
  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector('.v06-viewport canvas')
    const gl = canvas?.getContext('webgl2')
    const extension = gl?.getExtension('WEBGL_debug_renderer_info')
    return { name: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
      api: gl?.getParameter(gl.VERSION) ?? null }
  })
  const initial = await page.evaluate(() => {
    const state = window.__shadowCityV06.getSnapshot().state
    return { tick: state.tick, habitCitizens: state.habits?.citizens.length ?? 0,
      decisions: state.habits?.citizens.reduce((sum, item) => sum + item.decisions.length, 0) ?? 0,
      activities: state.habits?.citizens.reduce((sum, item) => sum + item.history.length, 0) ?? 0 }
  })
  await page.screenshot({ path: resolve(output, `${prefix}-hero-tick100-1440x900.png`) })
  await page.locator('[data-agent-id="citizen-0000"]').click()
  let decisionText = ''
  if (habitsEnabled) {
    await page.getByRole('button', { name: 'ROUTINE', exact: true }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: resolve(output, `${prefix}-routine-tick100-1440x900.png`) })
    await page.getByRole('button', { name: 'DECISIONS', exact: true }).click()
    decisionText = await page.locator('.v06-inspector').innerText()
    await page.locator('.v06-research-card').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(output, `${prefix}-decision-tick100-1440x900.png`) })
  }
  const durations = await page.evaluate(() => window.__shadowCityV06.advanceToTick(200))
  const final = await page.evaluate(() => {
    const state = window.__shadowCityV06.getSnapshot().state
    return { tick: state.tick, decisions: state.habits?.citizens.reduce((sum, item) =>
      sum + item.decisions.length, 0) ?? 0,
      activities: state.habits?.citizens.reduce((sum, item) =>
        sum + item.history.length, 0) ?? 0 }
  })
  if (habitsEnabled) {
    await page.getByRole('button', { name: 'HABITS', exact: true }).click()
    await page.locator('.v06-research-list').last().scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(output, `${prefix}-evolution-tick200-1440x900.png`) })
  }
  await page.getByRole('button', { name: 'PLAY', exact: true }).click()
  const stamps = await page.evaluate(async () => {
    const times = []
    const until = performance.now() + 3000
    while (performance.now() < until) {
      await new Promise((done) => requestAnimationFrame(done))
      times.push(performance.now())
    }
    return times
  })
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  const frameIntervals = stamps.slice(1).map((time, index) => time - stamps[index])
  const rendering = await page.evaluate(() => window.__shadowCityDiagnostics ??
    window.__shadowCityV06Rendering ?? null)
  const usedJsHeapBytes = await page.evaluate(() =>
    performance.memory?.usedJSHeapSize ?? null)
  const report = { date: new Date().toISOString(), url: url.toString(),
    browserVersion: browser.version(), viewport: '1440x900', dpr: 1,
    renderer, gpuKind: renderer.name === null ? 'unknown' :
      /swiftshader|software|llvmpipe/i.test(renderer.name) ? 'software' : 'hardware',
    initial, final, decisionPanelGrounded: habitsEnabled && decisionText.includes('candidates evaluated') &&
      decisionText.includes('needs'), errors, rendering, usedJsHeapBytes,
    tickMs: { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95) },
    frames: { count: stamps.length,
      meanFps: stamps.length > 1 ? 1000 * (stamps.length - 1) /
        (stamps.at(-1) - stamps[0]) : null,
      p50IntervalMs: percentile(frameIntervals, 0.5),
      p95IntervalMs: percentile(frameIntervals, 0.95) },
    screenshots: [`${prefix}-hero-tick100-1440x900.png`,
      ...(habitsEnabled ? [`${prefix}-routine-tick100-1440x900.png`,
        `${prefix}-decision-tick100-1440x900.png`,
        `${prefix}-evolution-tick200-1440x900.png`] : [])] }
  await writeFile(resolve(output, `${prefix}-browser-results.json`),
    JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
} finally {
  await browser.close()
}
