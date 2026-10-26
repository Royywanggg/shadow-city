import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const output = resolve(process.env.SHADOW_CITY_OUTPUT ?? '.visual/architecture-upgrade')
const baselineMode = process.env.SHADOW_CITY_BASELINE === '1'
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SHADOW_CITY_CHROME ??
    (process.platform === 'darwin' && existsSync(chromePath) ? chromePath : undefined),
  args: ['--enable-webgl'],
})
await mkdir(output, { recursive: true })

const base = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/')
base.searchParams.set('seed', 'shadow-city-hero-01')
base.searchParams.set('population', '200')
base.searchParams.set('test', '1')
const errors = []
const captures = []

async function openScene(name, parameters = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  page.on('pageerror', (error) => errors.push(`${name}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${name}: ${message.text()}`)
  })
  const url = new URL(base)
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
  await page.goto(url.toString(), { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot().tick === 100)
  await page.waitForTimeout(500)
  return page
}

async function capture(page, name) {
  await page.screenshot({ path: resolve(output, `${name}.png`) })
  captures.push(name)
}

async function rendererInfo(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.v06-viewport canvas')
    const context = canvas?.getContext('webgl2')
    const extension = context?.getExtension('WEBGL_debug_renderer_info')
    return {
      renderer: context?.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER) ?? null,
      gpuTimerQueryAvailable: Boolean(context?.getExtension('EXT_disjoint_timer_query_webgl2')),
      diagnostic: window.__shadowCityDiagnostics ?? window.__shadowCityV06Rendering ?? null,
      tick: window.__shadowCityV06?.getSnapshot().tick,
    }
  })
}

async function sampleFrames(page) {
  await page.getByRole('button', { name: 'PLAY', exact: true }).click()
  const frames = await page.evaluate(async () => {
    const timestamps = []
    const started = performance.now()
    while (performance.now() - started < 2500) {
      await new Promise((next) => requestAnimationFrame(next))
      timestamps.push(performance.now())
    }
    return timestamps
  })
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  const intervals = frames.slice(1).map((time, index) => time - frames[index]).sort((a, b) => a - b)
  return {
    averageFps: frames.length / ((frames.at(-1) - frames[0]) / 1000),
    frameP50Ms: intervals[Math.ceil(intervals.length * 0.5) - 1],
    frameP95Ms: intervals[Math.ceil(intervals.length * 0.95) - 1],
    frameSamples: intervals.length,
    rendering: (await rendererInfo(page)).diagnostic,
  }
}

const report = { browser: null, seed: 'shadow-city-hero-01', viewport: '1440x900', dpr: 1,
  population: 200, comparisons: {}, captures, errors,
  gpuFrameTime: 'unavailable: no validated timer-query capture', textureMemoryBytes: 'unavailable' }
try {
  const high = await openScene('high', { quality: 'high', post: 'on', lighting: 'night' })
  const initialRendererInfo = await rendererInfo(high)
  report.browser = initialRendererInfo.renderer
  report.gpuTimerQueryAvailable = initialRendererInfo.gpuTimerQueryAvailable
  if (!report.browser || /swiftshader|software|llvmpipe/i.test(report.browser)) {
    throw new Error(`Hardware WebGL renderer unavailable: ${report.browser}`)
  }
  await capture(high, 'high-hero-sidebar-tick100')
  await high.getByRole('button', { name: 'Collapse population' }).click()
  await high.waitForTimeout(500)
  await capture(high, 'high-hero-open-tick100')
  const target = await high.evaluate(() => {
    const city = window.__shadowCityV06.getWorld().baseCity
    const building = city.buildings.filter((item) => item.kind === 'commercial')
      .sort((a, b) => Math.hypot(a.x - city.plaza.x, a.z - city.plaza.z) -
        Math.hypot(b.x - city.plaza.x, b.z - city.plaza.z))[0]
    return { id: building.id, x: building.x, y: 4, z: building.z }
  })
  report.closeTarget = target
  await high.evaluate(({ x, y, z }) => window.__shadowCityV06.inspectAtWorld(x, y, z), target)
  await high.waitForTimeout(950)
  await capture(high, 'high-architecture-close-tick100')
  await high.getByRole('slider', { name: 'Pitch control' }).fill('65')
  await high.waitForTimeout(350)
  await capture(high, 'high-low-angle-tick100')
  await high.getByRole('button', { name: 'Compass: north up' }).click()
  for (const bearing of [0, 90, 180, 270]) {
    if (bearing) {
      for (let turn = 0; turn < 6; turn += 1) {
        await high.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
      }
    }
    await high.waitForTimeout(180)
    await capture(high, `high-close-bearing-${bearing}-tick100`)
  }
  await high.getByRole('button', { name: 'RESET VIEW' }).click()
  await high.waitForTimeout(450)
  report.comparisons.high = await sampleFrames(high)
  await high.close()

  if (!baselineMode) {
  const street = await openScene('street', { quality: 'high', cameraDiagnostic: 'street' })
  await street.getByRole('button', { name: 'Collapse population' }).click()
  await street.evaluate(({ x, z }) => window.__shadowCityV06.inspectAtWorld(x, 1.6, z), target)
  await street.waitForTimeout(900)
  await street.getByRole('slider', { name: 'Pitch control' }).fill('65')
  await street.mouse.move(860, 550)
  await street.mouse.down({ button: 'right' })
  await street.mouse.move(860, 380, { steps: 12 })
  await street.mouse.up({ button: 'right' })
  await street.waitForTimeout(350)
  report.streetPitch = await street.evaluate(() => window.__shadowCityV06.getCameraView().pitchDeg)
  if (report.streetPitch < 74) throw new Error(`Street diagnostic pitch not reached: ${report.streetPitch}`)
  await capture(street, 'high-street-diagnostic-tick100')
  await street.close()

  for (const [name, parameters] of Object.entries({
    noPost: { quality: 'high', post: 'off' },
    aoOn: { quality: 'high', post: 'on', ao: 'on' },
    acesTone: { quality: 'high', post: 'on', tone: 'aces' },
    brighterExposure: { quality: 'high', post: 'on', exposure: '1.45' },
    low: { quality: 'low', post: 'off' },
    noShadows: { quality: 'high', post: 'off', shadows: 'off' },
    dayDiagnostic: { quality: 'high', post: 'off', lighting: 'day' },
  })) {
    const page = await openScene(name, parameters)
    await page.getByRole('button', { name: 'Collapse population' }).click()
    await page.waitForTimeout(350)
    await capture(page, `${name}-hero-open-tick100`)
    if (name === 'noPost' || name === 'dayDiagnostic' || name === 'aoOn') {
      await page.evaluate(({ x, y, z }) => window.__shadowCityV06.inspectAtWorld(x, y, z), target)
      await page.waitForTimeout(900)
      await capture(page, `${name}-architecture-close-tick100`)
    }
    await page.getByRole('button', { name: 'RESET VIEW' }).click()
    await page.waitForTimeout(450)
    report.comparisons[name] = await sampleFrames(page)
    await page.close()
  }
  }
  await writeFile(resolve(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`)
  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`)
  console.log(JSON.stringify({ renderer: report.browser, comparisons: report.comparisons,
    captures: captures.length, errors }, null, 2))
} finally {
  await browser.close()
}
