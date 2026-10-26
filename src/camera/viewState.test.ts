import { describe, expect, it, vi } from 'vitest'
import { createCameraController } from './cameraController'
import {
  bearingFromOffset,
  clampPitch,
  clampZoomRatio,
  INITIAL_CAMERA_VIEW,
  MAX_PITCH_DEG,
  MIN_PITCH_DEG,
  normalizeBearing,
  offsetFromBearingPitch,
  pitchFromOffset,
} from './viewState'

describe('map camera convention', () => {
  it('normalizes all cardinal bearings and the 359-to-0 wrap', () => {
    expect(normalizeBearing(360)).toBe(0)
    expect(normalizeBearing(-1)).toBe(359)
    expect(normalizeBearing(719)).toBe(359)
    for (const bearing of [0, 90, 180, 270, 359]) {
      const [x, , z] = offsetFromBearingPitch(bearing, 45, 100)
      expect(bearingFromOffset(x, z)).toBeCloseTo(bearing, 8)
    }
    expect(bearingFromOffset(0, 100)).toBe(0)
    expect(bearingFromOffset(-100, 0)).toBe(90)
    expect(bearingFromOffset(0, -100)).toBe(180)
    expect(bearingFromOffset(100, 0)).toBe(270)
  })

  it('uses a bounded map pitch without changing the orbit radius', () => {
    expect(clampPitch(0)).toBe(MIN_PITCH_DEG)
    expect(clampPitch(90)).toBe(MAX_PITCH_DEG)
    expect(clampZoomRatio(0.01)).toBe(0.72)
    expect(clampZoomRatio(100)).toBe(2.8)
    for (const pitch of [MIN_PITCH_DEG, 45, MAX_PITCH_DEG]) {
      const [x, y, z] = offsetFromBearingPitch(135, pitch, 314)
      expect(Math.hypot(x, y, z)).toBeCloseTo(314, 8)
      expect(pitchFromOffset(x, y, z)).toBeCloseTo(pitch, 8)
    }
  })

  it('defines the existing hero pose as 315 degrees and keeps it recoverable', () => {
    expect(INITIAL_CAMERA_VIEW.target).toEqual([0, 0, 0])
    expect(INITIAL_CAMERA_VIEW.bearingDeg).toBe(315)
    expect(INITIAL_CAMERA_VIEW.pitchDeg).toBeGreaterThan(55)
    expect(INITIAL_CAMERA_VIEW.pitchDeg).toBeLessThan(60)
    expect(INITIAL_CAMERA_VIEW.zoomRatio).toBe(1)
  })
})

describe('camera controller', () => {
  it('keeps a stable snapshot and routes camera actions without touching simulation', () => {
    const controller = createCameraController()
    const setBearing = vi.fn()
    const setPitch = vi.fn()
    const resetView = vi.fn()
    const unbind = controller.bind({ setBearing, setPitch, resetView })
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)
    const initial = controller.getSnapshot()

    controller.rotateBy(60)
    controller.rotateBy(15)
    controller.northUp()
    controller.setPitch(40)
    controller.resetView()
    expect(setBearing.mock.calls).toEqual([[15], [30], [0]])
    expect(setPitch).toHaveBeenCalledWith(40)
    expect(resetView).toHaveBeenCalledOnce()
    expect(controller.getSnapshot()).toBe(initial)

    controller.updateFromRig({ ...initial, target: [12, 0, -8], bearingDeg: 359.5 })
    expect(listener).toHaveBeenCalledOnce()
    expect(controller.getSnapshot().target).toEqual([12, 0, -8])
    controller.updateFromRig({ ...controller.getSnapshot(), target: [12, 0, -8] })
    expect(listener).toHaveBeenCalledOnce()
    unsubscribe()
    unbind()
    controller.resetView()
    expect(resetView).toHaveBeenCalledOnce()
  })
})
