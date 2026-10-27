import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('docs/screenshots')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-webgl', '--ignore-gpu-blocklist'] })
const percentile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? null
}
const scenarios = process.env.SHADOW_CITY_LIFE_SCENARIOS?.split(',') ??
  ['default', 'diagnostic', 'fatal', 'scale200', 'scale200Legacy']
const errors = []
const checks = []
try {
  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1 })
    page.on('pageerror', (error) => errors.push(`${scenario}: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${scenario}: ${message.text()}`)
    })
    const url = new URL('http://127.0.0.1:5181/')
    url.searchParams.set('seed', 'shadow-city-hero-01')
    url.searchParams.set('population', scenario.startsWith('scale200') ? '200' : '120')
    if (scenario === 'scale200Legacy') url.searchParams.set('life', 'off')
    if (scenario === 'diagnostic') url.searchParams.set('lifeScenario', 'high-harm-diagnostic')
    if (scenario === 'fatal') url.searchParams.set('lifeScenario', 'fatal-diagnostic')
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100,
      undefined, { timeout: 60000 })
    await page.waitForTimeout(1200)
    const initial = await page.evaluate(() => {
      const state = window.__shadowCityV06.getSnapshot().state
      const gl = document.querySelector('.v06-viewport canvas')?.getContext('webgl2')
      const ext = gl?.getExtension('WEBGL_debug_renderer_info')
      return { tick: state.tick, injuries: state.life?.injuries.length ?? null,
        deaths: state.life?.deaths.length ?? null,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
        api: gl?.getParameter(gl.VERSION) ?? null,
        rendering: window.__shadowCityDiagnostics ?? null,
        character: window.__shadowCityV06Agents ? {
          assetLoadMs: window.__shadowCityV06Agents.characterAssetLoadMs,
          assetMode: window.__shadowCityV06Agents.characterAssetMode,
          farCount: window.__shadowCityV06Agents.farCount,
          mediumCount: window.__shadowCityV06Agents.mediumCount,
          closeCount: window.__shadowCityV06Agents.closeCount,
          animationUpdateMs: window.__shadowCityV06Agents.animationUpdateMs,
        } : null }
    })
    await page.screenshot({ path: resolve(output, `life-${scenario}-hero-tick100-1440x900.png`) })
    const tickDurations = await page.evaluate(() => window.__shadowCityV06.advanceToTick(500))
    await page.waitForTimeout(700)
    const result = await page.evaluate(() => {
      const state = window.__shadowCityV06.getSnapshot().state
      const world = window.__shadowCityV06.getWorld()
      const outdoorDeath = state.life?.deaths.find((death) =>
        !world.surfaces.find((surface) => surface.id === death.surfaceId)?.indoor)
      return { tick: state.tick, injuries: state.life?.injuries.length ?? null,
        deaths: state.life?.deaths.length ?? null,
        deathLocations: state.life?.deaths.map((item) => ({ agentId: item.victimAgentId,
          tick: item.tick, surfaceId: item.surfaceId, levelId: item.levelId,
          position: item.position })) ?? [],
        observations: state.life?.observations.length ?? null,
        reports: window.__shadowCityV06.getObserverView().lifeReports?.length ?? null,
        sceneCount: state.life?.scenes.length ?? null,
        deadId: outdoorDeath?.victimAgentId ??
          state.life?.people.find((item) => item.lifeStatus === 'deceased')?.agentId ?? null,
        injuredId: state.life?.people.find((item) => item.lifeStatus === 'alive' &&
          item.functionalStatus !== 'unimpaired')?.agentId ?? null,
        rendering: window.__shadowCityDiagnostics ?? null,
        character: window.__shadowCityV06Agents ? {
          assetLoadMs: window.__shadowCityV06Agents.characterAssetLoadMs,
          assetMode: window.__shadowCityV06Agents.characterAssetMode,
          farCount: window.__shadowCityV06Agents.farCount,
          mediumCount: window.__shadowCityV06Agents.mediumCount,
          closeCount: window.__shadowCityV06Agents.closeCount,
          animationUpdateMs: window.__shadowCityV06Agents.animationUpdateMs,
        } : null,
        usedJsHeapBytes: performance.memory?.usedJSHeapSize ?? null }
    })
    const lifeTimings = await page.evaluate(() => window.__shadowCityV06.getLifeTimings())
    await page.screenshot({ path: resolve(output, `life-${scenario}-hero-tick500-1440x900.png`) })
    const selectedId = result.deadId ?? result.injuredId
    if (selectedId) {
      await page.locator(`[data-agent-id="${selectedId}"]`).click()
      await page.getByRole('button', { name: 'LIFE', exact: true }).click()
      await page.waitForTimeout(500)
      await page.locator('.v06-inspector').evaluate((element) => { element.scrollTop = element.scrollHeight })
      await page.screenshot({ path: resolve(output,
        `life-${scenario}-inspector-tick500-1440x900.png`) })
      if (result.deadId) {
        await page.locator('.v06-inspector .v06-research-list .v06-timeline-row').last().click()
        await page.waitForTimeout(700)
        await page.screenshot({ path: resolve(output,
          `life-${scenario}-death-event-close-1440x900.png`) })
        await page.mouse.move(875, 450)
        await page.mouse.wheel(0, -390)
        await page.waitForTimeout(500)
        await page.screenshot({ path: resolve(output,
          `life-${scenario}-death-event-detail-1440x900.png`) })
        const deathTick = result.deathLocations.find((item) => item.agentId === result.deadId)
        if (deathTick) {
          const atDeath = await page.evaluate((id) => {
            const snapshot = window.__shadowCityV06.getSnapshot()
            return { tick: snapshot.tick, person: snapshot.state.life.people.find((item) =>
              item.agentId === id) }
          }, result.deadId)
          const beforeDeath = await page.evaluate(({ id, tick }) => {
            const state = window.__shadowCityV06.inspectTick(tick - 1)
            return { tick: state.tick, person: state.life.people.find((item) =>
              item.agentId === id) }
          }, { id: result.deadId, tick: deathTick.tick })
          await page.locator('.v06-inspector').evaluate((element) => { element.scrollTop = 0 })
          await page.waitForTimeout(250)
          await page.screenshot({ path: resolve(output,
            `life-${scenario}-before-death-1440x900.png`) })
          result.eventReview = { atDeath, beforeDeath }
        }
        await page.getByRole('button', { name: 'RETURN LIVE', exact: true }).click()
        await page.getByRole('button', { name: 'RESET VIEW', exact: true }).click()
      }
    }
    await page.getByRole('button', { name: 'PLAY', exact: true }).click()
    const stamps = await page.evaluate(async () => {
      const times = []
      const until = performance.now() + 2000
      while (performance.now() < until) {
        await new Promise((done) => requestAnimationFrame(done))
        times.push(performance.now())
      }
      return times
    })
    await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
    const intervals = stamps.slice(1).map((time, index) => time - stamps[index])
    const replay500 = scenario === 'default' || scenario.startsWith('scale200') ? await page.evaluate(() =>
      window.__shadowCityV06.benchmarkReplay500()) : null
    checks.push({ scenario, url: url.toString(), initial, result,
      replay500,
      lifeTimingMs: { outcomeP50: percentile(lifeTimings.map((item) => item.outcomeMs), 0.5),
        outcomeP95: percentile(lifeTimings.map((item) => item.outcomeMs), 0.95),
        discoveryP95: percentile(lifeTimings.map((item) => item.discoveryMs), 0.95),
        newDeaths: lifeTimings.reduce((sum, item) => sum + item.newDeaths, 0) },
      tickMs: { p50: percentile(tickDurations, 0.5), p95: percentile(tickDurations, 0.95) },
      frames: { count: stamps.length, meanFps: stamps.length > 1 ?
        1000 * (stamps.length - 1) / (stamps.at(-1) - stamps[0]) : null,
        p50IntervalMs: percentile(intervals, 0.5),
        p95IntervalMs: percentile(intervals, 0.95) } })
    await page.close()
  }
  const report = { date: new Date().toISOString(), browserVersion: browser.version(),
    viewport: '1440x900', dpr: 1, checks, errors }
  await writeFile(resolve(output, process.env.SHADOW_CITY_LIFE_SCENARIOS ?
    'life-browser-legacy-results.json' : 'life-browser-results.json'),
    JSON.stringify(report, null, 2) + '\n')
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
} finally {
  await browser.close()
}
