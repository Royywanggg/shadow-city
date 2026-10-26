import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

const outputDirectory = resolve('.visual')
await mkdir(outputDirectory, { recursive: true })

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.SHADOW_CITY_CHROME ??
  (process.platform === 'darwin' && existsSync(macChrome) ? macChrome : undefined)
const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'],
})
const issues = []
const warnings = new Set()
const screenshots = []
const base = process.env.SHADOW_CITY_URL ?? 'http://127.0.0.1:5173/'

async function screenshot(page, name) {
  await page.screenshot({ path: resolve(outputDirectory, `${name}.png`) })
  screenshots.push(name)
}

function monitor(page, name) {
  page.on('pageerror', (error) => issues.push(`${name}: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`${name}: ${message.text()}`)
    if (message.type() === 'warning') warnings.add(message.text())
  })
}

async function bearing(page) {
  return Number.parseInt(await page.getByTestId('camera-bearing-value').textContent(), 10)
}

async function tick(page) {
  const value = await page.locator('.simulation-tick').textContent()
  return Number.parseInt(value?.match(/TICK ([\d,]+)/)?.[1].replaceAll(',', '') ?? 'NaN', 10)
}

async function waitBearing(page, expected) {
  await page.waitForFunction((angle) => {
    const value = Number.parseInt(document.querySelector('[data-testid="camera-bearing-value"]')?.textContent ?? '', 10)
    return Number.isFinite(value) && Math.abs(((value - angle + 540) % 360) - 180) <= 1
  }, expected, { timeout: 12000 })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  monitor(page, 'hero')
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  assert(await page.locator('canvas').count() === 1, 'Expected one 3D canvas')
  assert(await bearing(page) === 315, 'Initial hero bearing must be 315 degrees')
  assert(await tick(page) === 0, 'Initial simulation tick must be zero')
  await screenshot(page, 'v02-hero-1440x900')
  const idleBefore = await page.evaluate(() => window.__shadowCityDiagnostics ?? null)
  await page.waitForTimeout(800)
  const idleAfter = await page.evaluate(() => window.__shadowCityDiagnostics ?? null)

  await page.getByRole('button', { name: 'Step', exact: true }).click()
  assert(await tick(page) === 1, 'Step must advance exactly one tick')
  const cameraBeforeNorthUp = await page.locator('.camera-controls').evaluate((node) => ({
    targetX: node.getAttribute('data-target-x'),
    targetZ: node.getAttribute('data-target-z'),
    zoom: node.getAttribute('data-zoom-ratio'),
    pitch: node.querySelector('.camera-pitch output')?.textContent,
  }))
  await page.getByRole('button', { name: 'Compass: north up' }).click()
  await waitBearing(page, 0)
  assert(await tick(page) === 1, 'North-up must leave simulation state unchanged')
  const cameraAfterNorthUp = await page.locator('.camera-controls').evaluate((node) => ({
    targetX: node.getAttribute('data-target-x'),
    targetZ: node.getAttribute('data-target-z'),
    zoom: node.getAttribute('data-zoom-ratio'),
    pitch: node.querySelector('.camera-pitch output')?.textContent,
  }))
  assert(JSON.stringify(cameraAfterNorthUp) === JSON.stringify(cameraBeforeNorthUp),
    'North-up must preserve target, zoom, and pitch')
  await page.waitForTimeout(500)
  const bearingBeforeSimulationReset = await bearing(page)
  await page.getByRole('button', { name: 'Reset Simulation' }).click()
  assert(await tick(page) === 0, 'Reset Simulation must return to tick zero')
  assert(Math.abs(((await bearing(page) - bearingBeforeSimulationReset + 540) % 360) - 180) <= 1,
    'Reset Simulation must preserve camera bearing')

  await page.getByRole('button', { name: 'Queue Diagnostic Probe' }).click()
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  await page.getByRole('button', { name: 'Step', exact: true }).click()
  assert(await tick(page) === 2, 'Probe command should run through two fixed ticks')
  assert((await page.locator('.simulation-events').textContent())?.includes('1 diagnostic events'),
    'Diagnostic event must appear in the event count')
  await page.getByRole('spinbutton', { name: 'Tick to inspect' }).fill('0')
  await page.getByRole('button', { name: 'Jump to Tick' }).click()
  assert(await tick(page) === 0, 'Seek must reconstruct tick zero')
  assert((await page.locator('.simulation-kicker').textContent())?.includes('INSPECTING'),
    'Seek must enter read-only inspection mode')
  await page.getByRole('button', { name: 'Return Live' }).click()
  assert(await tick(page) === 2, 'Return Live must preserve the live run')

  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForTimeout(450)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  const pausedTick = await tick(page)
  assert(pausedTick > 2, 'Play must advance the fixed-tick simulation')
  await page.waitForTimeout(250)
  assert(await tick(page) === pausedTick, 'Pause must stop tick advancement')
  await page.getByRole('button', { name: '4× speed' }).click()
  assert(await page.getByRole('button', { name: '4× speed' }).getAttribute('aria-pressed') === 'true',
    '4× speed must be selected')

  await screenshot(page, 'v02-bearing-000')
  for (const angle of [90, 180, 270, 0]) {
    for (let index = 0; index < 6; index += 1) {
      await page.getByRole('button', { name: 'Rotate right 15 degrees' }).click()
    }
    await waitBearing(page, angle)
    await page.waitForTimeout(250)
    if (angle !== 0) await screenshot(page, `v02-bearing-${String(angle).padStart(3, '0')}`)
    assert(await tick(page) === pausedTick, 'Camera rotation must not advance simulation')
  }

  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  assert(box, 'Canvas must have a bounding box')
  await page.mouse.move(box.x + 750, box.y + 460)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(box.x + 920, box.y + 460, { steps: 15 })
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(500)
  assert(await bearing(page) !== 0, 'Right drag must change actual camera bearing')

  await page.getByRole('slider', { name: 'Pitch control' }).press('Home')
  await page.waitForTimeout(250)
  assert((await page.locator('.camera-pitch output').textContent())?.includes('25°'), 'Pitch minimum must be 25 degrees')
  await page.getByRole('slider', { name: 'Pitch control' }).press('End')
  await page.waitForTimeout(250)
  assert((await page.locator('.camera-pitch output').textContent())?.includes('65°'), 'Pitch maximum must be 65 degrees')
  await screenshot(page, 'v02-pitch-065')

  await page.mouse.move(box.x + 700, box.y + 500)
  await page.mouse.down()
  await page.mouse.move(box.x + 780, box.y + 520, { steps: 10 })
  await page.mouse.up()
  await page.mouse.wheel(0, -400)
  await page.waitForTimeout(1500)
  const navigationBeforeRotate = await page.locator('.camera-controls').evaluate((node) => ({
    targetX: Number(node.getAttribute('data-target-x')),
    targetZ: Number(node.getAttribute('data-target-z')),
    zoom: Number(node.getAttribute('data-zoom-ratio')),
  }))
  assert(Math.abs(navigationBeforeRotate.targetX) + Math.abs(navigationBeforeRotate.targetZ) > 0.1,
    'Pan must change the orbit target')
  assert(navigationBeforeRotate.zoom > 1, 'Wheel must increase zoom ratio')
  await screenshot(page, 'v02-pan-zoom')
  const rotateButton = page.getByRole('button', { name: 'Rotate right 15 degrees' })
  await rotateButton.hover()
  const navigationAfterHover = await page.locator('.camera-controls').evaluate((node) => ({
    targetX: Number(node.getAttribute('data-target-x')),
    targetZ: Number(node.getAttribute('data-target-z')),
    zoom: Number(node.getAttribute('data-zoom-ratio')),
  }))
  await page.waitForTimeout(250)
  await rotateButton.click()
  const navigationAfterRotate = await page.locator('.camera-controls').evaluate((node) => ({
    targetX: Number(node.getAttribute('data-target-x')),
    targetZ: Number(node.getAttribute('data-target-z')),
    zoom: Number(node.getAttribute('data-zoom-ratio')),
  }))
  assert(Math.abs(navigationAfterRotate.targetX - navigationAfterHover.targetX) < 0.75 &&
    Math.abs(navigationAfterRotate.targetZ - navigationAfterHover.targetZ) < 0.75 &&
    Math.abs(navigationAfterRotate.zoom - navigationBeforeRotate.zoom) < 0.001,
  'Rotation must preserve the current panned target and zoom')
  await page.getByRole('button', { name: 'RESET VIEW' }).click()
  await waitBearing(page, 315)
  assert(await tick(page) === pausedTick, 'Reset View must preserve simulation state')
  const resetCamera = await page.locator('.camera-controls').evaluate((node) => ({
    targetX: Number(node.getAttribute('data-target-x')),
    targetZ: Number(node.getAttribute('data-target-z')),
    zoom: Number(node.getAttribute('data-zoom-ratio')),
    pitch: node.querySelector('.camera-pitch output')?.textContent,
  }))
  assert(Math.abs(resetCamera.targetX) < 0.001 && Math.abs(resetCamera.targetZ) < 0.001 &&
    Math.abs(resetCamera.zoom - 1) < 0.001 && resetCamera.pitch?.includes('58°'),
  'Reset View must restore initial target, pitch, and zoom')
  await screenshot(page, 'v02-reset-view')

  await page.keyboard.press('e')
  await waitBearing(page, 330)
  await page.getByRole('spinbutton', { name: 'Tick to inspect' }).focus()
  await page.keyboard.press('q')
  await page.keyboard.press('r')
  assert(await bearing(page) === 330, 'Camera shortcuts must not act inside the tick input')
  await canvas.click({ position: { x: 710, y: 445 } })
  await page.keyboard.press('q')
  await waitBearing(page, 315)
  await page.keyboard.press('e')
  await waitBearing(page, 330)
  await page.keyboard.press('r')
  await waitBearing(page, 315)
  await page.setViewportSize({ width: 1200, height: 800 })
  await page.waitForTimeout(300)
  const resizedView = await page.locator('.camera-controls').evaluate((node) => ({
    targetX: Number(node.getAttribute('data-target-x')),
    targetZ: Number(node.getAttribute('data-target-z')),
    zoom: Number(node.getAttribute('data-zoom-ratio')),
  }))
  assert(await bearing(page) === 315 && Math.abs(resizedView.targetX) < 0.001 &&
    Math.abs(resizedView.targetZ) < 0.001 && Math.abs(resizedView.zoom - 1) < 0.001,
  'Resize must preserve relative zoom, bearing, and target')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(300)

  await page.getByRole('button', { name: '1× speed' }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  const performanceBefore = await page.evaluate(() => ({
    now: performance.now(),
    frames: window.__shadowCityDiagnostics?.renderedFrames ?? 0,
  }))
  await page.mouse.move(box.x + 740, box.y + 450)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(box.x + 1050, box.y + 470, { steps: 100 })
  await page.mouse.up({ button: 'right' })
  const performanceAfter = await page.evaluate(() => ({
    now: performance.now(),
    frames: window.__shadowCityDiagnostics?.renderedFrames ?? 0,
  }))
  if (await page.getByRole('button', { name: 'Pause', exact: true }).count()) {
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
  }
  const performanceStatus = await page.locator('.simulation-kicker').textContent()
  const performanceReason = await page.locator('.simulation-notice').textContent().catch(() => null)
  const performanceTick = await tick(page)
  const interactionDiagnostics = await page.evaluate(() => window.__shadowCityDiagnostics ?? null)
  const browserInfo = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    webglRenderer: (() => {
      const gl = document.querySelector('canvas')?.getContext('webgl2')
      const extension = gl?.getExtension('WEBGL_debug_renderer_info')
      return gl && extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null
    })(),
  }))
  await page.close()

  const narrow = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  monitor(narrow, 'narrow')
  await narrow.goto(base, { waitUntil: 'networkidle' })
  await narrow.waitForTimeout(1000)
  await screenshot(narrow, 'v02-narrow-390x844')
  await narrow.getByRole('button', { name: 'Rotate right 15 degrees' }).tap()
  await narrow.waitForTimeout(450)
  assert(await bearing(narrow) !== 315, 'Touch bearing button must rotate camera')
  const touchCamera = narrow.locator('.camera-controls')
  const touchTargetBefore = await touchCamera.getAttribute('data-target-x')
  const touchSession = await narrow.context().newCDPSession(narrow)
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: 170, y: 430 }] })
  for (let index = 1; index <= 12; index += 1) {
    await touchSession.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x: 170 + index * 6, y: 430 + index * 2 }],
    })
  }
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await narrow.waitForTimeout(500)
  const touchTargetAfter = await touchCamera.getAttribute('data-target-x')
  assert(Math.abs(Number(touchTargetAfter) - Number(touchTargetBefore)) > 0.1,
    'One-finger drag must pan the touch camera')
  const touchZoomBefore = Number(await touchCamera.getAttribute('data-zoom-ratio'))
  await touchSession.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ id: 1, x: 150, y: 440 }, { id: 2, x: 230, y: 440 }],
  })
  for (let index = 1; index <= 10; index += 1) {
    await touchSession.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x: 150 - index * 4, y: 440 }, { id: 2, x: 230 + index * 4, y: 440 }],
    })
  }
  await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await narrow.waitForTimeout(500)
  const touchZoomAfter = Number(await touchCamera.getAttribute('data-zoom-ratio'))
  assert(Math.abs(touchZoomAfter - touchZoomBefore) > 0.01,
    'Two-finger pinch must zoom the touch camera')
  await touchSession.detach()
  await narrow.close()

  console.log(JSON.stringify({
    seed: 'shadow-city-hero-01',
    viewport: '1440x900',
    browserInfo,
    screenshots,
    pausedTick,
    performanceStatus,
    performanceReason,
    performanceTick,
    touchTargetBefore,
    touchTargetAfter,
    touchZoomBefore,
    touchZoomAfter,
    activeDragFrameRate: (performanceAfter.frames - performanceBefore.frames) /
      ((performanceAfter.now - performanceBefore.now) / 1000),
    activeDragFrameCount: performanceAfter.frames - performanceBefore.frames,
    activeDragDurationSeconds: (performanceAfter.now - performanceBefore.now) / 1000,
    idleBefore,
    idleAfter,
    interactionDiagnostics,
    warnings: [...warnings],
    issues,
  }, null, 2))
  if (issues.length) process.exitCode = 1
} finally {
  await browser.close()
}
