/** Shortest arc interpolation changes only the rendered facing. */
export function interpolateHeading(from: number, to: number, alpha: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + delta * Math.max(0, Math.min(1, alpha))
}
