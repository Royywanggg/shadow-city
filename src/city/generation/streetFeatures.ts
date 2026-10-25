import type { CityBlock, RoadNetwork, StreetFeature } from '../model'
import { between, createRandom } from './random'

export function generateStreetFeatures(
  seed: string,
  roads: RoadNetwork,
  blocks: CityBlock[],
  plaza: CityBlock,
): StreetFeature[] {
  const random = createRandom(`${seed}-street-features`)
  const features: StreetFeature[] = []
  const nodes = new Map(roads.nodes.map((node) => [node.id, node]))

  roads.edges.forEach((edge, index) => {
    if (edge.kind !== 'avenue') return
    const from = nodes.get(edge.from)!
    const to = nodes.get(edge.to)!
    const dx = to.x - from.x
    const dz = to.z - from.z
    const length = Math.hypot(dx, dz)
    const nx = -dz / length
    const nz = dx / length
    const side = index % 2 === 0 ? 1 : -1
    if (index % 3 === 0) {
      for (const [lampIndex, t] of [0.28, 0.72].entries()) {
        const offset = side * (edge.width / 2 + 0.68)
        features.push({
          id: `lamp-${edge.id}-${lampIndex}`,
          kind: 'lamp',
          x: from.x + dx * t + nx * offset,
          z: from.z + dz * t + nz * offset,
          rotationY: Math.atan2(dx, dz),
          scale: 1,
        })
      }
    }
    if (edge.id === 'edge-x-3-3' || edge.id === 'edge-z-4-3') {
      features.push({
        id: `bus-stop-${edge.id}`,
        kind: 'busStop',
        x: (from.x + to.x) / 2 + nx * side * (edge.width / 2 + 1.1),
        z: (from.z + to.z) / 2 + nz * side * (edge.width / 2 + 1.1),
        rotationY: Math.atan2(dx, dz),
        scale: 1,
      })
    }
  })

  for (const block of blocks.filter((candidate) => candidate.isPark)) {
    for (const signX of [-1, 1]) {
      for (const signZ of [-1, 1]) {
        features.push({
          id: `tree-${block.id}-${signX}-${signZ}`,
          kind: 'tree',
          x: block.x + signX * block.width * 0.31,
          z: block.z + signZ * block.depth * 0.31,
          rotationY: 0,
          scale: between(random, 0.85, 1.15),
        })
      }
    }
  }

  for (const sign of [-1, 1]) {
    features.push({
      id: `plaza-bench-${sign}`,
      kind: 'bench',
      x: plaza.x + sign * plaza.width * 0.21,
      z: plaza.z + plaza.depth * 0.34,
      rotationY: 0,
      scale: 1,
    })
    features.push({
      id: `plaza-planter-${sign}`,
      kind: 'planter',
      x: plaza.x + sign * plaza.width * 0.4,
      z: plaza.z - plaza.depth * 0.1,
      rotationY: 0,
      scale: 1,
    })
  }

  return features
}
