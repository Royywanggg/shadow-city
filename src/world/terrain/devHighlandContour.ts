/** Shared millimetre contours for the dev-only rear highland and its graded road. */
export function rearHighlandFrontZmm(xMm: number): number {
  return Math.round(-112_000 +
    2_200 * Math.sin((xMm - 36_000) / 10_500) +
    650 * Math.sin((xMm - 36_000) / 3_900))
}

export function rearHighlandBackZmm(xMm: number): number {
  const x = xMm / 1000
  const smoothstep = (value: number) => {
    const t = Math.max(0, Math.min(1, value))
    return t * t * (3 - 2 * t)
  }
  const homeCorner = 2_500 * smoothstep((x - 58) / 10) *
    smoothstep((86 - x) / 10)
  return Math.round(-137_300 +
    850 * Math.sin((xMm - 36_000) / 13_500 + 0.4) - homeCorner)
}
