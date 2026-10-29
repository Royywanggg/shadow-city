import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('.visual/twilight-performance/report.json')
const chromePath = process.env.SHADOW_CITY_CHROME ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const base = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5174/')
const seed = 'shadow-city-hero-01'
const visualTime = '18:00'
const viewport = { width: 1440, height: 900 }
const sampleDurationMs = 3000

function percentile(values, fraction) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil(sorted.length * fraction) - 1]
}

function classifyRenderer(renderer) {
  const description = `${renderer.unmaskedRenderer ?? ''} ${renderer.unmaskedVendor ?? ''}`
  if (/swiftshader|software|llvmpipe|softpipe/i.test(description)) return 'software'
  if (/apple|metal/i.test(description)) return 'apple_gpu'
  if (renderer.unmaskedRenderer) return 'other_hardware'
  return 'unknown'
}

function caseUrl(world, population) {
  const url = new URL(base)
  url.searchParams.set('world', world)
  url.searchParams.set('seed', seed)
  url.searchParams.set('population', String(population))
  url.searchParams.set('quality', 'high')
  url.searchParams.set('post', 'on')
  url.searchParams.set('lookdev', 'final')
  url.searchParams.set('visualTime', visualTime)
  url.searchParams.set('test', '1')
  return url
}

async function measureCase(browser, world, population) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push({ type: 'console', message: message.text() })
    }
  })
  page.on('requestfailed', (request) => errors.push({ type: 'requestfailed',
    message: `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown'}` }))
  const url = caseUrl(world, population)
  const result = { world, population, url: url.toString(), errors }

  try {
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForFunction((count) => {
      const snapshot = window.__shadowCityV06?.getSnapshot()
      return snapshot?.tick === 100 && snapshot.state.citizens.length === count &&
        Boolean(window.__shadowCityDiagnostics)
    }, population, { timeout: 60_000 })
    await page.getByRole('button', { name: 'Collapse population' }).click()
    await page.waitForTimeout(800)

    result.browser = await page.evaluate(() => ({ userAgent: navigator.userAgent,
      userAgentDataPlatform: navigator.userAgentData?.platform ?? null }))
    result.webgl = await page.evaluate(() => {
      const gl = document.querySelector('.v06-viewport canvas')?.getContext('webgl2')
      if (!gl) return { api: null, maskedRenderer: null, maskedVendor: null,
        unmaskedRenderer: null, unmaskedVendor: null }
      const extension = gl.getExtension('WEBGL_debug_renderer_info')
      return { api: gl.getParameter(gl.VERSION),
        maskedRenderer: gl.getParameter(gl.RENDERER),
        maskedVendor: gl.getParameter(gl.VENDOR),
        unmaskedRenderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
        unmaskedVendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : null }
    })
    result.rendererKind = classifyRenderer(result.webgl)

    const tickDurationsMs = await page.evaluate(() => window.__shadowCityV06.advanceToTick(200))
    await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot().tick === 200 &&
      window.__shadowCityV06Agents?.tick === 200, undefined, { timeout: 60_000 })
    result.tickAdvance = { fromTick: 100, toTick: 200, count: tickDurationsMs.length,
      p50Ms: percentile(tickDurationsMs, 0.5), p95Ms: percentile(tickDurationsMs, 0.95) }
    await page.waitForTimeout(800)

    await page.getByRole('button', { name: 'PLAY', exact: true }).click()
    await page.waitForTimeout(300)
    const frames = await page.evaluate(async (durationMs) => {
      const stamps = []
      const firstRendered = window.__shadowCityDiagnostics?.renderedFrames ?? null
      const firstTick = window.__shadowCityV06.getSnapshot().tick
      const started = performance.now()
      while (performance.now() - started < durationMs) {
        stamps.push(await new Promise((done) => requestAnimationFrame(done)))
      }
      const ended = performance.now()
      const diagnostic = window.__shadowCityDiagnostics
      return { stamps, elapsedMs: ended - started, firstRendered,
        lastRendered: diagnostic?.renderedFrames ?? null, firstTick,
        lastTick: window.__shadowCityV06.getSnapshot().tick,
        rendering: diagnostic ? {
          drawCalls: diagnostic.drawCalls, triangles: diagnostic.triangles,
          geometries: diagnostic.geometries, textures: diagnostic.textures,
          shaderPrograms: diagnostic.shaderPrograms,
          sampledFrames: diagnostic.sampledFrames,
        } : null }
    }, sampleDurationMs)
    await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
    const intervals = frames.stamps.slice(1).map((stamp, index) => stamp - frames.stamps[index])
    const renderedCount = frames.firstRendered === null || frames.lastRendered === null
      ? null : frames.lastRendered - frames.firstRendered
    result.frameSample = { durationMs: frames.elapsedMs,
      requestAnimationFrameCount: frames.stamps.length,
      requestAnimationFrameAverageFps: frames.stamps.length > 1 ?
        1000 * (frames.stamps.length - 1) /
          (frames.stamps.at(-1) - frames.stamps[0]) : null,
      requestAnimationFrameP95IntervalMs: percentile(intervals, 0.95),
      renderedFrameCount: renderedCount,
      averageRenderedFps: renderedCount === null ? null :
        renderedCount * 1000 / frames.elapsedMs,
      tickBefore: frames.firstTick, tickAfter: frames.lastTick,
      drawCalls: frames.rendering?.drawCalls ?? null,
      triangles: frames.rendering?.triangles ?? null,
      rendering: frames.rendering }
    result.replay500 = await page.evaluate(() => window.__shadowCityV06.benchmarkReplay500())
    result.jsHeap = await page.evaluate(() => ({
      usedJSHeapBytes: performance.memory?.usedJSHeapSize ?? null,
      source: performance.memory ? 'Chrome performance.memory' : 'unavailable',
    }))
    result.status = errors.length === 0 ? 'ok' : 'browser_errors'
  } catch (error) {
    result.status = 'failed'
    result.failure = error instanceof Error ? error.message : String(error)
  } finally {
    await page.close()
  }
  return result
}

const report = { recordedAtUtc: new Date().toISOString(),
  baseUrl: base.origin, chromeExecutable: chromePath,
  viewport, deviceScaleFactor: 1, seed, visualTime,
  conditions: 'Serial real Chrome pages; high quality and final look; population sidebar collapsed; Tick 100 initial state, Tick 100-200 advance timing, then 3 seconds of playback frame sampling; Replay500 measured after playback sampling.',
  frameNote: 'The p95 frame interval uses requestAnimationFrame timestamps. Average rendered FPS uses RenderDiagnostics renderedFrames; rAF pacing FPS is reported separately.',
  memoryNote: 'usedJSHeapBytes is JavaScript heap only. No GPU memory estimate is reported.',
  cases: [] }
let browser
try {
  if (!existsSync(chromePath)) throw new Error(`Google Chrome executable not found: ${chromePath}`)
  browser = await chromium.launch({ headless: true, executablePath: chromePath,
    args: ['--enable-webgl'] })
  report.chromeVersion = browser.version()
  for (const world of ['main', 'dev']) {
    for (const population of [100, 200]) {
      report.cases.push(await measureCase(browser, world, population))
    }
  }
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error)
} finally {
  if (browser) await browser.close()
  await mkdir(resolve('.visual/twilight-performance'), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2) + '\n')
}

console.log(JSON.stringify(report, null, 2))
if (report.failure || report.cases.some((sample) => sample.status !== 'ok')) {
  throw new Error('Twilight performance verification did not complete cleanly; see report.json')
}
