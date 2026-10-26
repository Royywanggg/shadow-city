import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const outputDirectory = resolve('.visual')
await mkdir(outputDirectory, { recursive: true })
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SHADOW_CITY_CHROME ??
    (process.platform === 'darwin' && existsSync(macChrome) ? macChrome : undefined),
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
})
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  const url = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/')
  url.searchParams.set('review', '1')
  url.searchParams.set('test', '1')
  url.searchParams.set('scenario', 'B')
  await page.goto(url.toString(), { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__shadowCityV05?.getPublicSnapshot().tick === 0 &&
    window.__shadowCityCharacterDiagnostics?.primitiveFallbackCount === 0,
  undefined, { timeout: 20000 })
  await page.evaluate(() => window.__shadowCityV05.advanceToTick(100))
  await page.getByTestId('population-search').fill('citizen-0003')
  await page.getByTestId('population-row-citizen-0003').click()
  await page.getByTestId('population-inspect').click()
  await page.waitForFunction(() => window.__shadowCityCharacterDiagnostics?.selectedTier === 'close',
    undefined, { timeout: 10000 })
  await page.getByTestId('population-follow').click()
  if (await page.getByTestId('population-follow').getAttribute('aria-pressed') !== 'true') {
    throw new Error('Follow did not engage for the selected moving citizen')
  }
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const samples = []
  for (let index = 0; index < 18; index += 1) {
    await page.waitForTimeout(120)
    samples.push(await page.evaluate(() => ({
      speed: 1,
      wallTime: performance.now(),
      tick: window.__shadowCityV05.getPublicSnapshot().tick,
      frames: window.__shadowCityDiagnostics?.renderedFrames ?? 0,
      tier: window.__shadowCityCharacterDiagnostics?.selectedTier ?? null,
      visualTime: window.__shadowCityCharacterDiagnostics?.selectedVisualTime ?? null,
      fallbackCount: window.__shadowCityCharacterDiagnostics?.primitiveFallbackCount ?? null,
      farSpriteCount: window.__shadowCityCharacterDiagnostics?.farSpriteCount ?? null,
    })))
    if (index === 7) await page.screenshot({ path: resolve(outputDirectory, 'v0511-active-character-a-1440x900.png') })
  }
  const status = await page.locator('.simulation-kicker').textContent()
  const reason = await page.locator('.simulation-notice').textContent().catch(() => null)
  if (!status?.includes('RUNNING')) throw new Error(`Playback ended early: ${status ?? 'unknown'} (${reason ?? 'no reason'})`)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.screenshot({ path: resolve(outputDirectory, 'v0511-after-playback-1440x900.png') })
  if (samples.some((sample) => sample.tier !== 'close' || sample.fallbackCount !== 0)) {
    throw new Error('Selected rig or far impostors fell back during playback')
  }
  const times = samples.map((sample) => sample.visualTime)
  if (times.some((time, index) => time === null || (index > 0 && time + 1e-6 < times[index - 1]))) {
    throw new Error('Character animation time moved backward during playback')
  }
  if (samples.at(-1).tick <= samples[0].tick || samples.at(-1).frames - samples[0].frames < 5) {
    throw new Error('Playback did not advance enough ticks and rendered frames for review')
  }
  if (errors.length) throw new Error(errors.join('\n'))
  const result = {
    date: new Date().toISOString(),
    viewport: '1440x900', dpr: 1,
    browser: await page.evaluate(() => navigator.userAgent),
    renderer: await page.evaluate(() => {
      const canvas = document.querySelector('main.experience > div canvas')
      const gl = canvas?.getContext('webgl2')
      return gl?.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ?? null
    }),
    citySeed: 'shadow-city-hero-01', simulationSeed: 'shadow-city-sim-01',
    selectedCitizen: 'citizen-0003',
    samples,
    errors,
    screenshots: ['v0511-active-character-a-1440x900.png', 'v0511-after-playback-1440x900.png'],
  }
  await writeFile(resolve(outputDirectory, 'v0511-playback-results.json'), `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify({
    ticksAdvanced: samples.at(-1).tick - samples[0].tick,
    framesRendered: samples.at(-1).frames - samples[0].frames,
    visualTimeStart: times[0], visualTimeEnd: times.at(-1),
    fallbackCount: samples.at(-1).fallbackCount, errors,
  }, null, 2))
} finally {
  await browser.close()
}
