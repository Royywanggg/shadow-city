import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const outputDirectory = resolve('.visual')
await mkdir(outputDirectory, { recursive: true })
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SHADOW_CITY_CHROME ??
    (process.platform === 'darwin' && existsSync(macChrome) ? macChrome : undefined),
  args: process.env.SHADOW_CITY_WEBGL === 'hardware'
    ? ['--enable-webgl'] : ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
})
const errors = []
const warnings = new Set()
const screenshots = []

function monitor(page, label) {
  page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`)
    if (message.type() === 'warning') warnings.add(message.text())
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function capture(page, name) {
  await page.screenshot({ path: resolve(outputDirectory, `${name}.png`) })
  screenshots.push(name)
}

async function advance(page, tick) {
  return page.evaluate((target) => window.__shadowCityV05.advanceToTick(target), tick)
}

async function spatialAt(page, tick) {
  await page.waitForFunction((expected) => window.__shadowCityPopulationSpatialDiagnostics?.tick === expected,
    tick, { timeout: 20000 })
  const spatial = await page.evaluate(() => window.__shadowCityPopulationSpatialDiagnostics)
  assert(spatial.outdoorCount === spatial.renderedCount,
    `Tick ${tick}: an outdoor resident was hidden or merged`)
  assert(spatial.occupiedCount === spatial.uniqueOccupiedSlots && spatial.invalidOccupiedPositions === 0,
    `Tick ${tick}: activity occupancy is overlapping or illegal`)
  return spatial
}

async function selectVisibleCitizen(page) {
  await page.waitForFunction(() => (window.__shadowCityAgentDiagnostics?.candidates.length ?? 0) > 0,
    undefined, { timeout: 15000 })
  const candidates = await page.evaluate(() => window.__shadowCityAgentDiagnostics.candidates)
  for (const candidate of candidates.slice(0, 60)) {
    const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, candidate)
    if (top !== 'CANVAS') continue
    await page.mouse.click(candidate.x, candidate.y)
    const selected = await page.getByTestId('selected-agent-id').textContent({ timeout: 300 }).catch(() => null)
    if (selected?.toLowerCase() === candidate.id) return candidate.id
  }
  throw new Error('No outdoor citizen could be selected from the map')
}

try {
  const url = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/')
  url.searchParams.set('review', '1')
  url.searchParams.set('test', '1')
  url.searchParams.set('scenario', 'B')
  url.searchParams.set('population', '200')
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  monitor(page, '200-citizen hero')
  await page.goto(url.toString(), { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__shadowCityV05?.getPublicSnapshot().tick === 0 &&
    window.__shadowCityCharacterDiagnostics?.assetPresetCount === 10 &&
    window.__shadowCityCharacterDiagnostics?.primitiveFallbackCount === 0,
  undefined, { timeout: 20000 })
  const renderer = await page.evaluate(() => {
    const gl = document.querySelector('main.experience canvas')?.getContext('webgl2')
    const extension = gl?.getExtension('WEBGL_debug_renderer_info')
    return gl?.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ?? null
  })
  if (process.env.SHADOW_CITY_WEBGL === 'hardware') {
    assert(renderer && !/swiftshader|software|llvmpipe/i.test(renderer),
      `A real GPU was requested but the renderer is ${renderer}`)
  }
  const spatial = { tick0: await spatialAt(page, 0) }
  await capture(page, 'v052-population-200-tick000-1440x900')
  const tickDurations = await advance(page, 100)
  spatial.tick100 = await spatialAt(page, 100)
  await capture(page, 'v052-population-200-tick100-1440x900')
  const selectedId = await selectVisibleCitizen(page)
  await page.mouse.move(735, 455)
  for (let index = 0; index < 5; index += 1) await page.mouse.wheel(0, -500)
  await page.waitForTimeout(350)
  await capture(page, 'v052-population-200-plaza-close-tick100-1440x900')
  await page.getByRole('button', { name: 'RESET VIEW' }).click()
  await page.getByTestId('population-tab-profile').click()
  const portrait = page.getByRole('group', { name: 'Selected citizen 3D portrait' })
  await portrait.locator('canvas').waitFor()
  const appearance = await page.evaluate(() => window.__shadowCityCharacterDiagnostics)
  assert(await portrait.locator('[data-preset-id]').getAttribute('data-preset-id') === appearance.selectedPresetId,
    'Portrait preset must match the selected world character')
  assert(await portrait.locator('[data-primary-color]').getAttribute('data-primary-color') ===
    (appearance.selectedPrimaryColor ?? ''), 'Portrait clothing color must match the world character')
  await page.getByTestId('population-tab-activity').click()
  const position100 = await page.getByTestId('selected-agent-position').textContent()
  await page.getByTestId('population-focus').click()
  await page.getByTestId('population-follow').click()
  assert(await page.getByTestId('population-follow').getAttribute('aria-pressed') === 'true',
    'Follow should engage after Focus')
  await page.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
  await page.getByRole('slider', { name: 'Pitch control' }).focus()
  await page.getByRole('slider', { name: 'Pitch control' }).press('ArrowDown')
  await page.getByRole('button', { name: 'RESET VIEW' }).click()
  assert(await page.getByTestId('population-follow').getAttribute('aria-pressed') === 'false',
    'Reset View should cancel Follow')
  for (const mode of ['groundTruth', 'comparison', 'observed']) {
    await page.getByTestId(`mode-${mode}`).click()
    assert(await page.getByTestId('selected-agent-id').count() === 1,
      'Event mode changes must preserve researcher selection')
  }
  const restDurations = await advance(page, 500)
  spatial.tick500 = await spatialAt(page, 500)
  await capture(page, 'v052-population-200-tick500-1440x900')
  await page.evaluate(() => window.__shadowCityV05.inspectTick(100))
  spatial.replay100 = await spatialAt(page, 100)
  assert(await page.getByTestId('selected-agent-position').textContent() === position100,
    'Replay must restore the selected citizen’s real Tick 100 position')
  await page.evaluate(() => window.__shadowCityV05.returnLive())
  spatial.returnLive500 = await spatialAt(page, 500)
  const before = await page.evaluate(() => ({
    tick: window.__shadowCityV05.getPublicSnapshot().tick,
    frames: window.__shadowCityDiagnostics?.renderedFrames ?? 0,
    time: performance.now(),
  }))
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForTimeout(4000)
  const after = await page.evaluate(() => ({
    tick: window.__shadowCityV05.getPublicSnapshot().tick,
    frames: window.__shadowCityDiagnostics?.renderedFrames ?? 0,
    time: performance.now(),
    scene: window.__shadowCityDiagnostics ?? null,
    characters: window.__shadowCityCharacterDiagnostics ?? null,
    spatial: window.__shadowCityPopulationSpatialDiagnostics ?? null,
    jsHeapBytes: performance.memory?.usedJSHeapSize ?? null,
  }))
  const playbackStatus = await page.locator('.simulation-kicker').textContent()
  if (playbackStatus?.includes('RUNNING')) await page.getByRole('button', { name: 'Pause', exact: true }).click()
  assert(after.tick > before.tick && after.characters?.primitiveFallbackCount === 0,
    '200-citizen playback must advance without primitive character fallback')

  const narrow = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  monitor(narrow, '200-citizen narrow')
  await narrow.goto(url.toString(), { waitUntil: 'networkidle' })
  await advance(narrow, 100)
  await spatialAt(narrow, 100)
  await narrow.getByRole('button', { name: 'Open population sidebar' }).click()
  await narrow.getByTestId('population-search').fill(selectedId)
  await narrow.getByTestId(`population-row-${selectedId}`).click()
  assert(await narrow.getByTestId('selected-agent-id').count() === 1,
    'Selected citizen must remain inspectable on the narrow viewport')
  await narrow.getByRole('group', { name: 'Selected citizen 3D portrait' }).locator('canvas').waitFor()
  await narrow.waitForTimeout(300)
  await capture(narrow, 'v052-population-200-narrow-tick100-390x844')

  const sorted = [...tickDurations, ...restDurations].sort((a, b) => a - b)
  const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
  const result = {
    date: new Date().toISOString(),
    browser: await page.evaluate(() => navigator.userAgent), renderer,
    viewport: '1440x900', dpr: 1,
    citySeed: 'shadow-city-hero-01', simulationSeed: 'shadow-city-sim-01',
    population: 200, selectedId, spatial,
    tickDurationsMs: { count: sorted.length, p50: percentile(0.5), p95: percentile(0.95) },
    activePlayback: {
      seconds: (after.time - before.time) / 1000,
      frames: after.frames - before.frames,
      approximateFps: (after.frames - before.frames) / ((after.time - before.time) / 1000),
      ticks: after.tick - before.tick,
      scene: after.scene, characters: after.characters, spatial: after.spatial,
      jsHeapBytes: after.jsHeapBytes, statusAfterSampling: playbackStatus,
    }, screenshots, errors, warnings: [...warnings],
  }
  await writeFile(resolve(outputDirectory, 'v052-results.json'), `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result, null, 2))
  assert(errors.length === 0, 'Browser reported page or console errors')
} finally {
  await browser.close()
}
