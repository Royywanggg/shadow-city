import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve(process.env.SHADOW_CITY_DAY_NIGHT_OUTPUT ?? '.visual/day-night')
const base = process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/'
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const times = ['05:00', '07:00', '12:00', '16:00', '18:30', '21:00', '02:00']
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.SHADOW_CITY_CHROME ?? chromePath,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'] })
const report = { date: new Date().toISOString(), seed: 'shadow-city-hero-01',
  simulationSeed: 'shadow-city-sim-01', viewport: '1440x900', dpr: 1,
  browser: browser.version(), renderer: null, screenshots: [], performance: [],
  checks: {}, errors: [] }

async function openPage(query) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1 })
  page.on('pageerror', (error) => report.errors.push(error.message))
  const url = new URL(base)
  url.searchParams.set('population', String(query.population ?? 100))
  for (const [key, value] of Object.entries(query)) {
    if (key !== 'population') url.searchParams.set(key, String(value))
  }
  await page.goto(url.toString())
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100,
    null, { timeout: 120000 })
  return page
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
}

async function samplePerformance(page) {
  await page.getByRole('button', { name: 'PLAY', exact: true }).click()
  const timestamps = await page.evaluate(async () => {
    const values = []
    const end = performance.now() + 2_000
    while (performance.now() < end) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      values.push(performance.now())
    }
    return values
  })
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  await page.waitForTimeout(200)
  const gaps = timestamps.slice(1).map((time, index) => time - timestamps[index])
    .sort((a, b) => a - b)
  const diagnostics = await page.evaluate(() => window.__shadowCityDiagnostics)
  const tickDurations = await page.evaluate(() => window.__shadowCityV06.advanceToTick(150))
  tickDurations.sort((a, b) => a - b)
  return { averageFps: (timestamps.length - 1) * 1_000 /
      (timestamps.at(-1) - timestamps[0]), frameP50Ms: percentile(gaps, .5),
    frameP95Ms: percentile(gaps, .95), frames: gaps.length, diagnostics,
    tickP50Ms: percentile(tickDurations, .5), tickP95Ms: percentile(tickDurations, .95),
    tickSamples: tickDurations.length }
}

try {
  const page = await openPage({ population: 100 })
  report.renderer = await page.evaluate(() => {
    const canvas = document.querySelector('.v06-viewport canvas')
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
    const extension = gl?.getExtension('WEBGL_debug_renderer_info')
    return { renderer: gl?.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
      timerQuery: Boolean(gl?.getExtension('EXT_disjoint_timer_query_webgl2')) }
  })
  const before = await page.evaluate(() => {
    window.__dayNightStateIdentity = window.__shadowCityV06.getSnapshot().state
    return { tick: window.__shadowCityV06.getSnapshot().tick,
      actualWorldSeconds: window.__shadowCityLighting.actualWorldSeconds }
  })
  for (const time of times) {
    const [hour, minute] = time.split(':').map(Number)
    const expected = (hour * 60 + minute) * 60
    await page.getByLabel('Visual-only time preview').selectOption(String(hour * 60 + minute))
    await page.waitForFunction((seconds) => window.__shadowCityLighting
      ?.renderedWorldSeconds === seconds, expected)
    await page.waitForTimeout(250)
    const name = `hero-${time.replace(':', '')}-1440x900.png`
    await page.screenshot({ path: resolve(output, name) })
    report.screenshots.push({ time, file: name,
      lighting: await page.evaluate(() => window.__shadowCityLighting),
      rendering: await page.evaluate(() => window.__shadowCityDiagnostics) })
  }
  const transition = []
  for (let minute = 17 * 60; minute <= 21 * 60; minute += 15) {
    await page.getByLabel('Visual-only time scrub').evaluate((element, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(element, String(value))
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    }, minute)
    await page.waitForFunction((seconds) => window.__shadowCityLighting
      ?.renderedWorldSeconds === seconds, minute * 60)
    transition.push(await page.evaluate(() => ({ time: window.__shadowCityLighting.renderedWorldSeconds,
      sun: window.__shadowCityLighting.state.sunIntensity,
      windows: window.__shadowCityLighting.state.windowEmission,
      street: window.__shadowCityLighting.state.streetlightIntensity,
      programs: window.__shadowCityDiagnostics?.shaderPrograms ?? null })))
  }
  report.checks.sunsetTransition = { samples: transition.length,
    sunFalls: transition.every((sample, index) => index === 0 ||
      sample.sun <= transition[index - 1].sun + 1e-9),
    windowsRise: transition.every((sample, index) => index === 0 ||
      sample.windows >= transition[index - 1].windows - 1e-9),
    streetlightsRise: transition.every((sample, index) => index === 0 ||
      sample.street >= transition[index - 1].street - 1e-9),
    maximumWindowStep: Math.max(...transition.slice(1).map((sample, index) =>
      Math.abs(sample.windows - transition[index].windows))),
    shaderProgramCounts: [...new Set(transition.map((sample) => sample.programs))] }
  report.checks.previewDoesNotMutateSimulation = await page.evaluate(() =>
    window.__dayNightStateIdentity === window.__shadowCityV06.getSnapshot().state)
  await page.getByLabel('Visual-only time preview').selectOption('world')
  await page.waitForFunction(() => window.__shadowCityLighting?.preview === false)
  report.checks.previewRestoresWorldTime = await page.evaluate(() =>
    window.__shadowCityLighting.renderedWorldSeconds ===
      window.__shadowCityLighting.actualWorldSeconds)
  const sunBeforeCamera = await page.evaluate(() => JSON.stringify(
    window.__shadowCityLighting.sunDirection))
  await page.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
  await page.getByLabel('Pitch control').press('ArrowDown')
  report.checks.cameraDoesNotRotateSun = await page.evaluate((expected) =>
    JSON.stringify(window.__shadowCityLighting.sunDirection) === expected,
  sunBeforeCamera)
  await page.getByRole('button', { name: /RESET VIEW/ }).click()
  report.checks.pausedWorldTimeStable = await page.evaluate(async () => {
    const before = window.__shadowCityLighting.actualWorldSeconds
    await new Promise((resolve) => setTimeout(resolve, 300))
    return before === window.__shadowCityLighting.actualWorldSeconds
  })
  await page.evaluate(() => window.__shadowCityV06.inspectTick(50))
  await page.waitForFunction(() => window.__shadowCityLighting?.actualWorldSeconds === 29_100)
  report.checks.replayRestoresWorldTime = await page.evaluate(() =>
    window.__shadowCityLighting.renderedWorldSeconds === 29_100)
  await page.getByRole('button', { name: 'RETURN LIVE' }).click()
  await page.getByLabel('Simulation speed').selectOption('4')
  await page.getByRole('button', { name: 'PLAY', exact: true }).click()
  await page.waitForTimeout(850)
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  report.checks.fastForwardTracksWorldTime = await page.evaluate(() =>
    window.__shadowCityLighting.renderedWorldSeconds ===
      window.__shadowCityLighting.actualWorldSeconds &&
      window.__shadowCityV06.getSnapshot().tick > 100)
  report.checks.worldTimeBefore = before
  await page.close()

  for (const population of [100, 200]) {
    for (const variant of [
      { name: 'static-night', params: { lighting: 'night' } },
      { name: 'dynamic-no-shadows', params: { visualTime: '21:00', shadowMode: 'none' } },
      { name: 'dynamic-full-shadows', params: { visualTime: '21:00', shadowMode: 'full' } },
      { name: 'dynamic-optimized', params: { visualTime: '21:00', shadowMode: 'optimized' } },
    ]) {
      const measured = await openPage({ population, ...variant.params })
      await measured.waitForTimeout(900)
      report.performance.push({ population, variant: variant.name,
        ...await samplePerformance(measured) })
      await measured.close()
    }
  }
  report.checks.optimizedShadowCache = [100, 200].every((population) => {
    const full = report.performance.find((item) => item.population === population &&
      item.variant === 'dynamic-full-shadows')
    const optimized = report.performance.find((item) => item.population === population &&
      item.variant === 'dynamic-optimized')
    return optimized.diagnostics.shadowAutoUpdate === false &&
      optimized.diagnostics.drawCalls < full.diagnostics.drawCalls
  })
} finally {
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
console.log(JSON.stringify({ renderer: report.renderer, screenshots: report.screenshots.length,
  performance: report.performance.map(({ population, variant, averageFps, frameP95Ms,
    diagnostics }) => ({ population, variant, averageFps, frameP95Ms,
    drawCalls: diagnostics?.drawCalls, textures: diagnostics?.textures,
    programs: diagnostics?.shaderPrograms })), checks: report.checks,
  errors: report.errors }, null, 2))
