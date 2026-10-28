import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const seed = 'place-paired-03'
const params = new URLSearchParams({ seed: 'shadow-city-hero-01', population: '120',
  simSeed: seed, habitSeed: seed + '-habits', offendingSeed: seed + '-offending',
  observationSeed: seed + '-observation', socialSeed: seed + '-social',
  lifeSeed: seed + '-life' })
const url = `http://127.0.0.1:5185/?${params}`
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
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100,
    undefined, { timeout: 60000 })
  await page.getByRole('button', { name: 'Collapse population' }).click()
  const record = await page.evaluate(() => {
    window.__shadowCityV06.advanceToTick(500)
    const state = window.__shadowCityV06.getSnapshot().state
    const offence = state.offences.find((item) => item.target.kind === 'citizen' &&
      item.placeId === 'galleria-cafe-l1')
    if (!offence) throw new Error('Fixed seed did not produce indoor person-based offence')
    const people = [offence.offenderAgentId, offence.target.id]
    const activities = people.map((agentId) => ({ agentId,
      events: state.events.filter((item) => item.agentId === agentId &&
        item.placeId === 'galleria-cafe-l1' && item.tick <= offence.tick),
      decisions: state.habits.citizens.find((item) => item.agentId === agentId)
        .decisions.chunks.flat().filter((item) =>
          item.chosenPlaceId === 'galleria-cafe-l1' && item.tick <= offence.tick)
        .map((item) => ({ tick: item.tick, chosenKind: item.chosenKind,
          score: item.candidates.find((candidate) => candidate.feasible &&
            candidate.kind === item.chosenKind &&
            candidate.placeId === item.chosenPlaceId)?.score,
          terms: item.candidates.find((candidate) => candidate.feasible &&
            candidate.kind === item.chosenKind &&
            candidate.placeId === item.chosenPlaceId)?.terms })),
    }))
    const encounter = [...state.social.encounters.active,
      ...state.social.encounters.completed].find((item) =>
      item.id === offence.encounterId)
    const observations = state.social.witnessObservations.filter((item) =>
      item.offenceId === offence.id)
    const links = state.social.reportLinks.filter((item) =>
      item.offenceId === offence.id)
    return { offence, activities, encounter, observations, links,
      injuries: state.life.injuries.filter((item) =>
        item.sourceOffenceId === offence.id),
      deaths: state.life.deaths.filter((item) =>
        item.relatedOffenceId === offence.id),
      scene: state.scene.entities.find((item) =>
        item.origin.offenceId === offence.id) ?? null }
  })
  await page.getByRole('button', { name: 'EVENT EXPLORER' }).click()
  await page.locator(`[data-event-id="event:offence:${record.offence.id}"]`).click()
  await page.getByRole('button', { name: 'EVENT TICK', exact: true }).click()
  await page.waitForTimeout(1100)
  await page.screenshot({ path: resolve('docs/screenshots/place-case-event-l1-1440x900.png') })
  await page.getByRole('button', { name: 'PLACE INSPECTOR' }).click()
  await page.getByRole('combobox', { name: 'Inspect Galleria place' })
    .selectOption('galleria-cafe-l1')
  await page.getByRole('button', { name: 'FOCUS PLACE' }).click()
  await page.waitForTimeout(1100)
  await page.screenshot({ path: resolve('docs/screenshots/place-case-cafe-l1-1440x900.png') })
  const report = { date: new Date().toISOString(), browser: browser.version(),
    viewport: '1440x900', dpr: 1, url, ...record, errors }
  await writeFile(resolve('docs/screenshots/place-case-report.json'),
    JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ offence: record.offence.id,
    tick: record.offence.tick, person: record.offence.offenderAgentId,
    target: record.offence.target.id, encounter: record.encounter?.id,
    decisions: record.activities.map((item) => ({ agentId: item.agentId,
      decisions: item.decisions, events: item.events })),
    observations: record.observations.length, reports: record.links.length,
    injuries: record.injuries.length, deaths: record.deaths.length,
    scene: record.scene?.id ?? null, errors }, null, 2))
} finally {
  await browser.close()
}
