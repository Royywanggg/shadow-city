import type { HabitScenarioConfigV1 } from './types'
import { worldClockAtTick } from '../clock'

export interface SimulationCalendarV1 {
  readonly day: number
  readonly minuteOfDay: number
  readonly secondOfDay: number
  readonly tickInDay: number
  readonly ticksPerDay: number
}

export function validateHabitConfig(config: HabitScenarioConfigV1): void {
  if (config.version !== 'habit-v1' || !config.seed ||
    !Number.isSafeInteger(config.calendarSecondsPerTick) ||
    config.calendarSecondsPerTick < 6 ||
    86_400 % config.calendarSecondsPerTick !== 0 ||
    !Number.isFinite(config.habitWeight) || config.habitWeight < 0 ||
    config.habitWeight > 2 || !Number.isFinite(config.feedbackWeight) ||
    config.feedbackWeight < 0 || config.feedbackWeight > 2) {
    throw new Error('Invalid habit scenario configuration')
  }
}

/** Unified scenarios use the same six-second clock as movement and contact. */
export function calendarAtTick(startHour: number, tick: number,
  calendarSecondsPerTick: number): SimulationCalendarV1 {
  if (!Number.isSafeInteger(startHour) || startHour < 0 || startHour > 23 ||
    !Number.isSafeInteger(tick) || tick < 0 ||
    !Number.isSafeInteger(calendarSecondsPerTick) || calendarSecondsPerTick <= 0 ||
    86_400 % calendarSecondsPerTick !== 0) throw new Error('Invalid simulation calendar input')
  const absoluteSeconds = calendarSecondsPerTick === 6 ?
    worldClockAtTick(startHour, tick).worldSeconds :
    startHour * 3_600 + tick * calendarSecondsPerTick
  if (!Number.isSafeInteger(absoluteSeconds)) throw new Error('Simulation calendar overflow')
  const secondOfDay = absoluteSeconds % 86_400
  return { day: Math.floor(absoluteSeconds / 86_400),
    minuteOfDay: Math.floor(secondOfDay / 60), secondOfDay,
    tickInDay: Math.floor(secondOfDay / calendarSecondsPerTick),
    ticksPerDay: 86_400 / calendarSecondsPerTick }
}

export function minuteInWindow(minute: number, start: number, end: number): boolean {
  return start < end ? minute >= start && minute < end : minute >= start || minute < end
}
