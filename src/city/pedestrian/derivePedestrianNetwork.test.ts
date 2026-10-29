import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../generation/generateCity'
import { derivePedestrianNetwork } from './derivePedestrianNetwork'
import type { Building, PedestrianNode } from '../model'

function reachableNodeIds(nodes: readonly PedestrianNode[], edges: readonly { from: string; to: string }[]): Set<string> {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]))
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to)
    adjacency.get(edge.to)?.push(edge.from)
  }
  const reached = new Set<string>()
  const pending = [nodes[0].id]
  while (pending.length) {
    const next = pending.pop()!
    if (reached.has(next)) continue
    reached.add(next)
    pending.push(...adjacency.get(next)!)
  }
  return reached
}

function passesThroughGroundMass(a: PedestrianNode, b: PedestrianNode, buildings: readonly Building[]): boolean {
  for (const building of buildings) {
    for (const mass of building.masses.filter((candidate) => candidate.baseY < 2)) {
      const minX = building.x + mass.offsetX - mass.width / 2 + 0.02
      const maxX = building.x + mass.offsetX + mass.width / 2 - 0.02
      const minZ = building.z + mass.offsetZ - mass.depth / 2 + 0.02
      const maxZ = building.z + mass.offsetZ + mass.depth / 2 - 0.02
      if (Math.abs(a.x - b.x) < 1e-6 && a.x > minX && a.x < maxX &&
          Math.max(a.z, b.z) > minZ && Math.min(a.z, b.z) < maxZ) return true
      if (Math.abs(a.z - b.z) < 1e-6 && a.z > minZ && a.z < maxZ &&
          Math.max(a.x, b.x) > minX && Math.min(a.x, b.x) < maxX) return true
    }
  }
  return false
}

function distanceToSegment(x: number, z: number, a: PedestrianNode, b: PedestrianNode): number {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - a.x - t * dx, z - a.z - t * dz)
}

describe('derived pedestrian network', () => {
  it('places diagonal crossing curbs on the actual approach through the road', () => {
    const city: Parameters<typeof derivePedestrianNetwork>[0] = {
      roads: { nodes: [{ id: 'left', x: 8, z: -10 },
        { id: 'right', x: 8, z: 10 }],
      edges: [{ id: 'edge-z-1-0', from: 'left', to: 'right', width: 4,
        kind: 'street' }] },
      blocks: [
        { id: 'block-0-0', column: 0, row: 0, x: 0, z: 0,
          width: 10, depth: 10, district: 'residential', isPlaza: false, isPark: false },
        { id: 'block-1-0', column: 1, row: 0, x: 16, z: 4,
          width: 10, depth: 10, district: 'residential', isPlaza: false, isPark: false },
      ], parcels: [], buildings: [], plaza: { x: 0, z: 0, width: 1, depth: 1 },
    }
    const graph = derivePedestrianNetwork(city, { curbPlacement: 'endpointVector' })
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
    const crossing = graph.edges.find((edge) => edge.id === 'ped-cross-east-block-0-0')!
    const a = nodes.get('ped-block-0-0-1-0')!
    const b = nodes.get('ped-block-1-0-0-0')!
    const curbA = nodes.get(crossing.from)!
    const curbB = nodes.get(crossing.to)!
    const dx = b.x - a.x
    const dz = b.z - a.z
    for (const curb of [curbA, curbB]) {
      expect(Math.abs((curb.x - a.x) * dz - (curb.z - a.z) * dx))
        .toBeLessThan(1e-8)
    }
    expect(curbB.x - curbA.x).toBeCloseTo(4, 8)
    expect(curbB.z - curbA.z).toBeGreaterThan(0)
    expect(crossing.sourceRoadEdgeId).toBe('edge-z-1-0')
  })

  it('keeps the legacy curb placement byte-for-byte on the default path', () => {
    const city = generateCity(HERO_SEED)
    expect(derivePedestrianNetwork(city)).toEqual(city.pedestrian)
    expect(derivePedestrianNetwork(city, { curbPlacement: 'axisAligned' }))
      .toEqual(city.pedestrian)
  })

  for (const seed of [HERO_SEED, 'shadow-city-variation-a', 'shadow-city-variation-b']) {
    it(`connects every entrance and public destination without crossing buildings for ${seed}`, () => {
      const city = generateCity(seed)
      const graph = city.pedestrian
      const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
      const roadEdges = new Map(city.roads.edges.map((edge) => [edge.id, edge]))
      expect(graph.nodes.length).toBeGreaterThan(300)
      expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(graph.nodes.length)
      expect(new Set(graph.edges.map((edge) => edge.id)).size).toBe(graph.edges.length)
      expect(new Set(graph.anchors.map((anchor) => anchor.id)).size).toBe(graph.anchors.length)
      expect(graph.anchors.filter((anchor) => anchor.kind === 'building')).toHaveLength(city.buildings.length)
      expect(graph.anchors.filter((anchor) => anchor.kind === 'plaza')).toHaveLength(14)
      expect(graph.anchors.filter((anchor) => anchor.kind === 'park')).toHaveLength(30)
      expect(graph.edges.filter((edge) => edge.kind === 'crossing')).toHaveLength(84)

      const reached = reachableNodeIds(graph.nodes, graph.edges)
      expect(reached.size).toBe(graph.nodes.length)
      for (const anchor of graph.anchors) expect(reached.has(anchor.nodeId)).toBe(true)
      for (const edge of graph.edges) {
        const from = nodeById.get(edge.from)!
        const to = nodeById.get(edge.to)!
        expect(from).toBeDefined()
        expect(to).toBeDefined()
        expect(edge.length).toBeGreaterThan(0)
        expect(edge.costMm).toBeGreaterThan(0)
        expect([from.x, from.z, from.surfaceY, to.x, to.z, to.surfaceY].every(Number.isFinite)).toBe(true)
        if (edge.kind === 'crossing') {
          expect(roadEdges.has(edge.sourceRoadEdgeId!)).toBe(true)
          expect(from.kind).toBe('crossing')
          expect(to.kind).toBe('crossing')
        } else {
          expect(passesThroughGroundMass(from, to, city.buildings)).toBe(false)
        }
      }
    })
  }

  it('shares deterministic world-space entrances with the building frontage', () => {
    const city = generateCity(HERO_SEED)
    expect(generateCity(HERO_SEED).pedestrian).toEqual(city.pedestrian)
    const nodes = new Map(city.pedestrian.nodes.map((node) => [node.id, node]))
    const anchors = new Map(city.pedestrian.anchors.map((anchor) => [anchor.id, anchor]))
    const parcels = new Map(city.parcels.map((parcel) => [parcel.id, parcel]))
    for (const building of city.buildings) {
      const front = building.masses[0]
      const anchor = anchors.get(`anchor-${building.id}`)!
      const doorstep = nodes.get(anchor.nodeId)!
      const frontZ = building.z + front.offsetZ + front.depth / 2
      expect(building.entrance.face).toBe('south')
      expect(building.entrance.z).toBeCloseTo(frontZ + 0.36)
      expect(doorstep.x).toBe(building.entrance.x)
      expect(doorstep.z).toBe(building.entrance.z)
      expect(doorstep.kind).toBe('entrance')
      const parcel = parcels.get(building.parcelId)!
      expect(Math.abs(doorstep.x - parcel.x)).toBeLessThan(parcel.width / 2)
      expect(Math.abs(doorstep.z - parcel.z)).toBeLessThan(parcel.depth / 2)
    }
  })

  it('distributes public anchors over visible walkable space and clear of street furniture', () => {
    const city = generateCity(HERO_SEED)
    const nodes = new Map(city.pedestrian.nodes.map((node) => [node.id, node]))
    const publicAnchors = city.pedestrian.anchors.filter((anchor) =>
      anchor.kind === 'plaza' || anchor.kind === 'park')
    const publicNodes = publicAnchors.map((anchor) => nodes.get(anchor.nodeId)!)
    expect(new Set(publicNodes.map((node) => `${node.x.toFixed(6)}:${node.z.toFixed(6)}`)).size).toBe(publicNodes.length)
    for (let index = 0; index < publicNodes.length; index += 1) {
      const node = publicNodes[index]
      for (const other of publicNodes.slice(index + 1)) {
        expect(Math.hypot(node.x - other.x, node.z - other.z)).toBeGreaterThan(0.5)
      }
    }

    for (const anchor of publicAnchors.filter((item) => item.kind === 'plaza')) {
      const node = nodes.get(anchor.nodeId)!
      const dx = node.x - city.plaza.x
      const dz = node.z - city.plaza.z
      expect(Math.abs(dx)).toBeLessThan(city.plaza.width * 0.44)
      expect(Math.abs(dz)).toBeLessThan(city.plaza.depth * 0.44)
      expect(Math.hypot(dx, dz)).toBeGreaterThan(4.95)
      for (const side of [-1, 1]) {
        const planterX = side * city.plaza.width * 0.31
        expect(Math.abs(dx - planterX) > city.plaza.width * 0.055 + 0.35 ||
          Math.abs(dz) > city.plaza.depth * 0.225 + 0.35).toBe(true)
      }
      for (const treeXRatio of [-0.38, -0.18, 0.18, 0.38]) {
        for (const treeZRatio of [-0.36, 0.36]) {
          expect(Math.hypot(dx - treeXRatio * city.plaza.width, dz - treeZRatio * city.plaza.depth)).toBeGreaterThan(2)
        }
      }
      for (const feature of city.streetFeatures.filter((item) => item.kind === 'bench' || item.kind === 'planter')) {
        expect(Math.hypot(node.x - feature.x, node.z - feature.z)).toBeGreaterThan(1.5)
      }
    }

    for (const anchor of publicAnchors.filter((item) => item.kind === 'park')) {
      const block = city.blocks.find((item) => item.id === anchor.blockId)!
      const node = nodes.get(anchor.nodeId)!
      expect(Math.abs(node.x - block.x)).toBeLessThan(block.width * 0.085)
      expect(Math.abs(node.z - block.z)).toBeLessThan(block.depth * 0.455)
      for (const feature of city.streetFeatures.filter((item) => item.kind === 'tree')) {
        expect(Math.hypot(node.x - feature.x, node.z - feature.z)).toBeGreaterThan(2)
      }
    }

    for (const edge of city.pedestrian.edges.filter((item) => item.kind === 'publicSpace')) {
      const a = nodes.get(edge.from)!
      const b = nodes.get(edge.to)!
      const block = city.blocks.find((item) => edge.id.startsWith(`ped-public-${item.id}-`))!
      if (block.isPlaza) {
        expect(distanceToSegment(city.plaza.x, city.plaza.z, a, b)).toBeGreaterThan(4.95)
        for (const side of [-1, 1]) {
          const planterX = city.plaza.x + side * city.plaza.width * 0.31
          const overlapsPlanterX = Math.max(a.x, b.x) > planterX - city.plaza.width * 0.055 - 0.35 &&
            Math.min(a.x, b.x) < planterX + city.plaza.width * 0.055 + 0.35
          const overlapsPlanterZ = Math.max(a.z, b.z) > city.plaza.z - city.plaza.depth * 0.225 - 0.35 &&
            Math.min(a.z, b.z) < city.plaza.z + city.plaza.depth * 0.225 + 0.35
          expect(overlapsPlanterX && overlapsPlanterZ).toBe(false)
        }
        for (const xRatio of [-0.38, -0.18, 0.18, 0.38]) {
          for (const zRatio of [-0.36, 0.36]) {
            expect(distanceToSegment(city.plaza.x + xRatio * city.plaza.width, city.plaza.z + zRatio * city.plaza.depth, a, b)).toBeGreaterThan(2)
          }
        }
      } else {
        for (const feature of city.streetFeatures.filter((item) => item.kind === 'tree' &&
            Math.abs(item.x - block.x) < block.width / 2 && Math.abs(item.z - block.z) < block.depth / 2)) {
          expect(distanceToSegment(feature.x, feature.z, a, b)).toBeGreaterThan(2)
        }
      }
    }
  })

  it('keeps all destinations connected across sampled generation seeds', () => {
    for (let index = 0; index < 20; index += 1) {
      const city = generateCity(`pedestrian-sample-${index}`)
      const reached = reachableNodeIds(city.pedestrian.nodes, city.pedestrian.edges)
      expect(reached.size).toBe(city.pedestrian.nodes.length)
      for (const anchor of city.pedestrian.anchors) expect(reached.has(anchor.nodeId)).toBe(true)
    }
  })
})
