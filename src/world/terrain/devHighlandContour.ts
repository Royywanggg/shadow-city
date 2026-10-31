/** Shared millimetre contours for the dev-only rear highland and its graded road. */
export function rearHighlandFrontZmm(xMm: number): number {
  return Math.round(-112_000 +
    2_200 * Math.sin((xMm - 36_000) / 10_500) +
    650 * Math.sin((xMm - 36_000) / 3_900))
}

export function rearHighlandBackZmm(xMm: number): number {
  return Math.round(-135_500 +
    850 * Math.sin((xMm - 36_000) / 13_500 + 0.4))
}
