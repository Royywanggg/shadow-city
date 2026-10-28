/** Authoritative v5 world time. Tick zero is the scenario's configured start hour. */
export interface WorldClockV1 {
  readonly tickIndex: number
  readonly worldSeconds: number
  readonly elapsedSeconds: number
  readonly dayIndex: number
  readonly timeOfDaySeconds: number
  readonly secondsPerTick: 6
}

export function worldClockAtTick(startHour: number, tickIndex: number): WorldClockV1 {
  if (!Number.isSafeInteger(startHour) || startHour < 0 || startHour > 23 ||
    !Number.isSafeInteger(tickIndex) || tickIndex < 0) {
    throw new Error('Invalid world clock input')
  }
  const elapsedSeconds = tickIndex * 6
  const worldSeconds = startHour * 3_600 + elapsedSeconds
  if (!Number.isSafeInteger(worldSeconds)) throw new Error('World clock overflow')
  return { tickIndex, worldSeconds, elapsedSeconds,
    dayIndex: Math.floor(worldSeconds / 86_400),
    timeOfDaySeconds: worldSeconds % 86_400, secondsPerTick: 6 }
}
