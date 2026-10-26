import { DEFAULT_TICKS_PER_SECOND } from '../../playback/FixedStepScheduler'

/** Animation follows displayed playback ticks, not six-second simulated city-time jumps. */
export function sampleAnimationTime(previousTick: number | null, currentTick: number, alpha: number): number {
  const displayedTick = previousTick === null
    ? currentTick
    : previousTick + (currentTick - previousTick) * Math.max(0, Math.min(1, alpha))
  return displayedTick / DEFAULT_TICKS_PER_SECOND
}
