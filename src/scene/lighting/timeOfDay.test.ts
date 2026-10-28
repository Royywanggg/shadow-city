import { describe, expect, it } from 'vitest'
import { worldClockAtTick } from '../../simulation/clock'
import { calendarAtTick } from '../../simulation/habits/calendar'
import { formatWorldTime, getLightingState } from './timeOfDay'

describe('authoritative world time and lighting', () => {
  it('keeps movement and integrated habits on the same six-second day', () => {
    const clock = worldClockAtTick(23, 600)
    const calendar = calendarAtTick(23, 600, 6)
    expect(clock).toMatchObject({ tickIndex: 600, worldSeconds: 86_400,
      secondsPerTick: 6, dayIndex: 1, timeOfDaySeconds: 0 })
    expect(calendar).toMatchObject({ day: clock.dayIndex, secondOfDay: clock.timeOfDaySeconds })
    expect(worldClockAtTick(8, 5).worldSeconds - worldClockAtTick(8, 0).worldSeconds).toBe(30)
  })

  it('maps a full day to distinct lighting while wrapping at midnight', () => {
    expect(getLightingState(12 * 3_600).phase).toBe('Noon')
    expect(getLightingState(21 * 3_600).phase).toBe('Night')
    const midnight = getLightingState(0)
    const nextDay = getLightingState(86_400)
    expect({ ...midnight, worldSeconds: 0 }).toEqual({ ...nextDay, worldSeconds: 0 })
    expect(formatWorldTime(86_400)).toBe('00:00')
    const before = getLightingState(86_399)
    expect(Math.abs(before.windowEmission - midnight.windowEmission)).toBeLessThan(.001)
    expect(Math.hypot(...before.sunDirection.map((value, index) =>
      value - midnight.sunDirection[index]))).toBeLessThan(.001)
  })

  it('interpolates without negative intensities or keyframe jumps', () => {
    for (let second = 0; second < 86_400; second += 30) {
      const state = getLightingState(second)
      expect(state.sunIntensity).toBeGreaterThanOrEqual(0)
      expect(state.moonIntensity).toBeGreaterThanOrEqual(0)
      expect(state.windowEmission).toBeGreaterThanOrEqual(0)
      expect(state.streetlightIntensity).toBeGreaterThanOrEqual(0)
      expect(state.fogDensity).toBeGreaterThanOrEqual(0)
      expect(state.sunDirection.every(Number.isFinite)).toBe(true)
    }
    for (const hour of [4, 6, 7, 9, 12, 16, 18.5, 20, 21, 23]) {
      const edge = hour * 3_600
      expect(Math.abs(getLightingState(edge - 1).sunIntensity -
        getLightingState(edge + 1).sunIntensity)).toBeLessThan(.005)
    }
  })

  it('reconstructs visual state directly after seeking or leaving preview', () => {
    const tick = 2_450
    const worldTime = worldClockAtTick(8, tick).worldSeconds
    const expected = getLightingState(worldTime)
    getLightingState(5 * 3_600)
    getLightingState(23 * 3_600)
    expect(getLightingState(worldTime)).toEqual(expected)
    expect(getLightingState(worldClockAtTick(8, tick).worldSeconds)).toEqual(expected)
  })
})
