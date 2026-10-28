import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const outputDirectory = resolve('public/characters/quaternius-v01/impostors')
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SHADOW_CITY_CHROME ??
    (process.platform === 'darwin' && existsSync(macChrome) ? macChrome : undefined),
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
})
try {
  const page = await browser.newPage({ viewport: { width: 256, height: 512 } })
  await page.goto(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' })
  const images = await page.evaluate(async () => {
    const { bakeCharacterImpostors } = await import('/src/scene/character/impostorBaker.ts')
    return bakeCharacterImpostors()
  })
  await mkdir(outputDirectory, { recursive: true })
  for (const image of images) {
    const bytes = Buffer.from(image.dataUrl.split(',')[1], 'base64')
    await writeFile(resolve(outputDirectory, `${image.presetId}.webp`), bytes)
  }
  console.log(`Baked ${images.length} character impostors to ${outputDirectory}`)
} finally {
  await browser.close()
}
