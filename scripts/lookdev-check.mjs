import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const output = resolve(process.env.SHADOW_CITY_LOOKDEV_OUTPUT ?? '.visual/lookdev')
const base = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/')
const stages = (process.env.SHADOW_CITY_STAGES ??
  'baseline,clay,lighting,geometry,final,final-bloom-on,final-no-post,final-no-shadows').split(',')
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.SHADOW_CITY_CHROME ??
    (process.platform === 'darwin' && existsSync(chromePath) ? chromePath : undefined),
  args: ['--enable-webgl'],
})

const report = { seed: 'shadow-city-hero-01', simulationSeed: 'shadow-city-sim-01', tick: 100,
  viewport: '1440x900', dpr: 1, browser: browser.version(), renderer: null,
  targets: null, stages: {}, errors: [] }

async function scenePage(stage) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1 })
  page.on('pageerror', (error) => report.errors.push(`${stage}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(`${stage}: ${message.text()}`)
  })
  const url = new URL(base)
  url.searchParams.set('seed', report.seed)
  url.searchParams.set('population', '200')
  url.searchParams.set('test', '1')
  url.searchParams.set('lookdev', stage === 'final-bloom-on' || stage === 'final-no-post' ||
    stage === 'final-no-shadows'
    ? 'final' : stage)
  if (stage === 'final-bloom-on') url.searchParams.set('bloom', 'on')
  if (stage === 'final-no-post') url.searchParams.set('post', 'off')
  if (stage === 'final-no-shadows') url.searchParams.set('shadows', 'off')
  await page.goto(url.toString(), { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot().tick === 100)
  await page.getByRole('button', { name: 'Collapse population' }).click()
  await page.waitForTimeout(450)
  return page
}

async function sample(page) {
  await page.getByRole('button', { name: 'PLAY', exact: true }).click()
  const samples = await page.evaluate(async () => {
    const times = []
    const start = performance.now()
    while (performance.now() - start < 2500) {
      await new Promise((next) => requestAnimationFrame(next))
      times.push(performance.now())
    }
    return times
  })
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  const gaps = samples.slice(1).map((time, index) => time - samples[index])
    .sort((a, b) => a - b)
  return { averageFps: samples.length / ((samples.at(-1) - samples[0]) / 1000),
    frameP50Ms: gaps[Math.ceil(gaps.length * 0.5) - 1],
    frameP95Ms: gaps[Math.ceil(gaps.length * 0.95) - 1], frameSamples: gaps.length,
    rendering: await page.evaluate(() => window.__shadowCityDiagnostics ??
      window.__shadowCityV06Rendering ?? null) }
}

async function capture(page, stage, name) {
  await page.screenshot({ path: resolve(output, `${stage}-${name}-tick100-1440x900.png`) })
}

try {
  for (const stage of stages) {
    const page = await scenePage(stage)
    const browserInfo = await page.evaluate(() => {
      const gl = document.querySelector('.v06-viewport canvas')?.getContext('webgl2')
      const extension = gl?.getExtension('WEBGL_debug_renderer_info')
      return { renderer: gl?.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
        timerQuery: Boolean(gl?.getExtension('EXT_disjoint_timer_query_webgl2')) }
    })
    report.renderer = browserInfo.renderer
    report.timerQueryAvailable = browserInfo.timerQuery
    if (!report.renderer || /software|swiftshader|llvmpipe/i.test(report.renderer)) {
      throw new Error(`Hardware renderer required: ${report.renderer}`)
    }
    const targets = await page.evaluate(() => {
      const city = window.__shadowCityV06.getWorld().baseCity
      const civic = city.buildings.filter((building) => building.kind === 'civic')
        .sort((a, b) => Math.hypot(a.x - city.plaza.x, a.z - city.plaza.z) -
          Math.hypot(b.x - city.plaza.x, b.z - city.plaza.z) || a.id.localeCompare(b.id))[0]
      const commercial = city.buildings.filter((building) => building.kind === 'commercial' &&
        (building.x - city.plaza.x) * (civic.x - city.plaza.x) +
        (building.z - city.plaza.z) * (civic.z - city.plaza.z) < 0)
        .sort((a, b) => Math.hypot(a.x - city.plaza.x, a.z - city.plaza.z) -
          Math.hypot(b.x - city.plaza.x, b.z - city.plaza.z) || a.id.localeCompare(b.id))[0]
      return { civic: { id: civic.id, x: civic.x, z: civic.z, entrance: civic.entrance },
        commercial: { id: commercial.id, x: commercial.x, z: commercial.z,
          entrance: commercial.entrance } }
    })
    report.targets = targets
    await capture(page, stage, 'hero')
    await page.evaluate(({ civic, commercial }) => window.__shadowCityV06.focusAtWorld(
      (civic.x + commercial.x) / 2, 4, (civic.z + commercial.z) / 2), targets)
    await page.waitForTimeout(900)
    await capture(page, stage, 'area')
    await page.getByRole('button', { name: 'Compass: north up' }).click()
    await page.evaluate(({ civic }) => window.__shadowCityV06.focusAtWorld(civic.x, 4, civic.z),
      targets)
    await page.waitForTimeout(850)
    await capture(page, stage, 'civic-medium')
    for (let turn = 0; turn < 3; turn += 1) {
      await page.getByRole('button', { name: 'Rotate left 15 degrees' }).click()
    }
    await page.evaluate(({ commercial }) => window.__shadowCityV06.focusAtWorld(
      commercial.x, 4, commercial.z), targets)
    await page.waitForTimeout(850)
    await capture(page, stage, 'commercial-medium')
    if (stage === 'final') {
      await page.getByRole('button', { name: 'Compass: north up' }).click()
      await page.evaluate(({ civic }) => window.__shadowCityV06.inspectAtWorld(
        civic.x, 3.5, civic.entrance.z), targets)
      await page.waitForTimeout(850)
      await capture(page, stage, 'civic-close')
      for (let turn = 0; turn < 3; turn += 1) {
        await page.getByRole('button', { name: 'Rotate left 15 degrees' }).click()
      }
      await page.evaluate(({ commercial }) => window.__shadowCityV06.inspectAtWorld(
        commercial.x, 3.5, commercial.entrance.z), targets)
      await page.waitForTimeout(850)
      await capture(page, stage, 'commercial-close')
      await page.getByRole('button', { name: 'Compass: north up' }).click()
      for (const bearing of [0, 90, 180, 270]) {
        if (bearing) for (let turn = 0; turn < 6; turn += 1) {
          await page.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
        }
        await page.waitForTimeout(180)
        await capture(page, stage, `commercial-bearing-${bearing}`)
      }
      await page.getByRole('button', { name: 'Compass: north up' }).click()
      await page.evaluate(({ civic, commercial }) => window.__shadowCityV06.focusAtWorld(
        (civic.x + commercial.x) / 2, 4, (civic.z + commercial.z) / 2), targets)
      await page.waitForTimeout(650)
      for (const bearing of [0, 90, 180, 270]) {
        if (bearing) for (let turn = 0; turn < 6; turn += 1) {
          await page.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
        }
        await page.waitForTimeout(180)
        await capture(page, stage, `area-bearing-${bearing}`)
      }
    }
    await page.getByRole('button', { name: 'RESET VIEW' }).click()
    await page.waitForTimeout(450)
    report.stages[stage] = await sample(page)
    console.log(`${stage}: ${report.stages[stage].averageFps.toFixed(1)} FPS`)
    await page.close()
  }
  await writeFile(resolve(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`)
  if (report.errors.length) throw new Error(`Browser errors: ${report.errors.join(' | ')}`)
} finally {
  await browser.close()
}
