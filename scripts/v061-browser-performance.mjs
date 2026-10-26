import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.SHADOW_CITY_CHROME ??
  (process.platform === 'darwin' && existsSync(chromePath) ? chromePath : undefined)
const browser = await chromium.launch({ headless: true, executablePath,
  args: ['--enable-webgl'] })
const baseUrl = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/')
baseUrl.searchParams.set('seed', 'shadow-city-hero-01')
baseUrl.searchParams.set('test', '1')
const reportPath = resolve('docs/screenshots/v061-browser-results.json')
const result = { dateUtc: new Date().toISOString(),
  conditions: 'Serial Chrome pages; no parallel Vitest or browser workload; 1440x900 DPR 1; resident citizen-0015 selected; Tick 200 before frame sampling; 3-second rAF sample while playing.',
  samples: [] }

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? null
}

try {
  for (const population of [120, 200]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1 })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    const url = new URL(baseUrl)
    url.searchParams.set('population', String(population))
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForFunction((count) => window.__shadowCityV06Agents?.tick === 100 &&
      window.__shadowCityV06.getSnapshot().state.citizens.length === count,
    population, { timeout: 60000 })
    await page.locator('[data-agent-id="citizen-0015"]').click()
    await page.waitForTimeout(2500)
    const ticks = await page.evaluate(() => window.__shadowCityV06.advanceToTick(200))
    await page.waitForFunction(() => document.querySelector('.v06-bottom')?.textContent?.includes('TICK 200'))
    await page.waitForTimeout(2500)
    const renderer = await page.evaluate(() => {
      const gl = document.querySelector('.v06-viewport canvas')?.getContext('webgl2')
      const extension = gl?.getExtension('WEBGL_debug_renderer_info')
      return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null
    })
    await page.getByRole('button', { name: 'PLAY', exact: true }).click()
    const times = await page.evaluate(async () => {
      const stamps = []
      const until = performance.now() + 3000
      while (performance.now() < until) {
        await new Promise((done) => requestAnimationFrame(done))
        stamps.push(performance.now())
      }
      return stamps
    })
    await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
    const intervals = times.slice(1).map((time, index) => time - times[index])
    const sample = { population, renderer,
      gpuKind: renderer === null ? 'unknown' :
        /swiftshader|software|llvmpipe/i.test(renderer) ? 'software' : 'hardware',
      fps: times.length > 1 ? 1000 * (times.length - 1) / (times.at(-1) - times[0]) : null,
      p95FrameIntervalMs: p95(intervals), frameCount: times.length,
      p95AdvanceTickMs: p95(ticks),
      rendering: await page.evaluate(() => window.__shadowCityDiagnostics ??
        window.__shadowCityV06Rendering ?? null),
      finalTick: await page.evaluate(() => window.__shadowCityV06.getSnapshot().tick),
      renderedAgentTick: await page.evaluate(() => window.__shadowCityV06Agents?.tick ?? null),
      usedJsHeapBytes: await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null),
      errors }
    result.samples.push(sample)
    await page.close()
  }
  const existing = JSON.parse(await readFile(reportPath, 'utf8'))
  existing.quietPerformance = result
  existing.performanceCaveat = 'Earlier renderPerformance and population200 samples overlapped a parallel Vitest run; use quietPerformance for the controlled 120/200 comparison.'
  await writeFile(reportPath, JSON.stringify(existing, null, 2) + '\n')
  console.log(JSON.stringify(result, null, 2))
  if (result.samples.some((sample) => sample.errors.length > 0)) {
    throw new Error('Browser console reported errors during performance sampling')
  }
} finally {
  await browser.close()
}
