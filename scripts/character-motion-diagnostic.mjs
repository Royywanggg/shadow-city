import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const directory = resolve('docs/screenshots/character-motion')
const agentId = process.env.SHADOW_AGENT_ID ?? 'citizen-0010'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-webgl'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  const url = new URL(process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5177/')
  url.searchParams.set('test', '1')
  url.searchParams.set('population', '200')
  await page.goto(url.toString(), { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__shadowCityV06Agents?.tick === 100 &&
    window.__shadowCityV06Agents?.assetPresetCount === 10)
  await page.locator(`[data-agent-id="${agentId}"]`).click()
  const portrait = page.locator('.v06-portrait')
  await portrait.evaluate((element) => {
    element.style.position = 'fixed'
    element.style.left = '740px'
    element.style.top = '180px'
    element.style.width = '600px'
    element.style.height = '600px'
    element.style.zIndex = '9999'
  })
  const reviewIds = await page.evaluate(() => window.__shadowCityV06Agents.reviewAgentIds)
  if (reviewIds.length !== 10) throw new Error(`Expected ten character presets, got ${reviewIds.length}`)
  for (const id of reviewIds) {
    await page.locator(`[data-agent-id="${id}"]`).click()
    await page.evaluate(() => {
      window.__shadowCityV5CharacterPreview?.setClip('Walk')
      window.__shadowCityV5CharacterPreview?.setTime(0.25)
    })
    await page.waitForTimeout(120)
    await portrait.screenshot({ path: resolve(directory, `after-${id}-walk.png`) })
  }
  await page.locator(`[data-agent-id="${agentId}"]`).click()
  for (const [clip, time] of [['Idle', 0.2], ['Walk', 0.25], ['Walk', 0.55], ['Run', 0.2]]) {
    await page.evaluate(([name, seconds]) => {
      window.__shadowCityV5CharacterPreview?.setClip(name)
      window.__shadowCityV5CharacterPreview?.setTime(seconds)
    }, [clip, time])
    await page.waitForTimeout(150)
    await portrait.screenshot({ path: resolve(directory, `${agentId}-${clip}-${time}.png`) })
  }
  await page.evaluate(() => {
    window.__shadowCityV5CharacterPreview?.setClip(null)
    window.__shadowCityV5CharacterPreview?.setTime(null)
  })
  await page.getByRole('button', { name: 'PLAY', exact: true }).click()
  const samples = await page.evaluate(async () => {
    const output = []
    const until = performance.now() + 4500
    while (performance.now() < until) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const state = window.__shadowCityV5Portrait
      if (state) output.push({ now: performance.now(), tick: state.tick, time: state.time,
        alpha: state.alpha, activity: state.activity })
    }
    return output
  })
  await page.evaluate(() => {
    window.__shadowMotionSamples = []
    window.__shadowMotionRecording = true
    const sample = () => {
      if (!window.__shadowMotionRecording) return
      const state = window.__shadowCityV5Portrait
      if (state) window.__shadowMotionSamples.push({ tick: state.tick, time: state.time })
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.waitForTimeout(350)
  await page.getByRole('combobox', { name: 'Simulation speed' }).selectOption('4')
  await page.waitForTimeout(1100)
  await page.getByRole('combobox', { name: 'Simulation speed' }).selectOption('1')
  await page.waitForTimeout(1100)
  const speedSamples = await page.evaluate(() => {
    window.__shadowMotionRecording = false
    return window.__shadowMotionSamples
  })
  await page.getByRole('button', { name: 'PAUSE', exact: true }).click()
  const negativeJumps = samples.slice(1).map((sample, index) => ({
    index: index + 1, delta: sample.time - samples[index].time,
    before: samples[index], after: sample,
  })).filter((value) => value.delta < -0.001)
  const largestAdvance = Math.max(...samples.slice(1).map((sample, index) =>
    sample.time - samples[index].time))
  const speedNegativeJumps = speedSamples.slice(1).map((sample, index) => ({
    index: index + 1, delta: sample.time - speedSamples[index].time,
    before: speedSamples[index], after: sample,
  })).filter((value) => value.delta < -0.001)
  const summary = { agentId, sampleCount: samples.length, startTick: samples[0]?.tick,
    endTick: samples.at(-1)?.tick, negativeJumps, largestAdvance,
    speedSampleCount: speedSamples.length, speedNegativeJumps,
    presetReviewCount: reviewIds.length, errors }
  await writeFile(resolve(directory, `${agentId}-clock.json`), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary, null, 2))
  if (negativeJumps.length || speedNegativeJumps.length || errors.length || samples.length < 30 ||
    speedSamples.length < 30) {
    throw new Error('Portrait motion diagnostic failed')
  }
} finally {
  await browser.close()
}
