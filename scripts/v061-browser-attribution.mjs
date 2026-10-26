import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.SHADOW_CITY_CHROME ??
  (process.platform === 'darwin' && existsSync(chromePath) ? chromePath : undefined)
const browser = await chromium.launch({ headless: true, executablePath,
  args: ['--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1 })
const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
const url = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/')
url.searchParams.set('seed', 'shadow-city-hero-01')
url.searchParams.set('population', '200')
url.searchParams.set('test', '1')
const result = { dateUtc: new Date().toISOString(),
  conditions: 'One Chrome 156 page, Apple M4 hardware WebGL, fixed seeds, population 200, 1440x900 DPR 1. Initial Tick 200; cases run serially with 1.5-second settle and 3-second rAF samples. No concurrent test or browser workload.',
  samples: [], errors }

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? null
}

async function metrics() {
  const response = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(response.metrics.map((metric) => [metric.name, metric.value]))
}

async function sample(name, selected, playing) {
  const isSelected = await page.locator('.v06-inspector').count() > 0
  if (selected && !isSelected) await page.locator('[data-agent-id="citizen-0015"]').click()
  if (!selected && isSelected) await page.getByRole('button', { name: 'Clear selection' }).click()
  await page.waitForTimeout(1500)
  const before = await metrics()
  const startTick = await page.evaluate(() => window.__shadowCityV06.getSnapshot().tick)
  const simulationSpeed = await page.getByRole('combobox', { name: 'Simulation speed' }).inputValue()
  if (simulationSpeed !== '1') throw new Error('Attribution requires 1x simulation speed')
  if (playing) await page.getByRole('button', { name: 'PLAY', exact: true }).click()
  const observed = await page.evaluate(async () => {
    const longTasks = []
    let observer = null
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration)
      })
      observer.observe({ entryTypes: ['longtask'] })
    } catch { /* Some Chrome builds omit Long Tasks API. */ }
    const stamps = []
    const until = performance.now() + 3000
    while (performance.now() < until) {
      await new Promise((done) => requestAnimationFrame(done))
      stamps.push(performance.now())
    }
    observer?.disconnect()
    return { stamps, longTasks }
  })
  if (playing) await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  const after = await metrics()
  const intervals = observed.stamps.slice(1).map((time, index) =>
    time - observed.stamps[index])
  const rendering = await page.evaluate(() => window.__shadowCityDiagnostics ??
    window.__shadowCityV06Rendering ?? null)
  const metricsMs = Object.fromEntries(['TaskDuration', 'ScriptDuration',
    'LayoutDuration', 'RecalcStyleDuration'].map((key) =>
    [key, 1000 * ((after[key] ?? 0) - (before[key] ?? 0))]))
  const sample = { name, selected, playing, simulationSpeed, startTick,
    endTick: await page.evaluate(() => window.__shadowCityV06.getSnapshot().tick),
    renderer: await page.evaluate(() => {
      const gl = document.querySelector('.v06-viewport canvas')?.getContext('webgl2')
      const extension = gl?.getExtension('WEBGL_debug_renderer_info')
      return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null
    }),
    canvasCount: await page.locator('canvas').count(),
    fps: observed.stamps.length > 1 ? 1000 * (observed.stamps.length - 1) /
      (observed.stamps.at(-1) - observed.stamps[0]) : null,
    p95FrameIntervalMs: p95(intervals), frames: observed.stamps.length,
    longTaskCount: observed.longTasks.length,
    longTaskTotalMs: observed.longTasks.reduce((sum, value) => sum + value, 0),
    cdpMainThreadMs: metricsMs, rendering,
    visibleAgents: await page.evaluate(() => {
      const agents = window.__shadowCityV06Agents
      return agents ? { tick: agents.tick, visibleCount: agents.visibleCount,
        farCount: agents.farCount, mediumCount: agents.mediumCount,
        closeCount: agents.closeCount } : null
    }) }
  result.samples.push(sample)
  return sample
}

try {
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => window.__shadowCityV06Agents?.tick === 100 &&
    window.__shadowCityV06.getSnapshot().state.citizens.length === 200,
  undefined, { timeout: 60000 })
  await page.evaluate(() => window.__shadowCityV06.advanceToTick(200))
  await page.waitForFunction(() => document.querySelector('.v06-bottom')?.textContent?.includes('TICK 200'))
  await page.waitForTimeout(2500)
  await sample('paused-unselected', false, false)
  await sample('paused-selected', true, false)
  await sample('playing-selected', true, true)
  await sample('playing-unselected', false, true)
  const isolated = await page.evaluate(async () => {
    const [{ SimulationSessionV5 }, { DEFAULT_SIMULATION_CONFIG_V5 },
      { DEFAULT_ENCOUNTER_SCENARIO_V1 }] = await Promise.all([
      import('/src/simulation/sessionV5.ts'), import('/src/simulation/v5Types.ts'),
      import('/src/simulation/encounter/config.ts')])
    const config = { ...DEFAULT_SIMULATION_CONFIG_V5, populationSize: 200,
      encounter: { ...DEFAULT_ENCOUNTER_SCENARIO_V1,
        social: { ...DEFAULT_ENCOUNTER_SCENARIO_V1.social,
          greetingWillingness: 0.7, conversationWillingness: 0.85,
          diagnosticTraces: true } } }
    const start = performance.now()
    const session = new SimulationSessionV5(window.__shadowCityV06.getWorld(), config)
    const constructionMs = performance.now() - start
    const tickMs = []
    for (let tick = 1; tick <= 224; tick += 1) {
      const started = performance.now()
      session.advanceOneTick()
      if (tick > 100 && tick <= 200) tickMs.push(performance.now() - started)
    }
    return { constructionMs, tickMs, finalTick: session.getSnapshot().tick,
      fingerprint: session.getSnapshot().state.fingerprint }
  })
  result.isolatedSimulation = { constructionMs: isolated.constructionMs,
    measuredTicks: isolated.tickMs.length,
    averageTickMs: isolated.tickMs.reduce((sum, value) => sum + value, 0) /
      isolated.tickMs.length,
    p95TickMs: p95(isolated.tickMs), maxTickMs: Math.max(...isolated.tickMs),
    finalTick: isolated.finalTick, fingerprint: isolated.fingerprint }
  const outputPath = resolve('docs/screenshots/v061-browser-attribution.json')
  await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n')
  const browserReport = resolve('docs/screenshots/v061-browser-results.json')
  const existing = JSON.parse(await readFile(browserReport, 'utf8'))
  existing.performanceAttribution = result
  await writeFile(browserReport, JSON.stringify(existing, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
  if (errors.length > 0) throw new Error('Browser console reported errors')
} finally {
  await browser.close()
}
