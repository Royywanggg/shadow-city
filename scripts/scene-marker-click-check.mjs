import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const browser = await chromium.launch({ headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-webgl', '--ignore-gpu-blocklist'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1 })
  await page.goto('http://127.0.0.1:5182/?seed=shadow-city-hero-01&population=120&lifeScenario=fatal-diagnostic',
    { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100)
  const death = await page.evaluate(() => {
    window.__shadowCityV06.advanceToTick(500)
    return window.__shadowCityV06.getSnapshot().state.life.deaths[0]
  })
  await page.getByRole('button', { name: 'EVENT EXPLORER' }).click()
  await page.locator('[data-event-id="event:death:' + death.id + '"]').click()
  await page.waitForTimeout(800)
  const points = [
    [878, 437], [875, 438], [872, 440], [881, 440],
    [878, 443], [870, 433], [884, 435], [866, 435],
  ]
  const attempts = []
  for (const [x, y] of points) {
    await page.mouse.click(x, y)
    await page.waitForTimeout(100)
    const selected = await page.locator('.v06-event-detail h3').textContent()
    attempts.push({ x, y, selected })
    if (selected?.startsWith('Scene created')) break
  }
  const result = { browser: browser.version(), viewport: '1440x900', dpr: 1,
    seed: 'shadow-city-hero-01', deathId: death.id, attempts }
  await writeFile(resolve('docs/screenshots/round4-marker-click-report.json'),
    JSON.stringify(result, null, 2) + '\n')
  process.stdout.write(JSON.stringify(result) + '\n')
  if (!attempts.some((item) => item.selected?.startsWith('Scene created'))) {
    process.exitCode = 1
  }
} finally {
  await browser.close()
}
