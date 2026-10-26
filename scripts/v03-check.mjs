import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
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
baseUrl.searchParams.set('model', 'v2')
const base = baseUrl.toString()
const issues = []
const warnings = new Set()
const screenshots = []

function monitor(page, name) {
  page.on('pageerror', (error) => issues.push(`${name}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`${name}: ${message.text()}`)
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

async function state(page) {
  return page.evaluate(() => window.__shadowCityV03?.getSnapshot().state ?? null)
}

async function advance(page, targetTick) {
  return page.evaluate((tick) => window.__shadowCityV03.advanceToTick(tick), targetTick)
}

async function currentTick(page) {
  const content = await page.locator('.simulation-tick').textContent()
  return Number.parseInt(content?.match(/TICK ([\d,]+)/)?.[1].replaceAll(',', '') ?? 'NaN', 10)
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

function percentile(values, fraction) {
  if (!values.length) return null
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)]
}

async function chooseVisibleAgent(page) {
  await page.waitForFunction(() => (window.__shadowCityAgentDiagnostics?.candidates.length ?? 0) > 0,
    undefined, { timeout: 10000 })
  const candidates = await page.evaluate(() => window.__shadowCityAgentDiagnostics.candidates)
  const attempts = []
  for (const candidate of candidates.slice(0, 24)) {
    const target = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName ?? null, candidate)
    await page.mouse.click(candidate.x, candidate.y)
    const selected = await page.getByTestId('selected-agent-id').textContent().catch(() => null)
    attempts.push({ candidate: candidate.id, selected, target, x: candidate.x, y: candidate.y })
    if (selected?.toLowerCase().includes(candidate.id)) return candidate.id
  }
  throw new Error(`Could not select a visible citizen by clicking the Canvas: ${JSON.stringify(attempts)}`)
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  monitor(page, 'hero')
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(window.__shadowCityV03 && window.__shadowCityAgentDiagnostics))
  await page.waitForTimeout(900)
  const initial = await state(page)
  assert(initial?.version === 2 && initial.citizens.length === 80, 'Default run must initialize 80 v2 citizens')
  assert(await currentTick(page) === 0, 'Initial tick must be zero')
  assert((await page.evaluate(() => window.__shadowCityAgentDiagnostics.visibleCount)) > 0,
    'At least one citizen must be visible in the initial hero view')
  await capture(page, 'v03-hero-tick000-1440x900')

  await page.getByRole('button', { name: 'Step', exact: true }).click()
  const stepped = await state(page)
  assert(stepped.tick === 1, 'Step must advance exactly one agent tick')
  assert(stepped.citizens.some((citizen, index) =>
    citizen.position.x !== initial.citizens[index].position.x ||
    citizen.position.z !== initial.citizens[index].position.z),
  'At least one citizen must move on the first fixed tick')
  await page.waitForTimeout(350)
  assert(JSON.stringify(await state(page)) === JSON.stringify(stepped), 'Paused state must remain unchanged')
  await page.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
  assert(JSON.stringify(await state(page)) === JSON.stringify(stepped), 'Camera action must not alter citizen state')
  await page.getByRole('button', { name: 'Reset Simulation' }).click()
  assert(JSON.stringify(await state(page)) === JSON.stringify(initial), 'Reset Simulation must restore initial citizens')
  await page.getByRole('button', { name: 'RESET VIEW' }).click()
  await waitBearing(page, 315)

  const firstHundredDurations = await advance(page, 100)
  const tick100 = await state(page)
  assert(tick100.tick === 100 && tick100.citizens.length === 80, 'Tick 100 must retain all citizens')
  const eventsAt100 = await page.evaluate(() => window.__shadowCityV03.getEvents())
  assert(eventsAt100.some((event) => event.type === 'TripStarted'), 'Citizen trips must emit real events')
  await page.waitForTimeout(400)
  await capture(page, 'v03-hero-tick100-1440x900')

  const selectedAgentId = await chooseVisibleAgent(page)
  assert((await page.getByTestId('selected-agent-activity').textContent())?.length > 0,
    'Selected citizen inspector must show activity')
  await capture(page, 'v03-selected-tick100')
  await page.mouse.move(760, 470)
  await page.mouse.wheel(0, -500)
  await page.waitForTimeout(500)
  await capture(page, 'v03-close-tick100')
  await page.getByRole('button', { name: 'RESET VIEW' }).click()
  await waitBearing(page, 315)

  await page.getByRole('button', { name: 'Compass: north up' }).click()
  await waitBearing(page, 0)
  await capture(page, 'v03-bearing-000-tick100')
  for (const angle of [90, 180, 270]) {
    for (let index = 0; index < 6; index += 1) {
      await page.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
    }
    await waitBearing(page, angle)
    await capture(page, `v03-bearing-${String(angle).padStart(3, '0')}-tick100`)
    assert(JSON.stringify(await state(page)) === JSON.stringify(tick100),
      'Cardinal camera rotation must leave citizen state unchanged')
  }
  await page.getByRole('button', { name: 'RESET VIEW' }).click()
  await waitBearing(page, 315)

  const nextFourHundredDurations = await advance(page, 500)
  const tick500 = await state(page)
  assert(tick500.tick === 500, 'Fixture must reach exact tick 500')
  await page.waitForTimeout(350)
  await capture(page, 'v03-hero-tick500-1440x900')
  await page.getByRole('spinbutton', { name: 'Tick to inspect' }).fill('100')
  await page.getByRole('button', { name: 'Jump to Tick' }).click()
  assert(JSON.stringify(await state(page)) === JSON.stringify(tick100),
    'Replay inspection must rebuild all citizen state at tick 100')
  await page.getByRole('button', { name: 'Return Live' }).click()
  assert(JSON.stringify(await state(page)) === JSON.stringify(tick500),
    'Return Live must retain tick 500 state')
  const heroDiagnostics = await page.evaluate(() => window.__shadowCityDiagnostics ?? null)
  const browserInfo = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    webglRenderer: (() => {
      const gl = document.querySelector('canvas')?.getContext('webgl2')
      const extension = gl?.getExtension('WEBGL_debug_renderer_info')
      return gl && extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null
    })(),
  }))
  await page.close()

  const narrow = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  monitor(narrow, 'narrow')
  await narrow.goto(base, { waitUntil: 'networkidle' })
  await narrow.waitForFunction(() => Boolean(window.__shadowCityV03 && window.__shadowCityAgentDiagnostics))
  await advance(narrow, 100)
  await narrow.waitForTimeout(450)
  await capture(narrow, 'v03-narrow-tick100-390x844')
  await narrow.close()

  const populationUrl = new URL(base)
  populationUrl.searchParams.set('population', '100')
  const hundred = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  monitor(hundred, 'hundred')
  await hundred.goto(populationUrl.toString(), { waitUntil: 'networkidle' })
  await hundred.waitForFunction(() => Boolean(window.__shadowCityV03 && window.__shadowCityAgentDiagnostics))
  const hundredInitial = await state(hundred)
  assert(hundredInitial.version === 2 && hundredInitial.citizens.length === 100,
    'Population URL fixture must initialize 100 citizens')
  const hundredDurations = await advance(hundred, 500)
  await hundred.waitForTimeout(450)
  await capture(hundred, 'v03-hundred-tick500-1440x900')
  const hundredDiagnostics = await hundred.evaluate(() => window.__shadowCityDiagnostics ?? null)
  await hundred.getByRole('button', { name: 'Play', exact: true }).click()
  const beforeDrag = await hundred.evaluate(() => ({
    time: performance.now(),
    frames: window.__shadowCityDiagnostics?.renderedFrames ?? 0,
    tick: window.__shadowCityV03.getSnapshot().tick,
  }))
  await hundred.mouse.move(750, 450)
  await hundred.mouse.down({ button: 'right' })
  await hundred.mouse.move(940, 470, { steps: 35 })
  await hundred.mouse.up({ button: 'right' })
  const afterDrag = await hundred.evaluate(() => ({
    time: performance.now(),
    frames: window.__shadowCityDiagnostics?.renderedFrames ?? 0,
    tick: window.__shadowCityV03.getSnapshot().tick,
  }))
  if (await hundred.getByRole('button', { name: 'Pause', exact: true }).count()) {
    await hundred.getByRole('button', { name: 'Pause', exact: true }).click()
  }
  const hundredStatus = await hundred.locator('.simulation-kicker').textContent()
  await hundred.close()

  console.log(JSON.stringify({
    browserInfo,
    citySeed: 'shadow-city-hero-01',
    simulationSeed: 'shadow-city-sim-01',
    viewport: '1440x900',
    selectedAgentId,
    screenshots,
    tick100Events: eventsAt100.length,
    tickDurationsMs: {
      population80: {
        p50: percentile([...firstHundredDurations, ...nextFourHundredDurations], 0.5),
        p95: percentile([...firstHundredDurations, ...nextFourHundredDurations], 0.95),
      },
      population100: {
        p50: percentile(hundredDurations, 0.5),
        p95: percentile(hundredDurations, 0.95),
      },
    },
    heroDiagnostics,
    hundredDiagnostics,
    hundredStatus,
    hundredActiveDrag: {
      renderedFrames: afterDrag.frames - beforeDrag.frames,
      seconds: (afterDrag.time - beforeDrag.time) / 1000,
      fps: (afterDrag.frames - beforeDrag.frames) / ((afterDrag.time - beforeDrag.time) / 1000),
      advancedTicks: afterDrag.tick - beforeDrag.tick,
    },
    warnings: [...warnings],
    issues,
  }, null, 2))
  if (issues.length) process.exitCode = 1
} finally {
  await browser.close()
}
