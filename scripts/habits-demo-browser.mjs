import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.SHADOW_CITY_CHROME ??
  (process.platform === 'darwin' && existsSync(chromePath) ? chromePath : undefined)
const url = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/')
for (const [key, value] of Object.entries({ seed: 'shadow-city-hero-01',
  population: '12', simSeed: 'habits-paired-1:activity',
  habitSeed: 'habits-paired-1:habit', habitWeight: '0.2',
  offendingSeed: 'habits-paired-1:offending',
  observationSeed: 'habits-paired-1:observation', encounter: 'off' })) {
  url.searchParams.set(key, value)
}
const command = { id: 'habit-close:1', effectiveTick: 1920,
  accessId: 'place:building:building-block-3-0-0-0', mode: 'closed' }
const output = resolve('docs/screenshots')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath,
  args: ['--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
try {
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100,
    undefined, { timeout: 60_000 })
  await page.evaluate((item) => window.__shadowCityV06.scheduleAccessCommand(item), command)
  await page.evaluate(() => window.__shadowCityV06.advanceToTick(3042))
  await page.waitForFunction(() => window.__shadowCityV06.getSnapshot().tick === 3042)
  const decision = await page.evaluate(() => {
    const snapshot = window.__shadowCityV06.getSnapshot()
    const habit = snapshot.state.habits.citizens.find((item) =>
      item.agentId === 'citizen-0000')
    const trace = habit.decisions.chunks.flat().at(-1)
    const citizen = snapshot.state.citizens.find((item) => item.id === 'citizen-0000')
    return { tick: snapshot.tick, intention: habit.intention, citizen,
      trace: { id: trace.id, chosenKind: trace.chosenKind,
        chosenPlaceId: trace.chosenPlaceId,
        chosen: trace.candidates.find((item) => item.kind === trace.chosenKind &&
          item.placeId === trace.chosenPlaceId),
        closed: trace.candidates.filter((item) => item.placeId ===
          'building:building-block-3-0-0-0') } }
  })
  await page.locator('[data-agent-id="citizen-0000"]').click()
  await page.getByRole('button', { name: 'DECISIONS', exact: true }).click()
  await page.getByRole('button', { name: 'FOCUS', exact: true }).click()
  await page.waitForTimeout(600)
  await page.locator('.v06-research-card').first().scrollIntoViewIfNeeded()
  const inspectorText = await page.locator('.v06-inspector').innerText()
  await page.screenshot({ path: resolve(output,
    'habits-demo-decision-day1-tick3042-1440x900.png') })
  await page.getByRole('button', { name: /SHOW ALL .* CANDIDATES/ }).click()
  await page.locator('.v06-research-card').filter({ hasText:
    'building:building-block-3-0-0-0 · closed' }).first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output,
    'habits-demo-closed-candidate-day1-tick3042-1440x900.png') })
  await page.evaluate(() => window.__shadowCityV06.advanceToTick(3123))
  await page.getByRole('button', { name: 'TODAY', exact: true }).click()
  await page.locator('.v06-research-list p').filter({ hasText:
    'T3057–3123 · eat · completed' }).first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const actual = await page.evaluate(() => {
    const snapshot = window.__shadowCityV06.getSnapshot()
    const habit = snapshot.state.habits.citizens.find((item) =>
      item.agentId === 'citizen-0000')
    const matching = habit.history.chunks.flat().find((item) =>
      item.intentionId.includes(':3042:'))
    return { tick: snapshot.tick, matching }
  })
  await page.screenshot({ path: resolve(output,
    'habits-demo-actual-day1-tick3123-1440x900.png') })
  await page.evaluate(() => window.__shadowCityV06.inspectTick(3042))
  const replay = await page.evaluate(() => {
    const snapshot = window.__shadowCityV06.getSnapshot()
    const habit = snapshot.state.habits.citizens.find((item) =>
      item.agentId === 'citizen-0000')
    return { tick: snapshot.tick, intentionId: habit.intention?.id,
      lastDecisionId: habit.decisions.chunks.flat().at(-1)?.id }
  })
  await page.screenshot({ path: resolve(output,
    'habits-demo-replay-day1-tick3042-1440x900.png') })
  await page.evaluate(() => {
    window.__shadowCityV06.resetSimulation()
    window.__shadowCityV06.advanceToTick(7600)
  })
  await page.getByRole('button', { name: 'TODAY', exact: true }).click()
  const completedDayTwo = page.locator('.v06-research-list p').filter({ hasText:
    /^T\d+–\d+ · .* · completed/ })
  if (await completedDayTwo.count()) await completedDayTwo.first().scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output,
    'habits-demo-day2-tick7600-1440x900.png') })
  const later = await page.evaluate(() => {
    window.__shadowCityV06.advanceToTick(7700)
    const snapshot = window.__shadowCityV06.getSnapshot()
    const habit = snapshot.state.habits.citizens.find((item) =>
      item.agentId === 'citizen-0000')
    const history = habit.history.chunks.flat()
    return { tick: snapshot.tick, day: habit.day,
      day1: history.filter((item) => item.startTick >= 1920 && item.startTick < 4800),
      day2: history.filter((item) => item.startTick >= 4800 && item.startTick < 7680),
      learnedPlaces: habit.placeStrength }
  })
  const report = { dateUtc: new Date().toISOString(), browserVersion: browser.version(),
    url: url.toString(), viewport: '1440x900', dpr: 1, command,
    decision, actual, replay, later,
    uiGrounded: inspectorText.includes(decision.trace.chosenPlaceId) &&
      inspectorText.includes('candidates evaluated'), errors,
    screenshots: ['habits-demo-decision-day1-tick3042-1440x900.png',
      'habits-demo-closed-candidate-day1-tick3042-1440x900.png',
      'habits-demo-actual-day1-tick3123-1440x900.png',
      'habits-demo-replay-day1-tick3042-1440x900.png',
      'habits-demo-day2-tick7600-1440x900.png'] }
  await writeFile(resolve(output, 'habits-demo-browser-results.json'),
    JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ decision: report.decision.trace,
    actual: report.actual, replay: report.replay,
    uiGrounded: report.uiGrounded, errors }, null, 2))
} finally {
  await browser.close()
}
