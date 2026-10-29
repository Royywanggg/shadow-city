import { describe, expect, it } from 'vitest'
import { generateCity, HERO_SEED } from '../../city/generation/generateCity'
import { derivePedestrianNetwork } from '../../city/pedestrian/derivePedestrianNetwork'
import { createDevOrganicLayout } from './devOrganicLayout'
import { expandOriginalCity } from './expandOriginalCity'
import { generateDevWorld } from './generateDevWorld'

describe('dev organic outer layout', () => {
  it('requires an expanded input and stays safe across seeded city variants', () => {
    expect(() => createDevOrganicLayout(generateCity(HERO_SEED))).toThrow(
      'expanded 300 m CityModel')
    for (const seed of [HERO_SEED, 'twilight-layout-02', 'twilight-layout-03']) {
      const expanded = expandOriginalCity(generateCity(seed))
      const moved = createDevOrganicLayout(expanded)
      expect(moved.seed).toBe(seed)
      expect(moved.buildings).toHaveLength(expanded.buildings.length)
      expect(moved.roads.nodes).toHaveLength(expanded.roads.nodes.length)
    }
  })

  it('pins the plaza, Galleria, channel and ridge without losing IDs', () => {
    const original = generateCity(HERO_SEED)
    const expanded = expandOriginalCity(original)
    const moved = createDevOrganicLayout(expanded)
    expect(createDevOrganicLayout(expanded)).toEqual(moved)
    expect(moved).not.toBe(expanded)
    expect(moved.plaza).toEqual(expanded.plaza)
    expect(moved.pedestrian).toBe(expanded.pedestrian)
    for (const key of ['blocks', 'parcels', 'buildings', 'streetFeatures'] as const) {
      expect(moved[key].map((item) => item.id)).toEqual(expanded[key].map((item) => item.id))
    }
    expect(moved.roads.nodes.map((node) => node.id))
      .toEqual(expanded.roads.nodes.map((node) => node.id))
    expect(moved.roads.edges).toEqual(expanded.roads.edges)
    const protectedBlocks = ['block-3-3', 'block-4-3', 'block-0-4',
      'block-0-5', 'block-0-6', 'block--1-6',
      'block-4--1', 'block-5--1', 'block-6--1']
    const protectedNodes = new Set<string>()
    for (const blockId of protectedBlocks) {
      expect(moved.blocks.find((item) => item.id === blockId))
        .toEqual(expanded.blocks.find((item) => item.id === blockId))
      const block = expanded.blocks.find((item) => item.id === blockId)!
      for (const column of [block.column, block.column + 1]) {
        for (const row of [block.row, block.row + 1]) {
          protectedNodes.add(`node-${column}-${row}`)
        }
      }
    }
    for (const nodeId of protectedNodes) {
      expect(moved.roads.nodes.find((item) => item.id === nodeId))
        .toEqual(expanded.roads.nodes.find((item) => item.id === nodeId))
    }
    const parcelBlock = new Map(expanded.parcels.map((parcel) => [parcel.id, parcel.blockId]))
    for (const building of expanded.buildings.filter((item) =>
      protectedBlocks.includes(parcelBlock.get(item.parcelId)!))) {
      expect(moved.buildings.find((item) => item.id === building.id)).toEqual(building)
    }
  })

  it('makes central approach avenues visibly non-orthogonal while moving buildings together', () => {
    const expanded = expandOriginalCity(generateCity(HERO_SEED))
    const moved = createDevOrganicLayout(expanded)
    const beforeNodes = new Map(expanded.roads.nodes.map((node) => [node.id, node]))
    const afterNodes = new Map(moved.roads.nodes.map((node) => [node.id, node]))
    const maxNodeShift = Math.max(...moved.roads.nodes.map((node) => {
      const before = beforeNodes.get(node.id)!
      return Math.hypot(node.x - before.x, node.z - before.z)
    }))
    expect(maxNodeShift).toBeGreaterThanOrEqual(4)
    const slantedAvenues = moved.roads.edges.filter((edge) => {
      const from = afterNodes.get(edge.from)!
      const to = afterNodes.get(edge.to)!
      const originalFrom = beforeNodes.get(edge.from)!
      const originalTo = beforeNodes.get(edge.to)!
      const originallyAxisAligned = Math.abs(originalFrom.x - originalTo.x) < 1e-9 ||
        Math.abs(originalFrom.z - originalTo.z) < 1e-9
      return edge.kind === 'avenue' && originallyAxisAligned &&
        Math.abs(from.x - to.x) > 2 && Math.abs(from.z - to.z) > 2 &&
        Math.max(Math.abs(from.x), Math.abs(to.x),
          Math.abs(from.z), Math.abs(to.z)) <= 106
    })
    expect(slantedAvenues.length).toBeGreaterThanOrEqual(3)
    const originalBlocks = new Map(expanded.blocks.map((block) => [block.id, block]))
    const movedBlocks = new Map(moved.blocks.map((block) => [block.id, block]))
    const originalParcels = new Map(expanded.parcels.map((parcel) => [parcel.id, parcel]))
    const movedParcels = new Map(moved.parcels.map((parcel) => [parcel.id, parcel]))
    for (const parcel of expanded.parcels) {
      const after = movedParcels.get(parcel.id)!
      const block = originalBlocks.get(parcel.blockId)!
      const movedBlock = movedBlocks.get(parcel.blockId)!
      expect(after.x - movedBlock!.x).toBeCloseTo(
        (parcel.x - block!.x) * movedBlock!.width / block!.width, 9)
      expect(after.z - movedBlock!.z).toBeCloseTo(
        (parcel.z - block!.z) * movedBlock!.depth / block!.depth, 9)
      expect(after.width).toBeCloseTo(parcel.width * movedBlock!.width / block!.width, 9)
      expect(after.depth).toBeCloseTo(parcel.depth * movedBlock!.depth / block!.depth, 9)
    }
    for (const building of expanded.buildings) {
      const after = moved.buildings.find((item) => item.id === building.id)!
      const parcel = originalParcels.get(building.parcelId)!
      const movedParcel = movedParcels.get(building.parcelId)!
      const dx = movedParcel!.x - parcel!.x
      const dz = movedParcel!.z - parcel!.z
      expect(after.x - building.x).toBeCloseTo(dx, 9)
      expect(after.z - building.z).toBeCloseTo(dz, 9)
      expect(after.entrance.x - building.entrance.x).toBeCloseTo(dx, 9)
      expect(after.entrance.z - building.entrance.z).toBeCloseTo(dz, 9)
      expect(after.masses).toEqual(building.masses)
      expect(after.windows).toEqual(building.windows)
      for (const mass of after.masses.filter((item) => item.baseY < 2)) {
        expect(Math.abs(after.x + mass.offsetX - movedParcel!.x) + mass.width / 2)
          .toBeLessThanOrEqual(movedParcel!.width / 2 + 1e-6)
        expect(Math.abs(after.z + mass.offsetZ - movedParcel!.z) + mass.depth / 2)
          .toBeLessThanOrEqual(movedParcel!.depth / 2 + 1e-6)
      }
    }
    const shifted = moved.blocks.filter((block) => {
      const original = originalBlocks.get(block.id)!
      return Math.hypot(block.x - original.x, block.z - original.z) > 0.01
    })
    expect(shifted.length).toBeGreaterThan(6)
  })

  it('preserves valid pedestrian derivation after the coordinate change', () => {
    const expanded = expandOriginalCity(generateCity(HERO_SEED))
    const moved = createDevOrganicLayout(expanded)
    const pedestrian = derivePedestrianNetwork(moved, { curbPlacement: 'endpointVector' })
    const nodes = new Set(pedestrian.nodes.map((node) => node.id))
    expect(pedestrian.nodes.length).toBeGreaterThan(0)
    expect(pedestrian.edges.every((edge) => nodes.has(edge.from) && nodes.has(edge.to) &&
      edge.length > 0)).toBe(true)
    expect(pedestrian.anchors.map((anchor) => anchor.id))
      .toEqual(expanded.pedestrian.anchors.map((anchor) => anchor.id))
  })

  it('keeps adjacent blocks separated and building footprints clear of road lanes', () => {
    const expanded = expandOriginalCity(generateCity(HERO_SEED))
    const moved = createDevOrganicLayout(expanded)
    const blocks = new Map(moved.blocks.map((block) =>
      [`${block.column}:${block.row}`, block]))
    const originals = new Map(expanded.blocks.map((block) => [block.id, block]))
    for (const block of moved.blocks) {
      const original = originals.get(block.id)!
      for (const [next, axis] of [
        [blocks.get(`${block.column + 1}:${block.row}`), 'x'],
        [blocks.get(`${block.column}:${block.row + 1}`), 'z'],
      ] as const) {
        if (!next) continue
        const gap = axis === 'x'
          ? next.x - next.width / 2 - block.x - block.width / 2
          : next.z - next.depth / 2 - block.z - block.depth / 2
        expect(gap).toBeGreaterThan(2)
        const nextOriginal = originals.get(next.id)!
        const difference = Math.hypot(
          block.x - original.x - (next.x - nextOriginal.x),
          block.z - original.z - (next.z - nextOriginal.z))
        expect(difference).toBeLessThan(6)
      }
    }
    const roadNodes = new Map(moved.roads.nodes.map((node) => [node.id, node]))
    const roadEdges = new Map(moved.roads.edges.map((edge) => [edge.id, edge]))
    for (const block of moved.blocks) {
      const west = block.x - block.width / 2 - 0.72
      const east = block.x + block.width / 2 + 0.72
      const north = block.z - block.depth / 2 - 0.72
      const south = block.z + block.depth / 2 + 0.72
      for (const [edgeId, side, points] of [
        [`edge-z-${block.column}-${block.row}`, 1,
          [[west, north], [west, south]]],
        [`edge-z-${block.column + 1}-${block.row}`, -1,
          [[east, north], [east, south]]],
        [`edge-x-${block.column}-${block.row}`, 1,
          [[west, north], [east, north]]],
        [`edge-x-${block.column}-${block.row + 1}`, -1,
          [[west, south], [east, south]]],
      ] as const) {
        const edge = roadEdges.get(edgeId)!
        const a = roadNodes.get(edge.from)!
        const b = roadNodes.get(edge.to)!
        const length = Math.hypot(b.x - a.x, b.z - a.z)
        for (const [x, z] of points) {
          const normalDistance = edgeId.startsWith('edge-z')
            ? ((x - a.x) * (b.z - a.z) - (z - a.z) * (b.x - a.x)) / length
            : ((z - a.z) * (b.x - a.x) - (x - a.x) * (b.z - a.z)) / length
          expect(normalDistance * side).toBeGreaterThanOrEqual(edge.width / 2 + 0.249)
        }
      }
    }
    const footprints = moved.buildings.flatMap((building) => building.masses
      .filter((mass) => mass.baseY < 2).map((mass) => ({
        x: building.x + mass.offsetX,
        z: building.z + mass.offsetZ,
        halfX: mass.width / 2,
        halfZ: mass.depth / 2,
      })))
    for (const edge of moved.roads.edges) {
      const a = roadNodes.get(edge.from)!
      const b = roadNodes.get(edge.to)!
      const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) * 2))
      for (let index = 0; index <= steps; index += 1) {
        const t = index / steps
        const x = a.x + (b.x - a.x) * t
        const z = a.z + (b.z - a.z) * t
        for (const footprint of footprints) {
          if (Math.abs(x - footprint.x) > footprint.halfX + edge.width ||
            Math.abs(z - footprint.z) > footprint.halfZ + edge.width) continue
          const gap = Math.hypot(
            Math.max(0, Math.abs(x - footprint.x) - footprint.halfX),
            Math.max(0, Math.abs(z - footprint.z) - footprint.halfZ))
          expect(gap).toBeGreaterThanOrEqual(edge.width / 2 + 0.25)
        }
      }
    }
  })

  it('keeps road furniture at its original curb offset after road displacement', () => {
    const expanded = expandOriginalCity(generateCity(HERO_SEED))
    const moved = createDevOrganicLayout(expanded)
    const originalNodes = new Map(expanded.roads.nodes.map((node) => [node.id, node]))
    const movedNodes = new Map(moved.roads.nodes.map((node) => [node.id, node]))
    const movedFeatures = new Map(moved.streetFeatures.map((feature) => [feature.id, feature]))
    let shiftedFurniture = 0
    for (const feature of expanded.streetFeatures.filter((item) => item.kind === 'lamp')) {
      const edge = expanded.roads.edges.find((road) =>
        feature.id.startsWith(`lamp-${road.id}-`))!
      const offsetFromRoad = (nodes: typeof originalNodes, x: number, z: number) => {
        const a = nodes.get(edge.from)!
        const b = nodes.get(edge.to)!
        return ((x - a.x) * -(b.z - a.z) + (z - a.z) * (b.x - a.x)) /
          Math.hypot(b.x - a.x, b.z - a.z)
      }
      const after = movedFeatures.get(feature.id)!
      expect(offsetFromRoad(movedNodes, after.x, after.z))
        .toBeCloseTo(offsetFromRoad(originalNodes, feature.x, feature.z), 8)
      if (Math.hypot(after.x - feature.x, after.z - feature.z) > 0.1) shiftedFurniture += 1
    }
    expect(shiftedFurniture).toBeGreaterThan(0)
  })

  it('keeps every retained building entrance connected in the integrated dev world', () => {
    const world = generateDevWorld(HERO_SEED)
    const adjacency = new Map(world.navNodes.map((node) => [node.id, [] as string[]]))
    for (const edge of world.navEdges) {
      adjacency.get(edge.fromNodeId)!.push(edge.toNodeId)
      if (edge.direction === 'both') adjacency.get(edge.toNodeId)!.push(edge.fromNodeId)
    }
    const reachable = new Set(['plaza:east-mid'])
    const queue = ['plaza:east-mid']
    for (let index = 0; index < queue.length; index += 1) {
      for (const next of adjacency.get(queue[index]) ?? []) {
        if (reachable.has(next)) continue
        reachable.add(next)
        queue.push(next)
      }
    }
    const unreachable = world.baseCity!.buildings.filter((building) =>
      !reachable.has(`interior:${building.id}:entry`)).map((building) => building.id)
    expect(unreachable).toEqual([])
  })
})
