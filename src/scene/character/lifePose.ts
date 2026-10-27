export interface LifePosePhase {
  readonly collapseProgress: number
  readonly standProgress?: number
}

/** Pose follows the displayed simulation Tick; real elapsed browser time is irrelevant. */
export function lifePoseForTick(currentTick: number, alpha: number,
  onsetTick?: number, standTick?: number): LifePosePhase {
  const fraction = Math.max(0, Math.min(1, alpha))
  return {
    collapseProgress: onsetTick === undefined ? 0 :
      Math.max(0, Math.min(1, currentTick - onsetTick + fraction)),
    ...(standTick === currentTick ? { standProgress: fraction } : {}),
  }
}
