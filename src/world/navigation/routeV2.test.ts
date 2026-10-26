import { describe, expect, it } from 'vitest'
import { generateVerticalProofWorld, generateWorldV2 } from '../generation/generateWorldV2'
import { createNavigationIndexV2, findRouteV2, pointAlongEdge,
  DEFAULT_TRAVELLER_COSTS } from './routeV2'

describe('multi-level world proof', () => {
  it('generates repeatable static districts and a connected road graph', () => {
    const world = generateWorldV2()
    expect(world).toEqual(generateWorldV2())
    expect(new Set(world.districts.map((district) => district.kind)).size).toBe(5)
    const adjacency = new Map(world.roadNodes.map((node) => [node.id, [] as string[]]))
    for (const edge of world.roadEdges) {
      adjacency.get(edge.from)!.push(edge.to)
      adjacency.get(edge.to)!.push(edge.from)
    }
    const seen = new Set<string>()
    const pending = [world.roadNodes[0].id]
    while (pending.length > 0) {
      const current = pending.pop()!
      if (seen.has(current)) continue
      seen.add(current)
      pending.push(...adjacency.get(current)!)
    }
    expect(seen.size).toBe(world.roadNodes.length)
  })

  it('keeps ground and bridge at the same X/Z separate and traverses continuous stairs', () => {
    const index = createNavigationIndexV2(generateVerticalProofWorld())
    const street = index.nodeById.get('ground:-9:0')!
    const deck = index.nodeById.get('bridge:west')!
    expect(street.position.x).toBe(deck.position.x)
    expect(street.position.z).toBe(deck.position.z)
    expect(street.position.y).toBeLessThan(deck.position.y)
    expect(street.surfaceId).not.toBe(deck.surfaceId)
    const route = findRouteV2(index, 'ground:-95:-15', 'bridge:east')
    expect(route.status).toBe('ok')
    if (route.status !== 'ok') return
    expect(route.steps.some((step) => step.edgeId === 'connector:west-stair')).toBe(true)
    const stair = route.steps.find((step) => step.edgeId === 'connector:west-stair')!
    const middle = pointAlongEdge(index, stair, stair.lengthMm / 2)
    expect(middle.y).toBeGreaterThan(250)
    expect(middle.y).toBeLessThan(5500)
  })

  it('preserves a ground crossing when the bridge is closed to new entrants', () => {
    const index = createNavigationIndexV2(generateVerticalProofWorld())
    const closed = new Map([['bridge-entry', 'entryClosed' as const]])
    const route = findRouteV2(index, 'ground:-95:-15', 'galleria:l0:75:22', undefined, closed)
    expect(route.status).toBe('ok')
    if (route.status !== 'ok') return
    expect(route.steps.some((step) => step.edgeId.startsWith('bridge:'))).toBe(false)
    expect(route.steps.some((step) => index.edgeById.get(step.edgeId)?.kind === 'crossing')).toBe(true)
  })

  it('lets personal bridge cost change the route without a prescribed bridge share', () => {
    const index = createNavigationIndexV2(generateVerticalProofWorld())
    const lowCost = findRouteV2(index, 'ground:-15:-15', 'galleria:l1:entry',
      { ...DEFAULT_TRAVELLER_COSTS, bridgeMultiplier: 0.15 })
    const highCost = findRouteV2(index, 'ground:-15:-15', 'galleria:l1:entry',
      { ...DEFAULT_TRAVELLER_COSTS, bridgeMultiplier: 9 })
    expect(lowCost.status).toBe('ok')
    expect(highCost.status).toBe('ok')
    if (lowCost.status !== 'ok' || highCost.status !== 'ok') return
    expect(lowCost.steps.some((step) => step.edgeId === 'bridge:deck')).toBe(true)
    expect(highCost.steps.some((step) => step.edgeId === 'bridge:deck')).toBe(false)
  })
})
