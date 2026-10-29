import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--enable-webgl'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1 })
const root = process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5187'
const results = []
try {
  for (const scenario of ['baseline', 'organic']) {
    const page = await context.newPage()
    const query = scenario === 'organic' ? 'world=organic&' : ''
    await page.goto(`${root}/?${query}population=200&test=1`,
      { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__shadowCityV06?.getSnapshot()?.tick === 100)
    await page.waitForTimeout(700)
    const session = await context.newCDPSession(page)
    await session.send('Profiler.enable')
    await session.send('Profiler.setSamplingInterval', { interval: 1000 })
    await session.send('Profiler.start')
    const durations = await page.evaluate(() => window.__shadowCityV06.advanceToTick(300))
    const { profile } = await session.send('Profiler.stop')
    const hits = new Map()
    for (const node of profile.nodes) {
      const frame = node.callFrame
      const key = `${frame.functionName || '(anonymous)'} @ ${frame.url.split('/').at(-1)}`
      hits.set(key, (hits.get(key) ?? 0) + (node.hitCount ?? 0))
    }
    durations.sort((a, b) => a - b)
    results.push({ scenario, tickP50Ms: durations[Math.floor(durations.length * 0.5)],
      tickP95Ms: durations[Math.floor(durations.length * 0.95)],
      totalTickMs: durations.reduce((sum, value) => sum + value, 0),
      sampledCpuLocations: [...hits].sort((a, b) => b[1] - a[1]).slice(0, 14) })
    await page.close()
  }
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
