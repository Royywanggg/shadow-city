import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const directory = resolve(process.env.SHADOW_CHARACTER_SCREENSHOT_DIR ?? 'docs/screenshots/character-city')
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-webgl'] })
const result = {}
try {
  for (const mode of ['upgraded', 'legacy']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    await page.addInitScript(() => {
      window.__shadowDrawCounters = { calls: 0, triangles: 0 }
      for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
          const original = Object.getOwnPropertyDescriptor(prototype, name)?.value
          if (!original) continue
          prototype[name] = function (...args) {
            window.__shadowDrawCounters.calls += 1
            if (args[0] === this.TRIANGLES) window.__shadowDrawCounters.triangles +=
              Math.floor(args[1] / 3) * (name.endsWith('Instanced') ? args.at(-1) : 1)
            return original.apply(this, args)
          }
        }
      }
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    const url = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5177/')
    url.searchParams.set('test', '1')
    url.searchParams.set('population', '200')
    if (mode === 'legacy') url.searchParams.set('characterAssets', 'legacy')
    await page.goto(url.toString(), { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__shadowCityV06Agents?.tick === 100 &&
      window.__shadowCityV06Agents?.assetPresetCount === 10,
      undefined, { timeout: 45000 })
    const ids = await page.evaluate(() => window.__shadowCityV06Agents.reviewAgentIds)
    if (ids.length !== 10) throw new Error(`Expected ten review residents; got ${ids.length}`)
    let selectedTick = 100
    let selectedId = null
    for (const tick of [100, 150, 200, 250, 300, 350, 400, 450, 500]) {
      await page.evaluate((value) => window.__shadowCityV06.advanceToTick(value), tick)
      await page.waitForFunction((value) => window.__shadowCityV06Agents?.tick === value, tick)
      const candidate = await page.evaluate((agentIds) => window.__shadowCityV06.getSnapshot().state.citizens
        .find((citizen) => agentIds.includes(citizen.id) &&
          ['travelling', 'returningHome'].includes(citizen.activity))?.id ?? null, ids)
      if (candidate) { selectedTick = tick; selectedId = candidate; break }
    }
    selectedId ??= ids[0]
    const selectedAtStart = await page.evaluate((id) => JSON.stringify(window.__shadowCityV06
      .getSnapshot().state.citizens.find((citizen) => citizen.id === id)), selectedId)
    await page.locator(`[data-agent-id="${selectedId}"]`).click()
    await page.evaluate((id) => {
      const citizen = window.__shadowCityV06.getSnapshot().state.citizens.find((item) => item.id === id)
      window.__shadowCityV06.inspectAtWorld(citizen.position.x / 1000,
        citizen.position.y / 1000, citizen.position.z / 1000)
    }, selectedId)
    await page.getByRole('button', { name: 'HIDE ROOF' }).click()
    await page.waitForTimeout(700)
    await page.mouse.move(900, 500)
    await page.mouse.wheel(0, -1700)
    await page.waitForTimeout(600)
    const label = mode === 'upgraded' ? 'after' : 'before'
    const portrait = page.locator('.v06-portrait')
    await portrait.screenshot({ path: resolve(directory, `${label}-sidebar-portrait-1440x900.png`) })
    if (mode === 'upgraded') await page.screenshot({ path: resolve(directory, 'after-sidebar-1440x900.png') })
    await portrait.evaluate((element) => {
      element.style.position = 'fixed'
      element.style.left = '740px'
      element.style.top = '180px'
      element.style.width = '600px'
      element.style.height = '600px'
      element.style.zIndex = '9999'
    })
    for (const id of ids) {
      await page.locator(`[data-agent-id="${id}"]`).click()
      await page.waitForTimeout(300)
      if (mode === 'upgraded') await page.evaluate(() => {
        window.__shadowCityV5CharacterPreview?.setClip('Walk')
        window.__shadowCityV5CharacterPreview?.setTime(.25)
      })
      await page.waitForTimeout(150)
      await portrait.screenshot({ path: resolve(directory, `${label}-${id}-portrait-walk.png`) })
    }
    await page.locator(`[data-agent-id="${selectedId}"]`).click()
    if (mode === 'upgraded') for (const [clip, time] of [['Idle', .2], ['Walk', .2], ['Walk', .55],
      ['Run', .2], ['SitDown', .5], ['SitIdle', .3], ['StandUp', .4]]) {
      await page.evaluate(([name, value]) => {
        window.__shadowCityV5CharacterPreview?.setClip(name)
        window.__shadowCityV5CharacterPreview?.setTime(value)
      }, [clip, time])
      await page.waitForTimeout(150)
      await portrait.screenshot({ path: resolve(directory, `after-${selectedId}-${clip}-${time}.png`) })
    }
    if (mode === 'upgraded') await page.evaluate(() => {
      window.__shadowCityV5CharacterPreview?.setClip(null)
      window.__shadowCityV5CharacterPreview?.setTime(null)
    })
    await portrait.evaluate((element) => {
      element.style.position = ''
      element.style.left = ''
      element.style.top = ''
      element.style.width = ''
      element.style.height = ''
      element.style.zIndex = ''
    })
    const renderer = await page.evaluate(() => {
      const context = document.querySelector('.v06-viewport canvas')?.getContext('webgl2')
      const extension = context?.getExtension('WEBGL_debug_renderer_info')
      return context?.getParameter(extension?.UNMASKED_RENDERER_WEBGL ?? context.RENDERER) ?? null
    })
    const assetLoads = await page.evaluate(() => performance.getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/quaternius-ual-v1/') ||
        entry.name.includes('/quaternius-v01/') && entry.name.endsWith('.glb'))
      .map((entry) => ({ name: entry.name.split('/').at(-1), durationMs: entry.duration,
        transferBytes: entry.transferSize })))
    await page.getByRole('button', { name: 'PLAY', exact: true }).click()
    const metrics = await page.evaluate(async () => {
      const samples = []
      const until = performance.now() + 3000
      while (performance.now() < until) {
        await new Promise((resolve) => requestAnimationFrame(resolve))
        const data = window.__shadowCityV06Agents
        const draw = window.__shadowDrawCounters
        const portraitState = window.__shadowCityV5Portrait
        samples.push({ time: performance.now(), animationMs: data?.animationUpdateMs,
          drawCalls: draw?.calls, triangles: draw?.triangles, textures: data?.textures,
          closeCount: data?.closeCount, activeInstances: data?.activeInstances,
          portraitTick: portraitState?.tick, portraitTime: portraitState?.time,
          portraitFrames: portraitState?.frameCount })
      }
      return samples
    })
    const portraitMovesWithinTick = metrics.some((sample, index) => index > 0 &&
      sample.portraitTick === metrics[index - 1].portraitTick &&
      sample.portraitTime > metrics[index - 1].portraitTime + .0001)
    await page.waitForTimeout(450)
    await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
    const pausedTick = await page.evaluate(() => window.__shadowCityV06.getSnapshot().tick)
    await page.waitForTimeout(500)
    const stillTick = await page.evaluate(() => window.__shadowCityV06.getSnapshot().tick)
    const pausedFirstTime = await page.evaluate(() => window.__shadowCityV5Portrait?.time)
    await page.waitForTimeout(180)
    const pausedSecondTime = await page.evaluate(() => window.__shadowCityV5Portrait?.time)
    const pausedPortraitStable = pausedFirstTime === pausedSecondTime
    await page.evaluate((tick) => window.__shadowCityV06.inspectTick(tick), selectedTick)
    await page.waitForFunction((tick) => window.__shadowCityV06Agents?.tick === tick, selectedTick)
    const replayCitizen = await page.evaluate((id) => JSON.stringify(window.__shadowCityV06
      .getSnapshot().state.citizens.find((citizen) => citizen.id === id)), selectedId)
    const fingerprintBeforeCamera = await page.evaluate(() => window.__shadowCityV06
      .getSnapshot().state.fingerprint)
    await page.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
    await page.getByRole('slider', { name: 'Pitch control' }).fill('50')
    const fingerprintAfterCamera = await page.evaluate(() => window.__shadowCityV06
      .getSnapshot().state.fingerprint)
    await page.getByRole('button', { name: 'RESET VIEW' }).click()
    await page.getByRole('button', { name: 'RETURN LIVE' }).click()
    await page.getByRole('combobox', { name: 'Simulation speed' }).selectOption('2')
    const speedStartTick = await page.evaluate(() => window.__shadowCityV06.getSnapshot().tick)
    await page.getByRole('button', { name: 'PLAY', exact: true }).click()
    await page.waitForTimeout(650)
    await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
    const speedEndTick = await page.evaluate(() => window.__shadowCityV06.getSnapshot().tick)
    await page.evaluate(() => window.__shadowCityV06.advanceToTick(450))
    await page.waitForFunction(() => window.__shadowCityV06Agents?.tick === 450)
    await page.locator('[data-agent-id="citizen-0007"]').click()
    await page.evaluate(() => {
      const citizen = window.__shadowCityV06.getSnapshot().state.citizens
        .find((item) => item.id === 'citizen-0007')
      window.__shadowCityV06.inspectAtWorld(citizen.position.x / 1000,
        citizen.position.y / 1000, citizen.position.z / 1000)
    })
    await page.getByRole('slider', { name: 'Pitch control' }).fill('35')
    await page.waitForTimeout(850)
    await page.mouse.move(900, 500)
    await page.mouse.wheel(0, -1500)
    await page.waitForTimeout(600)
    await page.screenshot({ path: resolve(directory,
      `${label}-world-ground-tick450-overhead-1440x900.png`) })
    const gaps = metrics.slice(1).map((sample, index) => sample.time - metrics[index].time)
    const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
    result[label] = { reviewIds: ids, selectedId, selectedTick, renderer, assetLoads,
      characterAssetMode: await page.evaluate(() => window.__shadowCityV06Agents?.characterAssetMode),
      characterAssetLoadMs: await page.evaluate(() => window.__shadowCityV06Agents?.characterAssetLoadMs),
      frameCount: metrics.length, averageFps: 1000 * (metrics.length - 1) /
        (metrics.at(-1).time - metrics[0].time), frameP95Ms: percentile(gaps, .95),
      animationUpdateP95Ms: percentile(metrics.map((sample) => sample.animationMs), .95),
      averageDrawCallsPerFrame: (metrics.at(-1).drawCalls - metrics[0].drawCalls) /
        (metrics.length - 1),
      averageTrianglesPerFrame: (metrics.at(-1).triangles - metrics[0].triangles) /
        (metrics.length - 1),
      closeCountP95: percentile(metrics.map((sample) => sample.closeCount), .95),
      activeInstancesP95: percentile(metrics.map((sample) => sample.activeInstances), .95),
      portraitFramesPerSecond: (metrics.at(-1).portraitFrames - metrics[0].portraitFrames) /
        ((metrics.at(-1).time - metrics[0].time) / 1000),
      texturesP95: percentile(metrics.map((sample) => sample.textures), .95),
      pausedTick, stillTick, portraitMovesWithinTick, pausedPortraitStable,
      replayCitizenMatches: selectedAtStart === replayCitizen,
      cameraPreservedFingerprint: fingerprintBeforeCamera === fingerprintAfterCamera,
      speedStartTick, speedEndTick, errors }
    if (mode === 'upgraded') {
      const narrow = await browser.newPage({ viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1 })
      await narrow.goto(url.toString(), { waitUntil: 'networkidle' })
      await narrow.waitForFunction(() => window.__shadowCityV06Agents?.tick === 100 &&
        window.__shadowCityV06Agents?.assetPresetCount === 10)
      await narrow.locator('[data-agent-id="citizen-0010"]').click()
      await narrow.waitForTimeout(300)
      await narrow.locator('.v06-portrait').screenshot({ path: resolve(directory,
        'after-sidebar-portrait-390x844.png') })
      await narrow.screenshot({ path: resolve(directory, 'after-sidebar-390x844.png') })
      await narrow.close()
    }
    await page.close()
  }
} finally {
  await browser.close()
}
await writeFile(resolve(directory, 'metrics.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
for (const [mode, variant] of [['legacy', result.before], ['upgraded', result.after]]) {
  if (variant.errors.length || !variant.portraitMovesWithinTick || !variant.pausedPortraitStable ||
    !variant.replayCitizenMatches || !variant.cameraPreservedFingerprint ||
    variant.speedEndTick <= variant.speedStartTick || variant.characterAssetMode !== mode ||
    variant.assetLoads.length !== 10) {
    throw new Error('Character portrait browser verification failed; inspect metrics.json')
  }
}
