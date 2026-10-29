import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const browser = await chromium.launch({ headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-webgl'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1 })
  await page.goto('http://127.0.0.1:5187/?world=organic&population=100&visualTime=12%3A00&test=1',
    { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100)
  await page.waitForTimeout(1200)
  await mkdir('.visual', { recursive: true })
  await page.screenshot({ path: '.visual/organic-reference-day-1440x900.png' })
  await page.evaluate(() => window.__shadowCityV06.setPitch(25))
  await page.waitForTimeout(500)
  await page.screenshot({ path: '.visual/organic-reference-top-1440x900.png' })
} finally {
  await browser.close()
}
