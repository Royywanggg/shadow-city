import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const output = resolve('.visual')
await mkdir(output, { recursive: true })
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const hardware = process.env.SHADOW_CITY_WEBGL === 'hardware'
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.SHADOW_CITY_CHROME ??
    (process.platform === 'darwin' && existsSync(chrome) ? chrome : undefined),
  args: hardware ? ['--enable-webgl'] : ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] })
const errors = []
const screenshots = []
let page
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  const url = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/')
  url.searchParams.set('population', '200')
  url.searchParams.set('test', '1')
  await page.goto(url.toString(), { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100 &&
    window.__shadowCityV06Agents?.tick === 100, undefined, { timeout: 30000 })
  const renderer = await page.evaluate(() => {
    const gl = document.querySelector('.v06-viewport canvas')?.getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return gl?.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ?? null
  })
  const initialCounts = await page.evaluate(() => {
    const state = window.__shadowCityV06.getSnapshot().state
    return state.citizens.reduce((counts, citizen) => {
      counts[citizen.activity] = (counts[citizen.activity] ?? 0) + 1
      return counts
    }, {})
  })
  const screenshot = async (name) => { await page.screenshot({ path: resolve(output, name + '.png') }); screenshots.push(name) }
  await screenshot('v06-hero-200-tick100-1440x900')
  const advanceDurations = await page.evaluate(() => window.__shadowCityV06.advanceToTick(500))
  await page.waitForFunction(() => window.__shadowCityV06Agents?.tick === 500)
  const allLevelAgents = await page.evaluate(() => ({
    visibleCount: window.__shadowCityV06Agents.visibleCount,
    farCount: window.__shadowCityV06Agents.farCount,
    mediumCount: window.__shadowCityV06Agents.mediumCount,
    closeCount: window.__shadowCityV06Agents.closeCount,
  }))
  const finalCounts = await page.evaluate(() => {
    const state = window.__shadowCityV06.getSnapshot().state
    return state.citizens.reduce((counts, citizen) => {
      counts[citizen.activity] = (counts[citizen.activity] ?? 0) + 1
      return counts
    }, {})
  })
  await screenshot('v06-hero-200-tick500-1440x900')
  let mapSelectionId = null
  for (const candidate of await page.evaluate(() => window.__shadowCityV06Agents.candidates)) {
    if (candidate.x < 325 || candidate.x > 1400 || candidate.y < 190 || candidate.y > 810) continue
    if (await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName,
      candidate) !== 'CANVAS') continue
    await page.mouse.click(candidate.x, candidate.y)
    const selected = await page.locator('.v06-inspector>small').textContent({ timeout: 200 }).catch(() => null)
    if (selected?.includes(candidate.id)) { mapSelectionId = candidate.id; break }
  }
  const upstairsId = await page.evaluate(() => window.__shadowCityV06.getSnapshot().state.citizens
    .find((citizen) => citizen.position.y === 5500 && citizen.activity !== 'atHome')?.id ?? null)
  let focusY = null
  if (upstairsId) {
    await page.locator(`[data-agent-id="${upstairsId}"]`).click()
    await page.getByRole('button', { name: 'FOCUS', exact: true }).click()
    await page.waitForTimeout(500)
    focusY = await page.evaluate(() => window.__shadowCityV06.getCameraView().target[1])
    await screenshot('v06-upper-agent-focus-tick500-1440x900')
    await page.getByRole('button', { name: 'RESET VIEW' }).click()
  }
  await page.getByRole('button', { name: 'HIDE ROOF' }).click()
  await page.getByRole('combobox', { name: 'Visible level' }).selectOption('L1')
  await screenshot('v06-galleria-upper-tick500-1440x900')
  const galleriaId = await page.evaluate(() => window.__shadowCityV06.getSnapshot().state.citizens
    .find((citizen) => citizen.surfaceId === 'galleria-l1' ||
      citizen.surfaceId.startsWith('galleria-shop-') && citizen.surfaceId.endsWith('l1'))?.id ?? null)
  if (galleriaId) {
    await page.locator(`[data-agent-id="${galleriaId}"]`).click()
    await page.getByRole('button', { name: 'FOCUS', exact: true }).click()
    await page.waitForTimeout(650)
    await screenshot('v06-galleria-interior-close-tick500-1440x900')
    await page.getByRole('button', { name: 'RESET VIEW' }).click()
  }
  const candidates = await page.evaluate(() => window.__shadowCityV06Agents.candidates)
  const visible = candidates.find(({ x, y }) => x > 330 && x < 1400 && y > 160 && y < 790)
  if (visible) await page.mouse.click(visible.x, visible.y)
  await page.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
  await page.getByRole('button', { name: 'RESET VIEW' }).click()
  await page.getByRole('slider', { name: 'Replay tick' }).fill('100')
  await page.waitForFunction(() => window.__shadowCityV06.getSnapshot().tick === 100)
  await screenshot('v06-replay-tick100-1440x900')
  const replayBenchmark = await page.evaluate(() => window.__shadowCityV06.benchmarkReplay500())
  await page.getByRole('button', { name: 'RETURN LIVE' }).click()
  await page.getByRole('combobox', { name: 'Visible level' }).selectOption('all')
  await page.getByRole('button', { name: 'Clear selection' }).click()
  await page.getByRole('button', { name: 'SHOW ROOF' }).click()
  await page.getByRole('button', { name: 'RESET VIEW' }).click()
  const navigationStart = await page.evaluate(() => window.__shadowCityV06.getCameraView())
  await page.mouse.move(850, 540)
  await page.mouse.wheel(0, -530)
  await page.waitForTimeout(220)
  const zoomRatio = await page.evaluate(() => window.__shadowCityV06.getCameraView().zoomRatio)
  await page.mouse.move(870, 565)
  await page.mouse.down()
  await page.mouse.move(930, 615, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(250)
  const pannedTarget = await page.evaluate(() => window.__shadowCityV06.getCameraView().target)
  await page.getByRole('slider', { name: 'Pitch control' }).fill('50')
  const pitch = await page.evaluate(() => window.__shadowCityV06.getCameraView().pitchDeg)
  await page.getByRole('button', { name: 'RESET VIEW' }).click()
  const navigationReset = await page.evaluate(() => window.__shadowCityV06.getCameraView())
  await page.getByRole('button', { name: 'PLAY', exact: true }).click()
  const frames = await page.evaluate(async () => {
    const times = []
    const started = performance.now()
    while (performance.now() - started < 3500) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      times.push(performance.now())
    }
    return times
  })
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  const gaps = frames.slice(1).map((value, index) => value - frames[index]).sort((a, b) => a - b)
  const fps = frames.length / ((frames.at(-1) - frames[0]) / 1000)
  const frameP95 = gaps[Math.ceil(gaps.length * .95) - 1]
  const bearings = {}
  await page.getByRole('button', { name: 'Compass: north up' }).click()
  for (const bearing of [0, 90, 180, 270]) {
    if (bearing > 0) {
      for (let i = 0; i < 6; i += 1) {
        await page.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
      }
    }
    await page.waitForTimeout(120)
    bearings[bearing] = await page.evaluate(() => window.__shadowCityV06.getCameraView().bearingDeg)
    await screenshot(`v06-bearing-${String(bearing).padStart(3, '0')}-tick${page.url().includes('tick') ? '500' : '514'}-1440x900`)
  }
  await page.getByRole('button', { name: 'RESET VIEW' }).click()
  await page.getByRole('button', { name: 'BRIDGE OPEN' }).click()
  await page.getByRole('button', { name: 'STEP', exact: true }).click()
  const bridgeClosed = await page.evaluate(() => window.__shadowCityV06.getSnapshot().state.accessModes['bridge-entry'])
  const narrow = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  narrow.on('pageerror', (error) => errors.push(`narrow: ${error.message}`))
  await narrow.goto(url.toString(), { waitUntil: 'networkidle' })
  await narrow.waitForFunction(() => window.__shadowCityV06Agents?.tick === 100)
  await narrow.getByRole('button', { name: 'Collapse population' }).click()
  await narrow.screenshot({ path: resolve(output, 'v06-narrow-200-tick100-390x844.png') })
  screenshots.push('v06-narrow-200-tick100-390x844')
  await narrow.getByRole('button', { name: 'Expand population' }).click()
  await narrow.getByRole('textbox', { name: 'Search residents' }).fill('citizen-0001')
  await narrow.locator('[data-agent-id="citizen-0001"]').click()
  const narrowSelected = await narrow.locator('.v06-inspector>small').textContent()
  await narrow.close()
  const legacy = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await legacy.goto('http://127.0.0.1:5173/?world=legacy&model=v4', { waitUntil: 'networkidle' })
  const legacyOpen = await legacy.locator('.masthead h1').textContent()
  await legacy.close()
  const alternate = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  alternate.on('pageerror', (error) => errors.push(`alternate seed: ${error.message}`))
  const alternateUrl = new URL(url)
  alternateUrl.searchParams.set('seed', 'shadow-city-multilevel-02')
  await alternate.goto(alternateUrl.toString(), { waitUntil: 'networkidle' })
  await alternate.waitForFunction(() => window.__shadowCityV06Agents?.tick === 100)
  const alternateSeed = await alternate.evaluate(() => window.__shadowCityV06.getWorld().config.seed)
  await alternate.screenshot({ path: resolve(output, 'v06-alternate-seed-tick100-1440x900.png') })
  screenshots.push('v06-alternate-seed-tick100-1440x900')
  await alternate.close()
  const result = await page.evaluate(() => ({
    visibleAgents: window.__shadowCityV06Agents,
    rendering: window.__shadowCityV06Rendering,
    snapshot: { tick: window.__shadowCityV06.getSnapshot().tick,
      offences: window.__shadowCityV06.getSnapshot().state.offences.length,
      reports: window.__shadowCityV06.getSnapshot().state.reports.length },
    usedHeap: performance.memory?.usedJSHeapSize ?? null,
    userAgent: navigator.userAgent,
  }))
  const ordered = advanceDurations.slice().sort((a, b) => a - b)
  const p95 = ordered[Math.ceil(ordered.length * 0.95) - 1]
  const report = { renderer, hardwareRequested: hardware, viewport: '1440x900', dpr: 1,
    worldSeed: 'shadow-city-multilevel-01', population: 200, initialCounts, finalCounts,
    allLevelAgents, mapSelectionId, upstairsId, focusY, galleriaId, replayBenchmark,
    fps, frameP95, bearings, bridgeClosed, narrowSelected, legacyOpen, alternateSeed,
    cameraNavigation: { zoomRatio, pannedTarget, pitch, navigationStart, navigationReset },
    tickDurationsMs: { count: ordered.length, p95, median: ordered[Math.floor(ordered.length / 2)] },
    result: { ...result, visibleAgents: { tick: result.visibleAgents.tick,
      visibleCount: result.visibleAgents.visibleCount, farCount: result.visibleAgents.farCount,
      mediumCount: result.visibleAgents.mediumCount, closeCount: result.visibleAgents.closeCount } },
    screenshots, errors }
  await writeFile(resolve(output, 'v06-results.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  if (errors.length) throw new Error('Browser console reported errors')
  if (hardware && /swiftshader|software|llvmpipe/i.test(renderer ?? '')) throw new Error(`Software renderer: ${renderer}`)
  if (!mapSelectionId) throw new Error('Map-to-sidebar citizen selection failed')
  if (focusY === null || Math.abs(focusY - 5.5) > 0.5) throw new Error(`Cross-floor focus lost elevation: ${focusY}`)
  if (zoomRatio <= navigationStart.zoomRatio ||
    Math.hypot(...pannedTarget.map((value, index) => value - navigationStart.target[index])) < 1 ||
    Math.abs(pitch - 50) > 1 || Math.abs(navigationReset.zoomRatio - navigationStart.zoomRatio) > 0.01 ||
    Math.hypot(...navigationReset.target.map((value, index) => value - navigationStart.target[index])) > 0.1) {
    throw new Error('Camera zoom, pan, pitch or reset failed')
  }
  if (Object.entries(bearings).some(([expected, actual]) =>
    Math.abs(((actual - Number(expected) + 540) % 360) - 180) > 0.1)) {
    throw new Error('Cardinal bearing controls failed')
  }
  if (bridgeClosed !== 'entryClosed' || !narrowSelected?.includes('citizen-0001') ||
    legacyOpen !== 'SHADOW CITY' || alternateSeed !== 'shadow-city-multilevel-02') {
    throw new Error('Bridge, narrow inspector, legacy, or alternate-seed check failed')
  }
  if (hardware && (fps < 50 || frameP95 > 33 || p95 > 5 || replayBenchmark.durationMs > 2000)) {
    throw new Error('Reference hardware performance gate failed')
  }
} finally { await browser.close() }
