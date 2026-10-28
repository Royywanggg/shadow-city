import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('docs/screenshots')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-webgl', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
const percentile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? null
}
try {
  const url = process.env.SHADOW_CITY_URL ??
    'http://127.0.0.1:5182/?seed=shadow-city-hero-01&population=120&lifeScenario=fatal-diagnostic'
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100,
    undefined, { timeout: 60_000 })
  await page.waitForTimeout(1000)
  const initial = await page.evaluate(() => {
    const gl = document.querySelector('.v06-viewport canvas')?.getContext('webgl2')
    const extension = gl?.getExtension('WEBGL_debug_renderer_info')
    return { tick: window.__shadowCityV06.getSnapshot().tick,
      sceneVersion: window.__shadowCityV06.getSnapshot().state.scene?.version,
      renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
      webglVersion: gl?.getParameter(gl.VERSION) ?? null,
      usedJsHeapBytes: performance.memory?.usedJSHeapSize ?? null }
  })
  await page.screenshot({ path: resolve(output, 'round4-hero-tick100-1440x900.png') })
  const durations = await page.evaluate(() => window.__shadowCityV06.advanceToTick(500))
  await page.waitForTimeout(800)
  const live = await page.evaluate(() => {
    const state = window.__shadowCityV06.getSnapshot().state
    return { tick: state.tick, deaths: state.life?.deaths.length ?? 0,
      scenes: state.scene?.entities.length ?? 0,
      discoveries: state.scene?.discoveries.length ?? 0,
      reports: window.__shadowCityV06.getObserverView().lifeReports?.length ?? 0,
      death: state.life?.deaths[0] ?? null,
      rendering: window.__shadowCityDiagnostics ?? null,
      usedJsHeapBytes: performance.memory?.usedJSHeapSize ?? null }
  })
  if (!live.death) throw new Error('No natural death in the fixed diagnostic run')
  await page.getByRole('button', { name: 'EVENT EXPLORER' }).click()
  await page.locator('[data-event-id="event:death:' + live.death.id + '"]').click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: resolve(output, 'round4-death-event-tick500-1440x900.png') })
  const availableAt500 = await page.locator('.v06-event-detail').innerText()
  await page.getByRole('button', { name: 'BEFORE', exact: true }).click()
  const before = await page.evaluate((deathId) => {
    const snapshot = window.__shadowCityV06.getSnapshot()
    return { tick: snapshot.tick,
      deathAvailable: snapshot.state.life.deaths.some((item) => item.id === deathId),
      sceneAvailable: snapshot.state.scene.entities.some((item) =>
        item.id === 'scene:' + deathId) }
  }, live.death.id)
  await page.screenshot({ path: resolve(output, 'round4-before-event-1440x900.png') })
  await page.getByRole('button', { name: 'EVENT TICK', exact: true }).click()
  const during = await page.evaluate((deathId) => {
    const snapshot = window.__shadowCityV06.getSnapshot()
    return { tick: snapshot.tick,
      deathAvailable: snapshot.state.life.deaths.some((item) => item.id === deathId),
      sceneAvailable: snapshot.state.scene.entities.some((item) =>
        item.id === 'scene:' + deathId),
      sceneStatus: snapshot.state.scene.entities.find((item) =>
        item.id === 'scene:' + deathId)?.status ?? null }
  }, live.death.id)
  await page.waitForTimeout(450)
  await page.screenshot({ path: resolve(output, 'round4-event-tick-1440x900.png') })
  await page.getByRole('button', { name: 'REPLAY THROUGH' }).click()
  await page.waitForFunction(({ tick, end }) =>
    window.__shadowCityV06.getSnapshot().tick === Math.min(tick + 8, end),
  { tick: live.death.tick, end: live.tick }, { timeout: 15_000 })
  const after = await page.evaluate(() => {
    const snapshot = window.__shadowCityV06.getSnapshot()
    return { tick: snapshot.tick, sceneCount: snapshot.state.scene.entities.length,
      isInspecting: snapshot.isInspecting }
  })
  await page.screenshot({ path: resolve(output, 'round4-after-event-1440x900.png') })
  await page.getByRole('button', { name: 'HIDE EVENTS' }).click()
  await page.setViewportSize({ width: 720, height: 900 })
  await page.getByRole('button', { name: 'EVENT EXPLORER' }).click()
  await page.waitForTimeout(350)
  await page.screenshot({ path: resolve(output, 'round4-event-narrow-720x900.png') })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'HIDE EVENTS' }).click()
  await page.getByRole('button', { name: 'Expand population' }).click()
  await page.getByRole('combobox', { name: 'Visible level' }).selectOption('L1')
  await page.getByRole('button', { name: 'HIDE ROOF' }).click()
  await page.evaluate(() => {
    const world = window.__shadowCityV06.getWorld()
    const place = world.places.find((item) => item.id === 'central-galleria')
    const node = world.navNodes.find((item) =>
      item.id === place.slotNodeIds.find((id) => world.navNodes.find((candidate) =>
        candidate.id === id)?.surfaceId === 'galleria-l1'))
    window.__shadowCityV06.inspectAtWorld(node.position.x / 1000,
      node.position.y / 1000, node.position.z / 1000)
  })
  await page.getByRole('button', { name: 'Compass: north up' }).click()
  for (const bearing of [0, 90, 180, 270]) {
    if (bearing !== 0) {
      for (let index = 0; index < 6; index += 1) {
        await page.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
      }
    }
    await page.waitForTimeout(350)
    await page.screenshot({ path: resolve(output,
      'round4-galleria-l1-bearing-' + bearing + '-1440x900.png') })
  }
  const frameTimes = await page.evaluate(async () => {
    const samples = []
    let previous = performance.now()
    for (let index = 0; index < 90; index += 1) {
      const next = await new Promise((done) => requestAnimationFrame(done))
      samples.push(next - previous)
      previous = next
    }
    return samples
  })
  const scalePage = await browser.newPage({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  scalePage.on('pageerror', (error) => errors.push('200 agents: ' + error.message))
  scalePage.on('console', (message) => {
    if (message.type() === 'error') errors.push('200 agents: ' + message.text())
  })
  const scaleUrl = new URL(url)
  scaleUrl.searchParams.set('population', '200')
  scaleUrl.searchParams.delete('lifeScenario')
  await scalePage.goto(scaleUrl.toString(), {
    waitUntil: 'domcontentloaded', timeout: 60_000 })
  await scalePage.waitForFunction(() =>
    window.__shadowCityV06?.getSnapshot()?.tick === 100,
  undefined, { timeout: 60_000 })
  const scaleTickDurations = await scalePage.evaluate(() =>
    window.__shadowCityV06.advanceToTick(500))
  await scalePage.waitForTimeout(800)
  await scalePage.screenshot({
    path: resolve(output, 'round4-hero-200-tick500-1440x900.png') })
  const scaleMetrics = await scalePage.evaluate(() => {
    const state = window.__shadowCityV06.getSnapshot().state
    return { tick: state.tick, population: state.citizens.length,
      scenes: state.scene?.entities.length ?? null,
      discoveries: state.scene?.discoveries.length ?? null,
      renderer: (() => {
        const gl = document.querySelector('.v06-viewport canvas')?.getContext('webgl2')
        const extension = gl?.getExtension('WEBGL_debug_renderer_info')
        return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null
      })(),
      rendering: window.__shadowCityDiagnostics ?? null,
      usedJsHeapBytes: performance.memory?.usedJSHeapSize ?? null }
  })
  const scaleReplay500 = await scalePage.evaluate(() =>
    window.__shadowCityV06.benchmarkReplay500())
  await scalePage.close()
  const report = { date: new Date().toISOString(), browser: browser.version(),
    viewport: '1440x900', dpr: 1, url, initial, live, before, during, after,
    selectedDetailHasTruth: availableAt500.includes(live.death.id),
    tickP50Ms: percentile(durations, 0.5), tickP95Ms: percentile(durations, 0.95),
    frameP50Ms: percentile(frameTimes, 0.5),
    frameP95Ms: percentile(frameTimes, 0.95),
    scale200: { ...scaleMetrics,
      tickP50Ms: percentile(scaleTickDurations, 0.5),
      tickP95Ms: percentile(scaleTickDurations, 0.95),
      replay500Ms: scaleReplay500.durationMs }, errors }
  await writeFile(resolve(output, 'round4-browser-report.json'),
    JSON.stringify(report, null, 2) + '\n')
  if (errors.length || before.deathAvailable || before.sceneAvailable ||
    !during.deathAvailable || !during.sceneAvailable ||
    !report.selectedDetailHasTruth) {
    throw new Error('Round 4 browser assertions failed: ' + JSON.stringify(report))
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
} finally {
  await browser.close()
}
