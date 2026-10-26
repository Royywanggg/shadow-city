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
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
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

function percentile(values, fraction) {
  if (!values.length) return null
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)]
}

async function capture(page, name) {
  await page.screenshot({ path: resolve(outputDirectory, `${name}.png`) })
  screenshots.push(name)
}

async function fixtureSnapshot(page) {
  return page.evaluate(() => window.__shadowCityV04.getPublicSnapshot())
}

async function advance(page, tick) {
  return page.evaluate((target) => window.__shadowCityV04.advanceToTick(target), tick)
}

async function waitTick(page, expected) {
  await page.waitForFunction((tick) => window.__shadowCityV04?.getPublicSnapshot().tick === tick,
    expected, { timeout: 15000 })
}

async function bearing(page) {
  return Number.parseInt(await page.getByTestId('camera-bearing-value').textContent(), 10)
}

async function waitBearing(page, expected) {
  await page.waitForFunction((angle) => {
    const value = Number.parseInt(document.querySelector('[data-testid="camera-bearing-value"]')?.textContent ?? '', 10)
    return Number.isFinite(value) && Math.abs(((value - angle + 540) % 360) - 180) <= 1
  }, expected, { timeout: 12000 })
}

async function mode(page, name) {
  await page.getByTestId(`mode-${name}`).click()
  await page.waitForFunction((expected) => document.querySelector('[data-testid="experiment-panel"]')?.getAttribute('data-mode') === expected,
    name, { timeout: 10000 })
}

async function truthCounts(page) {
  const read = async (id) => Number(await page.getByTestId(id).textContent())
  return {
    truth: await read('truth-count'),
    available: await read('available-count'),
    pending: await read('pending-count'),
    unreported: await read('unreported-count'),
  }
}

async function observedCount(page) {
  return Number(await page.getByTestId('observed-count').textContent())
}

async function chooseVisibleCitizen(page) {
  await page.waitForFunction(() => (window.__shadowCityAgentDiagnostics?.candidates.length ?? 0) > 0,
    undefined, { timeout: 12000 })
  const candidates = await page.evaluate(() => window.__shadowCityAgentDiagnostics.candidates)
  for (const candidate of candidates.slice(0, 30)) {
    if ((await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, candidate)) !== 'CANVAS') continue
    await page.mouse.click(candidate.x, candidate.y)
    const selected = await page.getByTestId('selected-agent-id').textContent().catch(() => null)
    if (selected?.toLowerCase().includes(candidate.id)) return candidate.id
  }
  throw new Error('A visible citizen could not be selected at Tick 100')
}

async function switchScenario(page, scenario) {
  await page.getByTestId(`scenario-${scenario.toLowerCase()}`).click()
  await page.waitForFunction((expected) =>
    document.querySelector(`[data-testid="scenario-${expected.toLowerCase()}"]`)?.getAttribute('aria-pressed') === 'true' &&
    window.__shadowCityV04?.getPublicSnapshot().tick === 0,
  scenario, { timeout: 15000 })
}

try {
  const hero = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  monitor(hero, 'hero')
  await hero.goto(baseUrl.toString(), { waitUntil: 'networkidle' })
  await hero.waitForFunction(() => Boolean(window.__shadowCityV04 && window.__shadowCityAgentDiagnostics))
  await hero.waitForTimeout(500)
  assert(await hero.getByTestId('experiment-panel').getAttribute('data-mode') === 'observed',
    'v0.4 must start in the public Observed mode')
  assert(await observedCount(hero) === 0, 'Tick 0 must contain no available report')
  assert(await hero.getByTestId('truth-count').count() === 0, 'Observer DOM must omit the private truth count')
  assert(await hero.getByTestId('pending-count').count() === 0, 'Observer DOM must omit private pending reports')
  await capture(hero, 'v04-observed-tick000-1440x900')
  await mode(hero, 'groundTruth')
  await capture(hero, 'v04-truth-tick000-1440x900')
  await mode(hero, 'comparison')
  await capture(hero, 'v04-comparison-tick000-1440x900')
  await mode(hero, 'observed')

  await hero.getByRole('button', { name: 'Step', exact: true }).click()
  await waitTick(hero, 1)
  const stepped = await fixtureSnapshot(hero)
  await hero.waitForTimeout(350)
  assert(JSON.stringify(await fixtureSnapshot(hero)) === JSON.stringify(stepped), 'Pause must freeze public simulation state')
  await hero.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
  assert(JSON.stringify(await fixtureSnapshot(hero)) === JSON.stringify(stepped), 'Camera rotation cannot advance simulation')
  await hero.getByRole('button', { name: 'Reset Simulation' }).click()
  await waitTick(hero, 0)
  assert(await observedCount(hero) === 0, 'Reset must restore the initial report view')
  await hero.getByRole('button', { name: 'RESET VIEW' }).click()
  await waitBearing(hero, 315)

  const firstHundred = await advance(hero, 100)
  await hero.waitForTimeout(300)
  const public100 = await fixtureSnapshot(hero)
  const observed100 = await observedCount(hero)
  assert(public100.tick === 100 && public100.availableReportCount === observed100,
    'Observer read model and UI must agree at Tick 100')
  assert(await hero.getByTestId('truth-count').count() === 0 &&
    await hero.getByTestId('unreported-count').count() === 0,
  'Observed mode must not render ground-truth metrics')
  await capture(hero, 'v04-observed-tick100-1440x900')

  await mode(hero, 'groundTruth')
  const truth100 = await truthCounts(hero)
  assert(truth100.truth > 0, 'The documented synthetic review scenario must generate real incidents by Tick 100')
  assert(truth100.truth === truth100.available + truth100.pending + truth100.unreported,
    'Tick 100 reporting outcomes must partition ground truth')
  assert(truth100.available === observed100, 'Observer count must equal the researcher available count')
  await capture(hero, 'v04-truth-tick100-1440x900')
  await mode(hero, 'comparison')
  await capture(hero, 'v04-comparison-tick100-1440x900')

  const selectedCitizen = await chooseVisibleCitizen(hero)
  const citizenWorldPosition = await hero.getByTestId('selected-agent-position').textContent()
  await capture(hero, 'v04-selected-citizen-tick100')
  await hero.getByRole('button', { name: 'Compass: north up' }).click()
  await waitBearing(hero, 0)
  await capture(hero, 'v04-bearing-000-tick100')
  for (const angle of [90, 180, 270]) {
    for (let index = 0; index < 6; index += 1) {
      await hero.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
    }
    await waitBearing(hero, angle)
    assert((await fixtureSnapshot(hero)).tick === 100 &&
      (await hero.getByTestId('selected-agent-position').textContent()) === citizenWorldPosition,
    'Cardinal camera changes cannot move citizens or advance incidents')
    await capture(hero, `v04-bearing-${String(angle).padStart(3, '0')}-tick100`)
  }
  await hero.getByRole('button', { name: 'RESET VIEW' }).click()
  await waitBearing(hero, 315)
  await hero.getByRole('button', { name: 'Close citizen inspector' }).click()

  const nextFourHundred = await advance(hero, 500)
  await hero.waitForTimeout(300)
  const truth500 = await truthCounts(hero)
  const public500 = await fixtureSnapshot(hero)
  assert(public500.tick === 500 && truth500.truth > truth100.truth,
    'Ground truth should grow from Tick 100 to 500 in the review scenario')
  assert(truth500.truth === truth500.available + truth500.pending + truth500.unreported,
    'Tick 500 reporting outcomes must partition ground truth')
  await capture(hero, 'v04-comparison-tick500-1440x900')
  await hero.mouse.move(720, 440)
  let closeZoomRatio = 1
  for (let index = 0; index < 18 && closeZoomRatio < 1.8; index += 1) {
    await hero.mouse.wheel(0, -700)
    await hero.waitForTimeout(90)
    closeZoomRatio = Number(await hero.locator('.camera-controls').getAttribute('data-zoom-ratio'))
  }
  assert(closeZoomRatio >= 1.8, `Close camera view remained at ${closeZoomRatio.toFixed(2)}× zoom`)
  await hero.waitForTimeout(600)
  assert(JSON.stringify(await fixtureSnapshot(hero)) === JSON.stringify(public500),
    'Close camera view must not change incidents or observation state')
  await capture(hero, 'v04-close-markers-tick500')
  await hero.getByRole('button', { name: 'RESET VIEW' }).click()
  await waitBearing(hero, 315)
  await mode(hero, 'observed')
  assert(await observedCount(hero) === truth500.available, 'Tick 500 observer count must match delivered reports')
  await capture(hero, 'v04-observed-tick500-1440x900')
  await mode(hero, 'groundTruth')
  await capture(hero, 'v04-truth-tick500-1440x900')

  const replay500Ms = await hero.evaluate(() => window.__shadowCityV04.inspectTick(500))
  assert((await fixtureSnapshot(hero)).isInspecting &&
    JSON.stringify(await truthCounts(hero)) === JSON.stringify(truth500),
  'Replay Tick 500 must reconstruct identical researcher counts')
  await capture(hero, 'v04-replay-tick500-1440x900')
  await hero.evaluate(() => window.__shadowCityV04.returnLive())
  await mode(hero, 'observed')
  await hero.evaluate(() => window.__shadowCityV04.inspectTick(100))
  assert(await observedCount(hero) === observed100, 'Historical Tick 100 must hide later report arrivals')
  assert(await hero.getByTestId('truth-count').count() === 0,
    'Observed historical UI must not expose private truth metrics')
  await hero.evaluate(() => window.__shadowCityV04.returnLive())
  assert((await fixtureSnapshot(hero)).tick === 500, 'Return Live must restore Tick 500')

  await mode(hero, 'comparison')
  const scenarioCounts = { B: truth500 }
  for (const scenario of ['A', 'C']) {
    await switchScenario(hero, scenario)
    await advance(hero, 500)
    await hero.waitForTimeout(220)
    scenarioCounts[scenario] = await truthCounts(hero)
    assert(scenarioCounts[scenario].truth === truth500.truth,
      'Changing reporting probability must preserve ground-truth incident count')
    await mode(hero, 'observed')
    assert(await observedCount(hero) === scenarioCounts[scenario].available,
      'Observed records must match the researcher delivered count')
    await capture(hero, `v04-scenario-${scenario.toLowerCase()}-observed-tick500`)
    await mode(hero, 'comparison')
  }
  assert(scenarioCounts.A.available <= scenarioCounts.B.available &&
    scenarioCounts.B.available <= scenarioCounts.C.available,
  'Increasing reporting probability should not reduce available reports at a fixed Tick')

  const browserInfo = await hero.evaluate(() => ({
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    webglRenderer: (() => {
      const gl = document.querySelector('canvas')?.getContext('webgl2')
      const extension = gl?.getExtension('WEBGL_debug_renderer_info')
      return gl && extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null
    })(),
  }))
  const heroDiagnostics = await hero.evaluate(() => window.__shadowCityDiagnostics ?? null)
  await hero.close()

  const narrow = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  monitor(narrow, 'narrow')
  await narrow.goto(baseUrl.toString(), { waitUntil: 'networkidle' })
  await narrow.waitForFunction(() => Boolean(window.__shadowCityV04))
  await advance(narrow, 100)
  await narrow.waitForTimeout(350)
  await capture(narrow, 'v04-narrow-observed-tick100-390x844')
  assert(await narrow.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Narrow observation UI must not overflow horizontally')
  await mode(narrow, 'comparison')
  await capture(narrow, 'v04-narrow-comparison-tick100-390x844')
  await narrow.close()

  const hundredUrl = new URL(baseUrl)
  hundredUrl.searchParams.set('population', '100')
  const hundred = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  monitor(hundred, 'hundred')
  await hundred.goto(hundredUrl.toString(), { waitUntil: 'networkidle' })
  await hundred.waitForFunction(() => Boolean(window.__shadowCityV04))
  const hundredDurations = await advance(hundred, 500)
  await hundred.waitForTimeout(300)
  await mode(hundred, 'comparison')
  const hundredCounts = await truthCounts(hundred)
  await capture(hundred, 'v04-hundred-comparison-tick500-1440x900')
  const hundredDiagnostics = await hundred.evaluate(() => window.__shadowCityDiagnostics ?? null)
  const hundredReplay500Ms = await hundred.evaluate(() => window.__shadowCityV04.inspectTick(500))
  await hundred.evaluate(() => window.__shadowCityV04.returnLive())
  await hundred.getByRole('button', { name: 'Play', exact: true }).click()
  const beforeDrag = await hundred.evaluate(() => ({
    time: performance.now(),
    renderedFrames: window.__shadowCityDiagnostics?.renderedFrames ?? 0,
    tick: window.__shadowCityV04.getPublicSnapshot().tick,
  }))
  await hundred.mouse.move(750, 450)
  await hundred.mouse.down({ button: 'right' })
  await hundred.mouse.move(930, 470, { steps: 35 })
  await hundred.mouse.up({ button: 'right' })
  const afterDrag = await hundred.evaluate(() => ({
    time: performance.now(),
    renderedFrames: window.__shadowCityDiagnostics?.renderedFrames ?? 0,
    tick: window.__shadowCityV04.getPublicSnapshot().tick,
    diagnostics: window.__shadowCityDiagnostics ?? null,
  }))
  if (await hundred.getByRole('button', { name: 'Pause', exact: true }).count()) {
    await hundred.getByRole('button', { name: 'Pause', exact: true }).click()
  }
  const hundredStatus = await hundred.locator('.simulation-kicker').textContent()
  await hundred.close()

  const seconds = (afterDrag.time - beforeDrag.time) / 1000
  const renderedFrames = afterDrag.renderedFrames - beforeDrag.renderedFrames
  const results = {
    browserInfo,
    citySeed: 'shadow-city-hero-01',
    simulationSeed: 'shadow-city-sim-01',
    observationSeed: 'shadow-city-observation-01',
    reviewScenario: true,
    viewport: '1440x900',
    closeZoomRatio,
    selectedCitizen,
    screenshots,
    tick100: { truth: truth100, observedReports: observed100 },
    tick500: { truth: truth500, scenarioCounts, hundredAgents: hundredCounts },
    tickDurationsMs: {
      population80: { p50: percentile([...firstHundred, ...nextFourHundred], 0.5),
        p95: percentile([...firstHundred, ...nextFourHundred], 0.95) },
      population100: { p50: percentile(hundredDurations, 0.5), p95: percentile(hundredDurations, 0.95) },
    },
    replay500Ms: { population80: replay500Ms, population100: hundredReplay500Ms },
    heroDiagnostics,
    hundredDiagnostics,
    hundredActiveDrag: {
      renderedFrames,
      seconds,
      fps: renderedFrames / seconds,
      advancedTicks: afterDrag.tick - beforeDrag.tick,
      frameTimeP50Ms: afterDrag.diagnostics?.p50ActiveFrameMs ?? null,
      frameTimeP95Ms: afterDrag.diagnostics?.p95ActiveFrameMs ?? null,
      sampledFrames: afterDrag.diagnostics?.sampledFrames ?? 0,
    },
    warnings: [...warnings],
    issues,
  }
  const resultsJson = JSON.stringify(results, null, 2)
  await writeFile(resolve(outputDirectory, 'v04-results.json'), `${resultsJson}\n`)
  console.log(resultsJson)
  if (issues.length) process.exitCode = 1
} finally {
  await browser.close()
}
