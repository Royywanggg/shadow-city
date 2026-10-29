import { describe, expect, it } from 'vitest'
import type { CityModel, RoadEdge, RoadNode } from '../../city/model'
import type { DevTerrainV1 } from '../../world/terrain/devTerrain'
import type { WorldPointMm } from '../../world/model'
import { planCurvedJunctions, trimRoadPath } from './roadJunctions'

function crossing(bridge = false): { city: CityModel;
  terrain: Pick<DevTerrainV1, 'roadProfiles'> } {
  const nodes: RoadNode[] = [
    { id: 'center', x: 0, z: 0 }, { id: 'east', x: 10, z: 0 },
    { id: 'south', x: 0, z: 10 }, { id: 'west', x: -10, z: 0 },
    { id: 'north', x: 0, z: -10 },
  ]
  const edges: RoadEdge[] = [
    { id: 'east', from: 'center', to: 'east', width: 4, kind: 'street',
      centerlineXZ: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }] },
    { id: 'south', from: 'center', to: 'south', width: 4, kind: 'street' },
    { id: 'west', from: 'west', to: 'center', width: 4, kind: 'street' },
    { id: 'north', from: 'north', to: 'center', width: 4, kind: 'street' },
  ]
  const points = new Map(nodes.map((node) => [node.id, node]))
  const profiles = edges.map((edge) => {
    const from = points.get(edge.from)!
    const to = points.get(edge.to)!
    const path: WorldPointMm[] = [
      { x: from.x * 1000, y: 70, z: from.z * 1000 },
      { x: to.x * 1000, y: 70, z: to.z * 1000 },
    ]
    return { edgeId: edge.id, path, bridge: false,
      ...(bridge && edge.id === 'east'
        ? { bridgeSpan: { startIndex: 0, endIndex: 1 } } : {}) }
  })
  return { city: { roads: { nodes, edges } } as CityModel,
    terrain: { roadProfiles: profiles } }
}

describe('curved road junction plan', () => {
  it('joins four road sides at the asphalt corner and trims each pavement approach', () => {
    const { city, terrain } = crossing()
    const plan = planCurvedJunctions(city, terrain)
    expect(plan.cornersByNode.get('center')).toHaveLength(4)
    expect(plan.trimsMm.size).toBe(8)
    expect([...plan.trimsMm.values()]).toEqual(Array(8).fill(2000))
    expect(plan.cornersByNode.get('center')?.map((corner) => corner.point))
      .toEqual(expect.arrayContaining([
        { x: 2, z: 2 }, { x: -2, z: 2 },
        { x: -2, z: -2 }, { x: 2, z: -2 },
      ]))
  })

  it('leaves a bridge junction on its existing geometry path', () => {
    const { city, terrain } = crossing(true)
    const plan = planCurvedJunctions(city, terrain)
    expect(plan.cornersByNode.size).toBe(0)
    expect(plan.trimsMm.size).toBe(0)
  })

  it('interpolates trim endpoints and refuses to leave an unjoined sidewalk', () => {
    const path: WorldPointMm[] = [
      { x: 0, y: 70, z: 0 }, { x: 5000, y: 170, z: 0 },
      { x: 10000, y: 270, z: 0 },
    ]
    expect(trimRoadPath(path, 2000, 3000)).toEqual([
      { x: 2000, y: 110, z: 0 }, { x: 5000, y: 170, z: 0 },
      { x: 7000, y: 210, z: 0 },
    ])
    expect(() => trimRoadPath(path, 5000, 5000)).toThrow(/lacks room/)
  })
})
