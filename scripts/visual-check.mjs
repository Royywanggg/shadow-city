import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

const outputDirectory = resolve('.visual')
await mkdir(outputDirectory, { recursive: true })

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.SHADOW_CITY_CHROME ?? (process.platform === 'darwin' && existsSync(macChrome) ? macChrome : undefined)

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
})

const issues = []

async function capture(name, url, viewport, interact = false) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  page.on('pageerror', (error) => issues.push(`${name}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`${name}: ${message.text()}`)
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
  const canvas = page.locator('canvas')
  if (await canvas.count() !== 1) issues.push(`${name}: expected one canvas`)
  await page.screenshot({ path: resolve(outputDirectory, `${name}.png`) })

  if (interact) {
    await page.mouse.move(viewport.width * 0.55, viewport.height * 0.6)
    await page.mouse.down()
    await page.mouse.move(viewport.width * 0.63, viewport.height * 0.62, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(650)
    await page.screenshot({ path: resolve(outputDirectory, `${name}-panned.png`) })
    await page.mouse.wheel(0, -520)
    await page.waitForTimeout(650)
    await page.screenshot({ path: resolve(outputDirectory, `${name}-zoomed.png`) })
  }
  await page.close()
}

try {
  const base = 'http://127.0.0.1:5173/'
  await capture('hero-1440x900', base, { width: 1440, height: 900 }, true)
  await capture('narrow-390x844', base, { width: 390, height: 844 })
  await capture('alternate-seed-a', `${base}?seed=shadow-city-variation-a`, { width: 1440, height: 900 })
  await capture('alternate-seed-b', `${base}?seed=shadow-city-variation-b`, { width: 1440, height: 900 })
  console.log(JSON.stringify({ outputDirectory, screenshots: 6, issues }, null, 2))
  if (issues.length) process.exitCode = 1
} finally {
  await browser.close()
}
