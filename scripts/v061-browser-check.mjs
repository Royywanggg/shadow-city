import { chromium } from 'playwright'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.SHADOW_CITY_CHROME ??
  (process.platform === 'darwin' && existsSync(chromePath) ? chromePath : undefined)
const output = resolve('.visual/v061')
const curated = resolve('docs/screenshots')
await mkdir(output, { recursive: true })
await mkdir(curated, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath,
  args: ['--enable-webgl'] })
const errors = []
const screenshots = []
const url = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/')
url.searchParams.set('seed', 'shadow-city-hero-01')
url.searchParams.set('population', '120')
url.searchParams.set('test', '1')

const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1 })
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

async function screenshot(name, copyToDocs = false, targetPage = page) {
  const path = resolve(output, name + '.png')
  await targetPage.screenshot({ path })
  screenshots.push({ name, path, curated: copyToDocs })
  if (copyToDocs) await copyFile(path, resolve(curated, name + '.png'))
}

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * .95) - 1)] ?? null
}

let report = null
try {
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100 &&
    window.__shadowCityV06Agents?.tick === 100, undefined, { timeout: 60000 })
  await page.waitForTimeout(1200)
  const renderer = await page.evaluate(() => {
    const canvas = document.querySelector('.v06-viewport canvas')
    const gl = canvas?.getContext('webgl2')
    if (!gl) return { name: null, api: null }
    const extension = gl.getExtension('WEBGL_debug_renderer_info')
    const name = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null
    return { name, api: gl.getParameter(gl.VERSION) }
  })
  const gpuKind = renderer.name === null ? 'unknown' :
    /swiftshader|software|llvmpipe/i.test(renderer.name) ? 'software' : 'hardware'
  await screenshot('v061-hero-tick100-1440x900', true)

  const advancedTo121 = await page.evaluate(() => window.__shadowCityV06.advanceToTick(121))
  await page.waitForFunction(() => window.__shadowCityV06Agents?.tick === 121)
  const activeConversation = await page.evaluate(() => {
    const snapshot = window.__shadowCityV06.getSnapshot()
    const interaction = snapshot.state.social.interactions.find((item) =>
      item.type === 'conversation' && item.status === 'active' &&
      item.startTick <= snapshot.tick && snapshot.tick < item.plannedEndTick)
    if (!interaction) return null
    const participants = interaction.participantIds.map((id) =>
      snapshot.state.citizens.find((citizen) => citizen.id === id))
    return { id: interaction.id, encounterId: interaction.encounterId,
      participantIds: interaction.participantIds, startTick: interaction.startTick,
      plannedEndTick: interaction.plannedEndTick,
      participants: participants.map((citizen) => ({
        id: citizen.id, activity: citizen.activity, surfaceId: citizen.surfaceId,
        position: citizen.position })) }
  })
  if (!activeConversation) throw new Error('No natural conversation is active at Tick 121')
  await page.locator('[data-agent-id="' + activeConversation.participantIds[0] + '"]').click()
  await page.getByRole('button', { name: 'ENCOUNTERS', exact: true }).click()
  const episodeRowIndex = await page.locator('.v06-encounter-row').evaluateAll((rows, id) =>
    rows.findIndex((row) => row.getAttribute('data-encounter-id') === id),
  activeConversation.encounterId)
  if (episodeRowIndex < 0) throw new Error('Natural conversation episode missing from inspector')
  await page.locator('.v06-encounter-row').nth(episodeRowIndex).click()
  await page.evaluate(() => window.__shadowCityV06.inspectTick(121))
  await page.waitForFunction(() => window.__shadowCityV06.getSnapshot().tick === 121)
  const midpoint = activeConversation.participants.reduce((sum, person) => ({
    x: sum.x + person.position.x / 2000,
    y: sum.y + person.position.y / 2000,
    z: sum.z + person.position.z / 2000,
  }), { x: 0, y: 0, z: 0 })
  await page.evaluate((point) => window.__shadowCityV06.inspectAtWorld(
    point.x, point.y, point.z), midpoint)
  await page.waitForTimeout(1500)
  const activeVisualLabel = await page.locator('.v06-encounter-label.active').evaluateAll(
    (labels) => labels.map((label) => ({ text: label.textContent?.trim() ?? '',
      visible: !!(label.offsetWidth && label.offsetHeight) })))
  await screenshot('v061-conversation-active-tick121-1440x900', true)
  const activeUi = await page.locator('.v06-inspector').innerText()

  await page.evaluate(() => window.__shadowCityV06.advanceToTick(126))
  await page.evaluate(() => window.__shadowCityV06.inspectTick(126))
  await page.waitForFunction(() => window.__shadowCityV06Agents?.tick === 126)
  await screenshot('v061-conversation-complete-tick126-1440x900', true)

  const advanceTo500Durations = await page.evaluate(() =>
    window.__shadowCityV06.advanceToTick(500))
  await page.evaluate(() => window.__shadowCityV06.inspectTick(500))
  await page.waitForFunction(() => document.querySelector('.v06-bottom')?.textContent?.includes('TICK 500'))
  await page.waitForTimeout(1500)
  const renderedAgentTick500 = await page.evaluate(() => window.__shadowCityV06Agents?.tick ?? null)
  await page.getByRole('button', { name: 'RESET VIEW' }).click()
  await page.waitForTimeout(400)
  await screenshot('v061-hero-tick500-1440x900', true)
  await page.getByRole('button', { name: 'RELATIONSHIPS', exact: true }).click()
  await screenshot('v061-relationships-tick500-1440x900', true)
  const relationshipText = await page.locator('.v06-research-list').innerText()
  await page.getByRole('button', { name: 'MEMORY', exact: true }).click()
  await screenshot('v061-memory-tick500-1440x900', true)
  const memoryText = await page.locator('.v06-research-list').innerText()
  await page.getByRole('button', { name: 'ENCOUNTERS', exact: true }).click()
  await screenshot('v061-encounter-history-tick500-1440x900', true)
  await page.getByRole('button', { name: 'TIMELINE', exact: true }).click()
  const firstTimeline = page.locator('.v06-timeline-row').first()
  const timelineLabel = await firstTimeline.innerText()
  const targetTick = Number(/^T(\d+)/.exec(timelineLabel)?.[1])
  if (!Number.isSafeInteger(targetTick)) throw new Error('Timeline row has no Tick')
  await firstTimeline.click()
  const timelineSeekTick = await page.evaluate(() => window.__shadowCityV06.getSnapshot().tick)
  if (timelineSeekTick !== targetTick) throw new Error('Timeline did not seek actual simulation Tick')
  await screenshot('v061-timeline-seek-1440x900')
  await page.getByRole('button', { name: 'RETURN LIVE' }).click()
  await page.getByRole('combobox', { name: 'Information view' }).selectOption('observed')
  const observerBoundary = await page.evaluate(() => {
    const snapshot = window.__shadowCityV06.getSnapshot()
    const view = window.__shadowCityV06.getObserverView()
    const serialized = JSON.stringify(view)
    return { tick: view.tick, visibleReports: view.reports.length,
      truthOffences: snapshot.state.offences.length,
      reportFields: view.reports[0] ? Object.keys(view.reports[0]) : [],
      excludesHidden: !/offenderAgentId|offenceId|encounterId|witnessAssessments|memories|relationships/.test(serialized),
      onlyAvailable: view.reports.every((item) => item.availableTick <= view.tick),
      godViewVisible: Boolean(document.querySelector('.v06-inspector')) }
  })
  const observedFooter = await page.locator('.v06-bottom>span').innerText()
  await screenshot('v061-observed-god-view-tick500-1440x900')
  await page.getByRole('slider', { name: 'Replay tick' }).fill('100')
  await page.waitForFunction(() => window.__shadowCityV06.getSnapshot().tick === 100)
  const replay100 = await page.evaluate(() => ({
    tick: window.__shadowCityV06.getSnapshot().tick,
    socialEpisodeCount: window.__shadowCityV06.getSnapshot().state.social.encounters.active.length +
      window.__shadowCityV06.getSnapshot().state.social.encounters.completed.length }))
  await screenshot('v061-replay-tick100-1440x900')
  await page.getByRole('button', { name: 'RETURN LIVE' }).click()
  await page.getByRole('button', { name: 'Compass: north up' }).click()
  const bearings = {}
  for (const bearing of [0, 90, 180, 270]) {
    if (bearing !== 0) {
      for (let turn = 0; turn < 6; turn += 1) {
        await page.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
      }
    }
    await page.waitForTimeout(150)
    bearings[bearing] = await page.evaluate(() =>
      window.__shadowCityV06.getCameraView().bearingDeg)
    await screenshot('v061-bearing-' + bearing + '-tick500-1440x900')
  }
  await page.getByRole('button', { name: 'RESET VIEW' }).click()

  const narrow = await browser.newPage({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1 })
  narrow.on('pageerror', (error) => errors.push('narrow: ' + error.message))
  await narrow.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await narrow.waitForFunction(() => window.__shadowCityV06Agents?.tick === 100,
    undefined, { timeout: 60000 })
  await narrow.getByRole('button', { name: 'Collapse population' }).click()
  await screenshot('v061-narrow-collapsed-tick100-390x844', true, narrow)
  await narrow.getByRole('button', { name: 'Expand population' }).click()
  await narrow.locator('[data-agent-id="citizen-0015"]').click()
  await narrow.getByRole('button', { name: 'ENCOUNTERS', exact: true }).click()
  const narrowSelected = await narrow.locator('.v06-inspector>small').innerText()
  await screenshot('v061-narrow-inspector-tick100-390x844', true, narrow)
  await narrow.close()

  await page.getByRole('button', { name: 'PLAY', exact: true }).click()
  const frameTimes = await page.evaluate(async () => {
    const times = []
    const until = performance.now() + 3000
    while (performance.now() < until) {
      await new Promise((done) => requestAnimationFrame(done))
      times.push(performance.now())
    }
    return times
  })
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  const intervals = frameTimes.slice(1).map((value, index) => value - frameTimes[index])
  const fps = frameTimes.length > 1 ?
    1000 * (frameTimes.length - 1) / (frameTimes.at(-1) - frameTimes[0]) : null
  const rendering = await page.evaluate(() =>
    window.__shadowCityDiagnostics ?? window.__shadowCityV06Rendering ?? null)
  const final = await page.evaluate(() => {
    const snapshot = window.__shadowCityV06.getSnapshot()
    return { tick: snapshot.tick, population: snapshot.state.citizens.length,
      episodes: snapshot.state.social.encounters.active.length +
        snapshot.state.social.encounters.completed.length,
      interactions: snapshot.state.social.interactions.length,
      conversations: snapshot.state.social.interactions.filter((item) =>
        item.type === 'conversation').length,
      offences: snapshot.state.offences.length,
      reports: snapshot.state.reports.length,
      usedJsHeapBytes: performance.memory?.usedJSHeapSize ?? null }
  })
  const page200 = await browser.newPage({ viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1 })
  page200.on('pageerror', (error) => errors.push('population200: ' + error.message))
  const url200 = new URL(url)
  url200.searchParams.set('population', '200')
  await page200.goto(url200.toString(), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page200.waitForFunction(() => window.__shadowCityV06Agents?.tick === 100 &&
    window.__shadowCityV06.getSnapshot().state.citizens.length === 200,
  undefined, { timeout: 60000 })
  await page200.waitForTimeout(5000)
  const tickDurations200 = await page200.evaluate(() =>
    window.__shadowCityV06.advanceToTick(200))
  await page200.waitForFunction(() => document.querySelector('.v06-bottom')?.textContent?.includes('TICK 200'))
  await page200.waitForTimeout(1000)
  const renderedAgentTick200 = await page200.evaluate(() => window.__shadowCityV06Agents?.tick ?? null)
  await page200.getByRole('button', { name: 'PLAY', exact: true }).click()
  const frameTimes200 = await page200.evaluate(async () => {
    const times = []
    const until = performance.now() + 2000
    while (performance.now() < until) {
      await new Promise((done) => requestAnimationFrame(done))
      times.push(performance.now())
    }
    return times
  })
  await page200.getByRole('button', { name: 'PAUSE', exact: true }).click()
  const intervals200 = frameTimes200.slice(1).map((value, index) =>
    value - frameTimes200[index])
  const population200 = { population: 200, viewport: '1440x900 CSS pixels', dpr: 1,
    renderer: await page200.evaluate(() => {
      const gl = document.querySelector('.v06-viewport canvas')?.getContext('webgl2')
      const extension = gl?.getExtension('WEBGL_debug_renderer_info')
      return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null
    }),
    fps: frameTimes200.length > 1 ? 1000 * (frameTimes200.length - 1) /
      (frameTimes200.at(-1) - frameTimes200[0]) : null,
    p95FrameIntervalMs: p95(intervals200), frames: frameTimes200.length,
    p95AdvanceTickMs: p95(tickDurations200), renderedAgentTick200,
    rendering: await page200.evaluate(() => window.__shadowCityDiagnostics ??
      window.__shadowCityV06Rendering ?? null) }
  await page200.close()
  report = { dateUtc: new Date().toISOString(),
    citySeed: 'shadow-city-hero-01', simulationSeed: 'shadow-city-sim-01',
    socialSeed: 'shadow-city-social-01', population: 120,
    scenario: { greetingWillingness: 0.70, conversationWillingness: 0.85,
      diagnosticTraces: true },
    viewport: '1440x900 CSS pixels', dpr: 1, browser: 'Google Chrome ' + browser.version(),
    userAgent: await page.evaluate(() => navigator.userAgent), renderer,
    gpuKind, activeConversation, activeVisualLabel, activeUiContainsConversation:
      /conversation|CONVERSATION/.test(activeUi),
    relationshipTextHasConversation: /conversation/.test(relationshipText),
    memoryTextHasInteraction: /interaction/.test(memoryText),
    timelineSeek: { label: timelineLabel, expectedTick: targetTick, actualTick: timelineSeekTick },
    observerBoundary, observedFooter, replay100, bearings, narrowSelected,
    renderedAgentTick500,
    renderPerformance: { fps, p95FrameIntervalMs: p95(intervals),
      frames: frameTimes.length, rendering,
      p95AdvanceTickMs: p95(advanceTo500Durations),
      replay500: await page.evaluate(() => window.__shadowCityV06.benchmarkReplay500()) },
    population200, final, screenshots, errors }
  await writeFile(resolve(curated, 'v061-browser-results.json'),
    JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
  if (errors.length > 0) throw new Error('Browser console reported errors')
  if (!observerBoundary.excludesHidden || !observerBoundary.onlyAvailable ||
    !observerBoundary.godViewVisible || /TRUE EVENTS/.test(observedFooter)) {
    throw new Error('Observer/God View information boundary failed')
  }
  if (!activeVisualLabel.some((label) => label.visible &&
    label.text.includes('CONVERSATION'))) {
    throw new Error('Active conversation has no visible map label')
  }
  if (!activeUi.includes('conversation') ||
    !relationshipText.includes('conversation') || !memoryText.includes('interaction')) {
    throw new Error('God View conversation/relationship/memory inspection failed')
  }
} finally {
  await browser.close()
}
