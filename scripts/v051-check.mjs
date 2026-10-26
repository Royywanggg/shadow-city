import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const outputDirectory = resolve('.visual')
await mkdir(outputDirectory, { recursive: true })
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.SHADOW_CITY_CHROME ??
  (process.platform === 'darwin' && existsSync(macChrome) ? macChrome : undefined)
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: process.env.SHADOW_CITY_WEBGL === 'hardware'
    ? ['--enable-webgl'] : ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
})
const baseUrl = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/')
baseUrl.searchParams.set('review', '1')
baseUrl.searchParams.set('test', '1')
baseUrl.searchParams.set('scenario', 'B')
const issues = []
const warnings = new Set()
const screenshots = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function monitor(page, label) {
  page.on('pageerror', (error) => issues.push(`${label}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`${label}: ${message.text()}`)
    if (message.type() === 'warning') warnings.add(message.text())
  })
}

async function capture(page, name) {
  await page.screenshot({ path: resolve(outputDirectory, `${name}.png`) })
  screenshots.push(name)
}

async function waitTick(page, tick) {
  await page.waitForFunction((expected) => window.__shadowCityV05?.getPublicSnapshot().tick === expected,
    tick, { timeout: 20000 })
}

async function advance(page, tick) {
  return page.evaluate((target) => window.__shadowCityV05.advanceToTick(target), tick)
}

async function mode(page, value) {
  await page.getByTestId(`mode-${value}`).click()
  await page.waitForFunction((expected) => document.querySelector('[data-testid="experiment-panel"]')?.getAttribute('data-mode') === expected,
    value, { timeout: 10000 })
}

async function cameraState(page) {
  return page.locator('.camera-controls').evaluate((element) => ({
    x: Number(element.getAttribute('data-target-x')),
    z: Number(element.getAttribute('data-target-z')),
    zoom: Number(element.getAttribute('data-zoom-ratio')),
    bearing: Number.parseInt(element.querySelector('[data-testid="camera-bearing-value"]')?.textContent ?? '', 10),
    pitch: Number.parseInt(element.querySelector('.camera-pitch output')?.textContent ?? '', 10),
  }))
}

async function chooseVisibleCitizen(page) {
  await page.waitForFunction(() => (window.__shadowCityAgentDiagnostics?.candidates.length ?? 0) > 0,
    undefined, { timeout: 12000 })
  const candidates = await page.evaluate(() => window.__shadowCityAgentDiagnostics.candidates)
  for (const candidate of candidates.slice(0, 40)) {
    const topElement = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, candidate)
    if (topElement !== 'CANVAS') continue
    await page.mouse.click(candidate.x, candidate.y)
    const selected = await page.getByTestId('selected-agent-id').textContent().catch(() => null)
    if (selected?.toLowerCase() === candidate.id) return candidate.id
  }
  throw new Error('No visible citizen could be selected from the map')
}

try {
  const hero = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  monitor(hero, 'hero')
  await hero.goto(baseUrl.toString(), { waitUntil: 'networkidle' })
  await hero.waitForFunction(() => Boolean(window.__shadowCityV05))
  await hero.getByTestId('population-sidebar').waitFor()
  await hero.waitForTimeout(500)
  await hero.waitForFunction(() => window.__shadowCityCharacterDiagnostics?.assetPresetCount === 10 &&
    window.__shadowCityCharacterDiagnostics?.primitiveFallbackCount === 0,
  undefined, { timeout: 15000 })
  assert(await hero.getByTestId('experiment-panel').getAttribute('data-mode') === 'observed',
    'The event layer should begin in Observed mode')
  assert((await hero.getByTestId('population-sidebar').textContent()).includes('80 citizens'),
    'God View should include all 80 citizens, not only visible pedestrians')
  await capture(hero, 'v051-observed-population-tick000-1440x900')

  await hero.getByTestId('population-search').fill('citizen-0003')
  const row = hero.getByTestId('population-row-citizen-0003')
  await row.waitFor()
  assert(await hero.getByTestId('population-list').getByRole('option').count() === 1,
    'ID search should narrow the population list')
  const selectedName = await row.locator('.population-row-name').textContent()
  await hero.getByTestId('population-search').fill(selectedName)
  assert(await hero.getByTestId('population-list').getByRole('option').count() === 1,
    'Name search should narrow the population list')
  await row.click()
  assert((await hero.getByTestId('selected-agent-id').textContent())?.toLowerCase() === 'citizen-0003',
    'Selecting a list row should select the citizen')
  await hero.getByTestId('population-search').fill('')
  await mode(hero, 'groundTruth')
  assert(await hero.getByTestId('selected-agent-id').count() === 1,
    'Changing to Truth must preserve researcher selection')
  await mode(hero, 'comparison')
  assert(await hero.getByTestId('selected-agent-id').count() === 1,
    'Changing to Compare must preserve researcher selection')
  await mode(hero, 'observed')
  assert(await hero.getByTestId('selected-agent-id').count() === 1,
    'Changing to Observed must preserve researcher selection')

  await advance(hero, 100)
  await waitTick(hero, 100)
  await hero.getByTestId('population-activity-filter').selectOption('travelling')
  const travellingCount = Number.parseInt(await hero.locator('.population-count').textContent(), 10)
  assert(travellingCount > 0 && travellingCount < 80,
    'Activity filtering should reflect real current state')
  await hero.getByTestId('population-activity-filter').selectOption('all')
  await hero.getByRole('button', { name: 'Clear citizen selection' }).click()
  const mapSelectedCitizen = await chooseVisibleCitizen(hero)
  assert((await hero.getByTestId('selected-agent-id').textContent())?.toLowerCase() === mapSelectedCitizen,
    'Map click should select the same citizen in the sidebar')
  await hero.getByTestId('population-search').fill('citizen-0003')
  await hero.getByTestId('population-row-citizen-0003').click()
  await hero.getByTestId('population-search').fill('')
  await hero.getByTestId('population-tab-profile').click()
  await hero.getByRole('group', { name: 'Selected citizen 3D portrait' }).locator('canvas').waitFor()
  await hero.waitForTimeout(450)
  await capture(hero, 'v051-selected-portrait-tick100-1440x900')
  await hero.getByTestId('population-tab-activity').click()
  const position100 = await hero.getByTestId('selected-agent-position').textContent()
  const beforeFocus = await cameraState(hero)
  await hero.getByTestId('population-focus').click()
  await hero.waitForTimeout(1000)
  const afterFocus = await cameraState(hero)
  assert(beforeFocus.bearing === afterFocus.bearing && beforeFocus.pitch === afterFocus.pitch &&
    afterFocus.zoom >= 0.72 && afterFocus.zoom <= 2.8,
  'Focus must preserve bearing/pitch and keep zoom within camera bounds')
  assert(Math.hypot(afterFocus.x - beforeFocus.x, afterFocus.z - beforeFocus.z) > 1,
    'Focus should move the camera target toward the selected citizen')
  await capture(hero, 'v051-selected-focus-tick100-1440x900')
  await hero.mouse.move(720, 450)
  let closeZoomRatio = afterFocus.zoom
  for (let index = 0; index < 18 && closeZoomRatio < 1.8; index += 1) {
    await hero.mouse.wheel(0, -700)
    await hero.waitForTimeout(90)
    closeZoomRatio = (await cameraState(hero)).zoom
  }
  assert(closeZoomRatio >= 1.8, 'Close character view should reach at least 1.8x zoom')
  await hero.waitForTimeout(350)
  await capture(hero, 'v051-close-character-tick100-1440x900')
  const closeCharacterDiagnostics = await hero.evaluate(() => ({
    characters: window.__shadowCityCharacterDiagnostics ?? null,
    selectedScreenPoint: window.__shadowCityAgentDiagnostics?.candidates.find((item) => item.id === 'citizen-0003') ?? null,
  }))
  assert(closeCharacterDiagnostics.characters?.primitiveFallbackCount === 0,
    'Far residents should use asset-derived impostors after character loading')
  await hero.getByTestId('population-inspect').click()
  await hero.waitForFunction(() => Number(document.querySelector('.camera-controls')?.getAttribute('data-zoom-ratio')) >= 7,
    undefined, { timeout: 10000 })
  await hero.waitForTimeout(300)
  const detailZoomRatio = (await cameraState(hero)).zoom
  await capture(hero, 'v051-detail-character-tick100-1440x900')
  const detailCharacterDiagnostics = await hero.evaluate(() => ({
    characters: window.__shadowCityCharacterDiagnostics ?? null,
    selectedScreenPoint: window.__shadowCityAgentDiagnostics?.candidates.find((item) => item.id === 'citizen-0003') ?? null,
  }))
  assert(detailCharacterDiagnostics.characters?.closeCount > 0,
    '3D inspection must display at least the selected rigged character')
  assert(detailCharacterDiagnostics.characters?.selectedTier === 'close',
    'The selected citizen should retain a full rig in Inspect 3D')
  const inspectBearing = (await cameraState(hero)).bearing
  await hero.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
  assert((await cameraState(hero)).bearing === (inspectBearing + 15) % 360,
    'Bearing controls must work during 3D inspection')
  await hero.getByRole('button', { name: 'Rotate left 15 degrees' }).click()
  const inspectPitch = (await cameraState(hero)).pitch
  await hero.getByRole('slider', { name: 'Pitch control' }).focus()
  await hero.getByRole('slider', { name: 'Pitch control' }).press('ArrowDown')
  await hero.waitForFunction((expected) => Number.parseInt(document.querySelector('.camera-pitch output')?.textContent ?? '', 10) === expected,
    inspectPitch - 1, { timeout: 10000 })
  await hero.getByRole('slider', { name: 'Pitch control' }).press('ArrowUp')
  for (const clip of ['Idle', 'Walk', 'Run']) {
    await hero.evaluate((name) => window.__shadowCityCharacterPreview.setClip(name), clip)
    await hero.waitForTimeout(120)
  }
  await capture(hero, 'v051-run-clip-preview-tick100-1440x900')
  await hero.getByTestId('population-tab-activity').click()
  assert((await hero.getByTestId('selected-agent-position').textContent()) === position100,
    'Character animation preview must not move the simulated citizen')
  await hero.evaluate(() => window.__shadowCityCharacterPreview.setClip(null))
  await hero.getByTestId('population-inspect').click()
  await hero.waitForTimeout(1500)
  const afterInspectZoom = (await cameraState(hero)).zoom
  assert(afterInspectZoom <= 2.9,
    `Exiting 3D inspection must restore normal zoom bounds (received ${afterInspectZoom})`)
  await hero.getByTestId('population-follow').click()
  assert(await hero.getByTestId('population-follow').getAttribute('aria-pressed') === 'true',
    'Follow should start for the selected citizen')
  await hero.mouse.move(760, 690)
  await hero.mouse.down()
  await hero.mouse.move(820, 700, { steps: 8 })
  await hero.mouse.up()
  assert(await hero.getByTestId('population-follow').getAttribute('aria-pressed') === 'false',
    'Manual map drag should stop Follow')
  await hero.getByRole('button', { name: 'RESET VIEW' }).click()

  await hero.getByTestId('population-tab-history').click()
  assert(await hero.getByTestId('selected-agent-offence-history').count() === 1,
    'Researcher history should include a true offence section')
  await capture(hero, 'v051-history-tick100-1440x900')
  await advance(hero, 500)
  await waitTick(hero, 500)
  const live500 = await hero.getByTestId('population-sidebar').textContent()
  assert(live500.includes('Tick 500'), 'Population sidebar should follow the live Tick')
  const replayMs = await hero.evaluate(() => window.__shadowCityV05.inspectTick(100))
  await waitTick(hero, 100)
  assert((await hero.getByTestId('population-sidebar').textContent()).includes('Tick 100'),
    'Population sidebar should follow replayed Tick 100')
  await hero.getByTestId('population-tab-activity').click()
  assert((await hero.getByTestId('selected-agent-position').textContent()) === position100,
    'Replay should reproduce the selected citizen position at Tick 100')
  await capture(hero, 'v051-replay-selected-tick100-1440x900')
  await hero.evaluate(() => window.__shadowCityV05.returnLive())
  await waitTick(hero, 500)

  await hero.getByRole('button', { name: 'Collapse population sidebar' }).click()
  await capture(hero, 'v051-collapsed-tick500-1440x900')
  await hero.getByRole('button', { name: 'Open population sidebar' }).click()
  const resize = hero.getByRole('separator', { name: 'Resize population sidebar' })
  if (await resize.count()) {
    const bounds = await resize.boundingBox()
    if (bounds) {
      await hero.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await hero.mouse.down()
      await hero.mouse.move(bounds.x + bounds.width / 2 + 70, bounds.y + bounds.height / 2, { steps: 8 })
      await hero.mouse.up()
    }
  }
  await capture(hero, 'v051-resized-tick500-1440x900')
  const heroDiagnostics = await hero.evaluate(() => ({
    scene: window.__shadowCityDiagnostics ?? null,
    characters: window.__shadowCityCharacterDiagnostics ?? null,
  }))
  await hero.getByTestId('population-tab-profile').click()
  const speedPlayback = []
  for (const speed of [1, 2, 4]) {
    await hero.getByRole('button', { name: `${speed}× speed` }).click()
    assert(await hero.getByRole('button', { name: `${speed}× speed` }).getAttribute('aria-pressed') === 'true',
      `Playback speed ${speed}× should be selected`)
    const before = await hero.evaluate(() => window.__shadowCityV05.getPublicSnapshot().tick)
    await hero.getByRole('button', { name: 'Play', exact: true }).click()
    await hero.waitForFunction((tick) => window.__shadowCityV05.getPublicSnapshot().tick > tick,
      before, { timeout: 10000 })
    await hero.getByRole('button', { name: 'Pause', exact: true }).click()
    const after = await hero.evaluate(() => window.__shadowCityV05.getPublicSnapshot().tick)
    assert(after > before && await hero.getByTestId('selected-agent-id').count() === 1 &&
      await hero.getByRole('group', { name: 'Selected citizen 3D portrait' }).locator('canvas').count() === 1,
    `Playback at ${speed}× should retain selected citizen and portrait`)
    speedPlayback.push({ speed, fromTick: before, toTick: after })
  }
  const browserInfo = await hero.evaluate(() => ({
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    webglRenderer: (() => {
      const gl = document.querySelector('canvas')?.getContext('webgl2')
      const extension = gl?.getExtension('WEBGL_debug_renderer_info')
      return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable'
    })(),
  }))
  await hero.close()

  const narrow = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  monitor(narrow, 'narrow')
  await narrow.goto(baseUrl.toString(), { waitUntil: 'networkidle' })
  await narrow.waitForFunction(() => Boolean(window.__shadowCityV05))
  await narrow.getByRole('button', { name: 'Open population sidebar' }).click()
  await advance(narrow, 100)
  await waitTick(narrow, 100)
  await capture(narrow, 'v051-narrow-population-tick100-390x844')
  await narrow.getByTestId('population-search').fill('citizen-0003')
  await narrow.getByTestId('population-row-citizen-0003').click()
  await narrow.getByRole('group', { name: 'Selected citizen 3D portrait' }).locator('canvas').waitFor()
  await narrow.getByText('MODEL PRESET', { exact: true }).scrollIntoViewIfNeeded()
  await capture(narrow, 'v051-narrow-selected-profile-tick100-390x844')
  await narrow.close()

  const hundredUrl = new URL(baseUrl)
  hundredUrl.searchParams.set('population', '100')
  const hundred = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  monitor(hundred, 'hundred')
  await hundred.goto(hundredUrl.toString(), { waitUntil: 'networkidle' })
  await hundred.waitForFunction(() => Boolean(window.__shadowCityV05))
  const hundredDurations = await advance(hundred, 500)
  await waitTick(hundred, 500)
  await hundred.waitForTimeout(300)
  await capture(hundred, 'v051-hundred-tick500-1440x900')
  const hundredDiagnostics = await hundred.evaluate(() => ({
    scene: window.__shadowCityDiagnostics ?? null,
    characters: window.__shadowCityCharacterDiagnostics ?? null,
  }))
  await hundred.getByRole('button', { name: 'Play', exact: true }).click()
  const activeStart = await hundred.evaluate(() => ({
    time: performance.now(),
    frames: window.__shadowCityDiagnostics?.renderedFrames ?? 0,
    tick: window.__shadowCityV05.getPublicSnapshot().tick,
  }))
  await hundred.waitForTimeout(4000)
  const activeEnd = await hundred.evaluate(() => ({
    time: performance.now(),
    frames: window.__shadowCityDiagnostics?.renderedFrames ?? 0,
    tick: window.__shadowCityV05.getPublicSnapshot().tick,
    scene: window.__shadowCityDiagnostics ?? null,
    characters: window.__shadowCityCharacterDiagnostics ?? null,
  }))
  assert(activeEnd.characters?.primitiveFallbackCount === 0,
    'No primitive character fallback should reappear during playback')
  await hundred.getByRole('button', { name: 'Pause', exact: true }).click()
  await hundred.close()

  const results = {
    browserInfo,
    citySeed: 'shadow-city-hero-01',
    simulationSeed: 'shadow-city-sim-01',
    observationSeed: 'shadow-city-observation-01',
    identitySeed: 'shadow-city-identity-01',
    appearanceSeed: 'shadow-city-appearance-01',
    viewport: '1440x900',
    population: [80, 100],
    selectedCitizen: 'citizen-0003',
    mapSelectedCitizen,
    closeZoomRatio,
    detailZoomRatio,
    closeCharacterDiagnostics,
    detailCharacterDiagnostics,
    replay100Ms: replayMs,
    hundredTickDurationsMs: {
      count: hundredDurations.length,
      p50: percentile(hundredDurations, 0.5),
      p95: percentile(hundredDurations, 0.95),
    },
    heroDiagnostics,
    speedPlayback,
    hundredDiagnostics,
    hundredActivePlayback: {
      seconds: (activeEnd.time - activeStart.time) / 1000,
      renderedFrames: activeEnd.frames - activeStart.frames,
      approximateFps: (activeEnd.frames - activeStart.frames) / ((activeEnd.time - activeStart.time) / 1000),
      advancedTicks: activeEnd.tick - activeStart.tick,
      scene: activeEnd.scene,
      characters: activeEnd.characters,
    },
    screenshots,
    warnings: [...warnings],
    issues,
  }
  const resultsJson = JSON.stringify(results, null, 2)
  await writeFile(resolve(outputDirectory, 'v051-results.json'), `${resultsJson}\n`)
  console.log(resultsJson)
  if (issues.length) process.exitCode = 1
} finally {
  await browser.close()
}

function percentile(values, fraction) {
  if (!values.length) return null
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)]
}
