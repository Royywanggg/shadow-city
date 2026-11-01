import { chromium } from 'playwright'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve(process.env.SHADOW_CITY_VISUAL_OUTPUT ?? '.visual/twilight-dev')
await mkdir(output, { recursive: true })
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ headless: true,
  executablePath: process.env.SHADOW_CITY_CHROME ??
    (process.platform === 'darwin' && existsSync(chrome) ? chrome : undefined),
  args: ['--enable-webgl'] })
const base = process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5174/'
const visualPreview = process.env.SHADOW_CITY_VISUAL_TIME ?? '20:00'
const errors = []
const captures = []
const report = { browser: await browser.version(), viewport: '1440x900', dpr: 1,
  seed: 'shadow-city-hero-01', alternateSeed: 'twilight-alt-02', visualPreview,
  errors, captures,
  renderer: null, mainFingerprint: null, devFingerprint: null, render: null }

async function openWorld(world, seed = report.seed) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1 })
  page.on('pageerror', (error) => errors.push(`${world}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${world}: ${message.text()}`)
  })
  const url = new URL(base)
  if (world === 'dev') url.searchParams.set('world', 'dev')
  url.searchParams.set('seed', seed)
  url.searchParams.set('population', '0')
  url.searchParams.set('test', '1')
  url.searchParams.set('visualTime', visualPreview)
  await page.goto(url.toString(), { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot().tick === 100)
  await page.getByRole('button', { name: 'Collapse population' }).click()
  await page.waitForTimeout(500)
  return page
}

async function capture(page, name) {
  await page.screenshot({ path: resolve(output, `${name}.png`) })
  captures.push(name)
}

try {
  const main = await openWorld('main')
  report.mainFingerprint = await main.evaluate(() => window.__shadowCityV06.getSnapshot().state.fingerprint)
  await capture(main, 'main-hero-1440x900')
  await main.close()

  const dev = await openWorld('dev')
  report.devFingerprint = await dev.evaluate(() => window.__shadowCityV06.getSnapshot().state.fingerprint)
  report.renderer = await dev.evaluate(() => {
    const gl = document.querySelector('.v06-viewport canvas')?.getContext('webgl2')
    const extension = gl?.getExtension('WEBGL_debug_renderer_info')
    return gl?.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ?? null
  })
  await capture(dev, 'dev-hero-1440x900')
  for (const [edgeId, name] of [
    ['edge-z-7-4', 'dev-curved-corridor-close-1440x900'],
    ['edge-z-7-1', 'dev-north-corridor-close-1440x900'],
    ['edge-z-3-4', 'dev-central-corridor-close-1440x900'],
  ]) {
    const found = await dev.evaluate((id) => {
      const profile = window.__shadowCityV06.getWorld().terrain.roadProfiles
        .find((item) => item.edgeId === id)
      if (!profile || !window.__shadowCityV06.getWorld().baseCity.roads.edges
        .find((item) => item.id === id)?.centerlineXZ) return false
      const mid = profile.path[Math.floor(profile.path.length / 2)]
      window.__shadowCityV06.inspectAtWorld(mid.x / 1000, mid.y / 1000, mid.z / 1000)
      return true
    }, edgeId)
    if (!found) continue
    await dev.waitForTimeout(950)
    await capture(dev, name)
  }
  for (const edgeId of ['edge-x-0-5', 'edge-x-0-6', 'edge-x-0-7']) {
    await dev.evaluate((id) => {
      const profile = window.__shadowCityV06.getWorld().terrain.roadProfiles
        .find((item) => item.edgeId === id)
      const mid = profile.path[Math.floor((profile.bridgeSpan.startIndex +
        profile.bridgeSpan.endIndex) / 2)]
      window.__shadowCityV06.inspectAtWorld(mid.x / 1000, mid.y / 1000, mid.z / 1000)
    }, edgeId)
    await dev.waitForTimeout(950)
    await capture(dev, `dev-bridge-${edgeId.slice(-1)}-close-1440x900`)
  }
  await dev.evaluate(() => {
    const terrain = window.__shadowCityV06.getWorld().terrain
    const middle = terrain.channel.centerline.reduce((nearest, point) =>
      Math.abs(point.z - 63_000) < Math.abs(nearest.z - 63_000)
        ? point : nearest)
    window.__shadowCityV06.inspectAtWorld(middle.x / 1000, 0, middle.z / 1000)
  })
  await dev.waitForTimeout(950)
  await capture(dev, 'dev-valley-close-1440x900')
  await dev.evaluate(() => {
    const terrain = window.__shadowCityV06.getWorld().terrain
    const foreground = terrain.channel.centerline.reduce((nearest, point) =>
      Math.abs(point.z - 126_000) < Math.abs(nearest.z - 126_000)
        ? point : nearest)
    window.__shadowCityV06.inspectAtWorld(foreground.x / 1000, 0,
      foreground.z / 1000)
  })
  await dev.waitForTimeout(950)
  await capture(dev, 'dev-foreground-valley-close-1440x900')
  await dev.evaluate(() => {
    const terrain = window.__shadowCityV06.getWorld().terrain
    const outlet = terrain.channel.centerline.at(-1)
    window.__shadowCityV06.inspectAtWorld(outlet.x / 1000, 0, outlet.z / 1000)
  })
  await dev.waitForTimeout(950)
  await capture(dev, 'dev-outfall-close-1440x900')
  await dev.evaluate(() => {
    const terrain = window.__shadowCityV06.getWorld().terrain
    const patch = terrain.nonWalkableEscarpment.patches[0]
    const front = patch.frontLine[Math.floor(patch.frontLine.length / 2)]
    window.__shadowCityV06.inspectAtWorld(front.x / 1000, 8, front.z / 1000)
  })
  await dev.waitForTimeout(950)
  await capture(dev, 'dev-terrace-close-1440x900')
  await dev.evaluate(() => {
    const stair = window.__shadowCityV06.getWorld().terrain.terraceAccess?.stair
    if (!stair) return
    const middle = stair[Math.floor(stair.length / 2)]
    window.__shadowCityV06.inspectAtWorld(middle.x / 1000,
      middle.y / 1000, middle.z / 1000)
  })
  await dev.waitForTimeout(950)
  await capture(dev, 'dev-terrace-access-close-1440x900')
  await dev.evaluate(() => {
    const profile = window.__shadowCityV06.getWorld().terrain.roadProfiles
      .find((item) => item.edgeId === 'edge-x-5-0')
    const mid = profile.path[Math.floor(profile.path.length / 2)]
    window.__shadowCityV06.inspectAtWorld(mid.x / 1000, mid.y / 1000, mid.z / 1000)
  })
  await dev.waitForTimeout(950)
  await capture(dev, 'dev-ridge-frontage-close-1440x900')
  await dev.evaluate(() => {
    const profile = window.__shadowCityV06.getWorld().terrain.roadProfiles
      .find((item) => item.edgeId === 'edge-dev-upper-ridge')
    const mid = profile.path[Math.floor(profile.path.length * 0.55)]
    window.__shadowCityV06.inspectAtWorld(mid.x / 1000, mid.y / 1000, mid.z / 1000)
  })
  await dev.waitForTimeout(950)
  await capture(dev, 'dev-upper-road-close-1440x900')
  for (const [fraction, name] of [
    [0.5, 'dev-upper-contour-close-1440x900'],
    [0.04, 'dev-upper-contour-junction-close-1440x900'],
  ]) {
    const found = await dev.evaluate((at) => {
      const profile = window.__shadowCityV06.getWorld().terrain.roadProfiles
        .find((item) => item.edgeId === 'edge-dev-upper-contour')
      if (!profile) return false
      const point = profile.path[Math.floor((profile.path.length - 1) * at)]
      window.__shadowCityV06.inspectAtWorld(point.x / 1000,
        point.y / 1000, point.z / 1000)
      return true
    }, fraction)
    if (!found) continue
    await dev.waitForTimeout(950)
    await capture(dev, name)
  }
  const stairRoad = await dev.evaluate(() => {
    const profile = window.__shadowCityV06.getWorld().terrain.roadProfiles
      .find((item) => item.edgeId === 'edge-dev-upper-contour')
    if (!profile) return false
    const point = profile.path.reduce((nearest, candidate) =>
      Math.abs(candidate.x - 30_000) < Math.abs(nearest.x - 30_000)
        ? candidate : nearest)
    window.__shadowCityV06.inspectAtWorld(point.x / 1000,
      point.y / 1000, point.z / 1000)
    return true
  })
  if (stairRoad) {
    await dev.waitForTimeout(950)
    await capture(dev, 'dev-upper-contour-stair-close-1440x900')
  }
  await dev.evaluate(() => {
    const world = window.__shadowCityV06.getWorld()
    const home = world.baseCity.buildings.find((item) =>
      item.id === 'building-parcel-dev-terrace-2')
    const pad = world.terrain.buildingPads.find((item) =>
      item.buildingId === home.id)
    window.__shadowCityV06.inspectAtWorld(home.x, pad.elevationMm / 1000, home.z)
  })
  await dev.waitForTimeout(950)
  await capture(dev, 'dev-upper-neighborhood-close-1440x900')
  await dev.evaluate(() => {
    const world = window.__shadowCityV06.getWorld()
    const home = world.baseCity.buildings.find((item) =>
      item.id === 'building-parcel-dev-terrace-0')
    const pad = world.terrain.buildingPads.find((item) =>
      item.buildingId === home.id)
    window.__shadowCityV06.inspectAtWorld(home.x, pad.elevationMm / 1000, home.z)
  })
  await dev.waitForTimeout(950)
  await capture(dev, 'dev-west-highland-close-1440x900')
  await dev.evaluate(() => {
    const profile = window.__shadowCityV06.getWorld().terrain.roadProfiles
      .find((item) => item.edgeId === 'edge-x-2-0')
    const mid = profile.path[Math.floor(profile.path.length / 2)]
    window.__shadowCityV06.inspectAtWorld(mid.x / 1000, mid.y / 1000, mid.z / 1000)
  })
  await dev.waitForTimeout(950)
  await capture(dev, 'dev-west-foothill-road-close-1440x900')
  const northAnnex = await dev.evaluate(() => {
    const world = window.__shadowCityV06.getWorld()
    const profile = world.terrain.roadProfiles.find((item) =>
      item.edgeId === 'edge-x-3--2')
    if (!profile) return false
    const middle = profile.path[Math.floor(profile.path.length / 2)]
    window.__shadowCityV06.inspectAtWorld(middle.x / 1000,
      middle.y / 1000, middle.z / 1000)
    return true
  })
  if (northAnnex) {
    await dev.waitForTimeout(950)
    await capture(dev, 'dev-north-annex-road-close-1440x900')
  }
  await dev.getByRole('button', { name: 'RESET VIEW' }).click()
  await dev.waitForTimeout(450)
  for (const bearing of [0, 90, 180, 270]) {
    await dev.getByRole('button', { name: 'Compass: north up' }).click()
    for (let turn = 0; turn < bearing / 15; turn += 1) {
      await dev.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
    }
    await dev.waitForTimeout(220)
    await capture(dev, `dev-bearing-${bearing}-1440x900`)
  }
  await dev.getByRole('button', { name: 'RESET VIEW' }).click()
  const pitch = dev.getByRole('slider', { name: 'Pitch control' })
  await pitch.focus()
  await pitch.press('Home')
  await dev.waitForTimeout(300)
  await capture(dev, 'dev-top-down-1440x900')
  await pitch.press('End')
  await dev.waitForTimeout(300)
  await capture(dev, 'dev-low-pitch-1440x900')
  await dev.getByRole('button', { name: 'SHOW NAV' }).click()
  await dev.waitForTimeout(300)
  await capture(dev, 'dev-navigation-1440x900')
  await dev.getByRole('button', { name: 'HIDE NAV' }).click()
  await dev.getByRole('button', { name: 'RESET VIEW' }).click()
  await dev.waitForTimeout(220)
  report.render = await dev.evaluate(() => window.__shadowCityDiagnostics ??
    window.__shadowCityV06Rendering ?? null)
  await dev.setViewportSize({ width: 390, height: 844 })
  await dev.waitForTimeout(300)
  await capture(dev, 'dev-narrow-390x844')
  await dev.close()
  const alternate = await openWorld('dev', report.alternateSeed)
  await capture(alternate, 'dev-alternate-seed-1440x900')
  await alternate.close()
} finally {
  await browser.close()
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
}
if (errors.length > 0) throw new Error(`Chrome errors: ${errors.join(' | ')}`)
console.log(JSON.stringify(report, null, 2))
