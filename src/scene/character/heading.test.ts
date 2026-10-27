import { describe, expect, it } from 'vitest'
import { interpolateHeading } from './heading'

describe('rendered heading', () => {
  it('takes the short arc through north and clamps transition progress', () => {
    const start = 350 * Math.PI / 180
    const end = 10 * Math.PI / 180
    expect(Math.sin(interpolateHeading(start, end, .5))).toBeCloseTo(0)
    expect(interpolateHeading(start, end, 0)).toBeCloseTo(start)
    expect(Math.sin(interpolateHeading(start, end, 1))).toBeCloseTo(Math.sin(end))
  })
})
