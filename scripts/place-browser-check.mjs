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
const percentile = (items, ratio) => {
  const sorted = [...items].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? null
}
try {
  const url = process.env.SHADOW_CITY_URL ??
    'http://127.0.0.1:5185/?seed=shadow-city-hero-01&population=120'
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100,
    undefined, { timeout: 60000 })
  await page.waitForTimeout(900)
  await page.getByRole('button', { name: 'PLACE INSPECTOR' }).click()
  await page.getByRole('combobox', { name: 'Inspect Galleria place' })
    .selectOption('galleria-retail-l0')
  await page.screenshot({ path: resolve(output, 'place-inspector-tick100-1440x900.png') })
  await page.getByRole('button', { name: 'FOCUS PLACE' }).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: resolve(output, 'place-retail-l0-close-1440x900.png') })
  await page.getByRole('combobox', { name: 'Inspect Galleria place' })
    .selectOption('galleria-retail-l1')
  await page.getByRole('button', { name: 'FOCUS PLACE' }).click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: resolve(output, 'place-retail-l1-close-1440x900.png') })
  await page.getByRole('button', { name: 'Close Place Inspector' }).click()
  await page.mouse.click(720, 455)
  await page.waitForTimeout(300)
  const mapPickedSurface = await page.locator('[aria-label="Picked surface"]')
    .textContent().catch(() => null)
  if (!mapPickedSurface?.includes('galleria-l1') ||
    await page.getByRole('complementary', { name: 'God View Place Inspector' }).count() !== 1) {
    throw new Error(`Galleria floor pick did not open Place Inspector: ${mapPickedSurface}`)
  }
  await page.getByRole('combobox', { name: 'Inspect Galleria place' })
    .selectOption('galleria-retail-l1')
  const durations = await page.evaluate(() => window.__shadowCityV06.advanceToTick(500))
  await page.waitForTimeout(600)
  const result = await page.evaluate(() => {
    const state = window.__shadowCityV06.getSnapshot().state
    const shopFinishes = state.events.filter((item) => item.type === 'ActivityFinished' &&
      item.placeId?.startsWith('galleria-retail-'))
    const encounters = [...(state.social?.encounters.active ?? []),
      ...(state.social?.encounters.completed ?? [])]
    const examples = shopFinishes.map((finish) => {
      const starts = state.events.filter((item) => item.agentId === finish.agentId &&
        item.type === 'ActivityStarted' && item.placeId === finish.placeId &&
        item.tick <= finish.tick)
      const start = starts.at(-1)
      const trip = state.events.filter((item) => item.agentId === finish.agentId &&
        item.type === 'TripStarted' && item.placeId === finish.placeId &&
        item.tick <= (start?.tick ?? finish.tick)).at(-1)
      const contact = encounters.find((item) => item.participantIds.includes(finish.agentId) &&
        item.startedTick >= (trip?.tick ?? start?.tick ?? 0) &&
        item.startedTick <= finish.tick &&
        (item.placeId?.startsWith('galleria-') ?? false))
      return { finish, start, trip, contact: contact ? {
        id: contact.id, placeId: contact.placeId, startedTick: contact.startedTick,
        participantIds: contact.participantIds } : null }
    })
    const selected = examples.find((item) => item.contact) ?? examples[0] ?? null
    const gl = document.querySelector('.v06-viewport canvas')?.getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_debug_renderer_info')
    return { tick: state.tick,
      totalMallVisits: state.events.filter((item) => item.type === 'DestinationReached' &&
        (item.placeId === 'central-galleria' || item.placeId?.startsWith('galleria-'))).length,
      completedMallShopping: shopFinishes.length,
      indoorEncounters: encounters.filter((item) =>
        item.placeId?.startsWith('galleria-')).length,
      indoorOffences: state.offences.filter((item) =>
        item.placeId?.startsWith('galleria-')).length,
      selected,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      rendering: window.__shadowCityDiagnostics ?? null,
      placeRuntime: state.placeRuntime?.places.filter((item) =>
        item.placeId.startsWith('galleria-') || item.placeId === 'central-galleria'),
      heapBytes: performance.memory?.usedJSHeapSize ?? null }
  })
  await page.screenshot({ path: resolve(output, 'place-inspector-tick500-1440x900.png') })
  const frames = await page.evaluate(async () => {
    const values = []
    let previous = performance.now()
    for (let i = 0; i < 120; i += 1) {
      const now = await new Promise((done) => requestAnimationFrame(done))
      values.push(now - previous)
      previous = now
    }
    return values
  })
  const report = { date: new Date().toISOString(), browser: browser.version(),
    url, viewport: '1440x900', dpr: 1, mapPickedSurface, ...result, errors,
    tickP50Ms: percentile(durations, 0.5), tickP95Ms: percentile(durations, 0.95),
    frameP50Ms: percentile(frames, 0.5), frameP95Ms: percentile(frames, 0.95),
    replay500Ms: await page.evaluate(() =>
      window.__shadowCityV06.benchmarkReplay500().durationMs) }
  await writeFile(resolve(output, 'place-browser-report.json'),
    JSON.stringify(report, null, 2) + '\n')
  await page.setViewportSize({ width: 720, height: 900 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: resolve(output, 'place-inspector-tick500-720x900.png') })
  console.log(JSON.stringify({ browser: report.browser, renderer: report.renderer,
    totalMallVisits: report.totalMallVisits, completedMallShopping: report.completedMallShopping,
    indoorEncounters: report.indoorEncounters, indoorOffences: report.indoorOffences,
    selected: report.selected, errors, tickP95Ms: report.tickP95Ms,
    frameP95Ms: report.frameP95Ms, replay500Ms: report.replay500Ms }, null, 2))
} finally {
  await browser.close()
}
