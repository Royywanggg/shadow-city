import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const root = process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5187'
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ headless: true,
  executablePath: existsSync(chrome) ? chrome : undefined,
  args: ['--enable-webgl'] })
const errors = []
const context = await browser.newContext({ viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1 })
const capture = async (page, file) => {
  await page.waitForTimeout(850)
  await page.screenshot({ path: `.visual/${file}.png` })
}
const visit = async (population, organic = true) => {
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const query = organic ? 'world=organic&' : ''
  await page.goto(`${root}/?${query}population=${population}&visualTime=21%3A00&test=1`,
    { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100,
    undefined, { timeout: 25_000 })
  return page
}
const hardware = async (page) => page.evaluate(() => {
  const world = window.__shadowCityV06.getWorld()
  const state = window.__shadowCityV06.getSnapshot().state
  const canvas = document.querySelector('.v06-viewport canvas')
  const gl = canvas?.getContext('webgl2')
  const info = gl?.getExtension('WEBGL_debug_renderer_info')
  return { generator: world.config.generatorVersion, tick: state.tick,
    population: state.citizens.length, terrainSamples: world.terrain?.heightsMm.length ?? 0,
    roads: world.roadEdges.length, navEdges: world.navEdges.length,
    preservedGalleria: world.places.some((place) => place.id === 'central-galleria'),
    viaducts: world.roadEdges.filter((edge) => edge.structure === 'viaduct').length,
    renderer: gl?.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ?? null,
    diagnostics: window.__shadowCityDiagnostics ?? null }
})
const worldConstruction = async (page, organic) => page.evaluate(async (isOrganic) => {
  const generator = isOrganic ? await import('/src/world/generation/generateOrganicWorld.ts') :
    await import('/src/world/generation/generateIntegratedWorld.ts')
  const navigation = await import('/src/world/navigation/routeV2.ts')
  const started = performance.now()
  const world = isOrganic ? generator.generateOrganicWorld('shadow-city-organic-01') :
    generator.generateIntegratedWorld('shadow-city-hero-01')
  const generatedMs = performance.now() - started
  const navStarted = performance.now()
  navigation.createNavigationIndexV2(world)
  return { generatedMs, navIndexMs: performance.now() - navStarted,
    buildings: world.buildingPlacements?.length ?? world.baseCity?.buildings.length ?? 0,
    places: world.places.length }
}, organic)
await mkdir('.visual', { recursive: true })
try {
  const before = await visit(100, false)
  await capture(before, 'organic-before-integrated-1440x900')
  const beforeMetrics = await hardware(before)
  const beforeConstruction = await worldConstruction(before, false)
  await before.close()

  const before200 = await visit(200, false)
  const beforeTickDurations = await before200.evaluate(() =>
    window.__shadowCityV06.advanceToTick(130))
  await capture(before200, 'organic-before-integrated-200-1440x900')
  const beforeMetrics200 = await hardware(before200)
  const beforeReplay200 = await before200.evaluate(() =>
    window.__shadowCityV06.benchmarkReplay500())
  await before200.close()

  const page = await visit(100)
  await capture(page, 'organic-hero-1440x900')
  const heroMetrics = await hardware(page)
  const organicConstruction = await worldConstruction(page, true)

  await page.evaluate(() => window.__shadowCityV06.inspectAtWorld(40, 5.5, 0))
  await capture(page, 'organic-galleria-close-1440x900')

  await page.evaluate(() => {
    const world = window.__shadowCityV06.getWorld()
    const edge = world.navEdges.find((item) => item.id === 'walk:organic:road:04:deck')
    const point = edge.path[Math.floor(edge.path.length / 2)]
    window.__shadowCityV06.inspectAtWorld(point.x / 1000, point.y / 1000, point.z / 1000)
  })
  await capture(page, 'organic-viaduct-close-1440x900')

  await page.evaluate(() => {
    const world = window.__shadowCityV06.getWorld()
    const terrain = world.terrain
    const x = -85_000, z = -65_000
    const ix = Math.round((x - terrain.originX) / terrain.stepMm)
    const iz = Math.round((z - terrain.originZ) / terrain.stepMm)
    window.__shadowCityV06.setPitch(65)
    window.__shadowCityV06.inspectAtWorld(x / 1000,
      terrain.heightsMm[iz * terrain.columns + ix] / 1000, z / 1000)
  })
  await capture(page, 'organic-hill-low-pitch-1440x900')

  await page.evaluate(() => {
    window.__shadowCityV06.setPitch(45)
    window.__shadowCityV06.inspectAtWorld(-35, 1, -22)
  })
  await capture(page, 'organic-junction-close-1440x900')

  await page.evaluate(() => {
    const world = window.__shadowCityV06.getWorld()
    const place = world.buildingPlacements.find((item) => item.x < -80_000 &&
      item.z < -50_000)
    window.__shadowCityV06.inspectAtWorld(place.x / 1000,
      place.elevationMm / 1000 + 5, place.z / 1000)
  })
  await capture(page, 'organic-existing-buildings-on-hill-1440x900')

  await page.evaluate(() => {
    window.__shadowCityV06.resetCamera()
    window.__shadowCityV06.setPitch(25)
  })
  await capture(page, 'organic-top-road-network-1440x900')

  for (const bearing of [0, 90, 180, 270]) {
    await page.evaluate((degrees) => {
      window.__shadowCityV06.setBearing(degrees)
      window.__shadowCityV06.setPitch(55)
    }, bearing)
    await capture(page, `organic-bearing-${bearing}-1440x900`)
  }

  await page.getByRole('button', { name: 'SHOW NAV' }).click()
  await page.getByLabel('Organic world debug layer').selectOption('centerlines')
  await capture(page, 'organic-navigation-debug-1440x900')
  await page.getByLabel('Organic world debug layer').selectOption('height')
  await capture(page, 'organic-terrain-height-debug-1440x900')
  await page.getByLabel('Organic world debug layer').selectOption('slope')
  await capture(page, 'organic-terrain-slope-debug-1440x900')

  const routeEvidence = await page.evaluate(() => {
    const fixture = window.__shadowCityV06
    const world = fixture.getWorld()
    const profileById = new Map(fixture.getProfiles().map((profile) => [profile.id, profile]))
    const edgeById = new Map(world.navEdges.map((edge) => [edge.id, edge]))
    const roadById = new Map(world.roadEdges.map((road) => [road.id, road]))
    for (let tick = 100; tick <= 500; tick += 1) {
      fixture.advanceToTick(tick)
      const state = fixture.getSnapshot().state
      for (const citizen of state.citizens) {
        if (citizen.route.length < 4 || !citizen.destinationPlaceId) continue
        const roads = citizen.route.map((step) =>
          roadById.get(step.edgeId.replace(/^walk:/, '').replace(/:(west|east|deck)$/, '')))
          .filter(Boolean)
        if (!roads.some((road) => road.hierarchy === 'arterial') ||
          !roads.some((road) => road.hierarchy === 'local')) continue
        const heights = citizen.route.flatMap((step) =>
          edgeById.get(step.edgeId)?.path.map((point) => point.y) ?? [])
        if (Math.max(...heights) - Math.min(...heights) < 500) continue
        const home = world.places.find((place) => place.id === profileById.get(citizen.id)?.homePlaceId)
        const destination = world.places.find((place) => place.id === citizen.destinationPlaceId)
        return { tick, agentId: citizen.id, homePlaceId: home?.id,
          destinationPlaceId: destination?.id, destinationKind: destination?.kind,
          position: citizen.position, surfaceId: citizen.surfaceId,
          routeEdgeIds: citizen.route.map((step) => step.edgeId),
          elevationRangeMm: Math.max(...heights) - Math.min(...heights),
          source: 'SimulationStateV5.citizens[].route at inspected live tick' }
      }
    }
    return null
  })
  if (routeEvidence) {
    await page.evaluate((position) => {
      window.__shadowCityV06.inspectAtWorld(position.x / 1000,
        position.y / 1000, position.z / 1000)
    }, routeEvidence.position)
    await capture(page, 'organic-agent-on-computed-route-1440x900')
  }
  const actualRouteTrace = routeEvidence ? await page.evaluate(({ agentId, tick }) => {
    const fixture = window.__shadowCityV06
    fixture.advanceToTick(Math.min(500, tick + 80))
    const positions = []
    for (let at = tick; at <= Math.min(500, tick + 80); at += 2) {
      const citizen = fixture.inspectTick(at).citizens.find((item) => item.id === agentId)
      positions.push({ tick: at, position: citizen.position,
        surfaceId: citizen.surfaceId, activity: citizen.activity })
    }
    const ys = positions.map((item) => item.position.y)
    return { agentId, source: 'SimulationSessionV5.inspectTick deterministic state',
      elevationRangeMm: Math.max(...ys) - Math.min(...ys),
      positions: positions.filter((_, index) => index % 5 === 0) }
  }, routeEvidence) : null
  const replay100 = await page.evaluate(() => window.__shadowCityV06.benchmarkReplay500())
  await page.close()

  const page200 = await visit(200)
  const tickDurations = await page200.evaluate(() => window.__shadowCityV06.advanceToTick(130))
  await capture(page200, 'organic-200-agents-1440x900')
  const metrics200 = await hardware(page200)
  const replay200 = await page200.evaluate(() => window.__shadowCityV06.benchmarkReplay500())
  await page200.close()
  tickDurations.sort((a, b) => a - b)
  beforeTickDurations.sort((a, b) => a - b)
  const result = {
    environment: { browser: browser.version(), viewport: '1440x900', dpr: 1,
      seed: 'shadow-city-organic-01', visualTime: '21:00 visual-only' },
    beforeMetrics, beforeMetrics200, heroMetrics, metrics200,
    beforeConstruction, organicConstruction,
    beforeTickP95Ms200: beforeTickDurations[Math.floor(beforeTickDurations.length * 0.95)],
    beforeReplay200,
    tickP95Ms200: tickDurations[Math.floor(tickDurations.length * 0.95)],
    replay100, replay200, routeEvidence, actualRouteTrace, errors,
  }
  await writeFile('.visual/organic-browser.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
