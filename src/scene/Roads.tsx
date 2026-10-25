import { useMemo } from 'react'
import type { CityModel, RoadNode } from '../city/model'
import { InstancedBoxes, type BoxInstance } from './InstancedBoxes'

function roadBox(from: RoadNode, to: RoadNode, width: number, y: number, thickness: number): BoxInstance {
  const dx = to.x - from.x
  const dz = to.z - from.z
  return {
    position: [(from.x + to.x) / 2, y, (from.z + to.z) / 2],
    scale: [width, thickness, Math.hypot(dx, dz) + 0.12],
    rotationY: Math.atan2(dx, dz),
  }
}

export function Roads({ city }: { city: CityModel }) {
  const geometry = useMemo(() => {
    const roads: BoxInstance[] = []
    const sidewalks: BoxInstance[] = []
    const curbs: BoxInstance[] = []
    const marks: BoxInstance[] = []
    const crosswalks: BoxInstance[] = []
    const nodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
    const nodeWidths = new Map<string, number>()

    city.roads.edges.forEach((edge, edgeIndex) => {
      const from = nodes.get(edge.from)!
      const to = nodes.get(edge.to)!
      roads.push(roadBox(from, to, edge.width, 0.025, 0.08))
      nodeWidths.set(edge.from, Math.max(nodeWidths.get(edge.from) ?? 0, edge.width))
      nodeWidths.set(edge.to, Math.max(nodeWidths.get(edge.to) ?? 0, edge.width))

      if (edge.kind === 'avenue') {
        const length = Math.hypot(to.x - from.x, to.z - from.z)
        const count = Math.max(2, Math.floor(length / 5))
        const directionX = (to.x - from.x) / length
        const directionZ = (to.z - from.z) / length
        const crossingNearPlaza = Math.abs(from.x) < 30 && Math.abs(from.z) < 30
        if (edgeIndex % 5 === 0 && !crossingNearPlaza && length > 17) {
          const crossingDistance = Math.min(7.2, length * 0.28)
          const crossX = from.x + directionX * crossingDistance
          const crossZ = from.z + directionZ * crossingDistance
          const stripeCount = Math.max(5, Math.floor(edge.width / 1.05))
          for (let stripe = 0; stripe < stripeCount; stripe += 1) {
            const across = (stripe - (stripeCount - 1) / 2) * 1.05
            crosswalks.push({
              position: [crossX - directionZ * across, 0.084, crossZ + directionX * across],
              scale: [0.68, 0.012, 1.65],
              rotationY: Math.atan2(to.x - from.x, to.z - from.z),
            })
          }
        }
        for (let index = 0; index < count; index += 1) {
          const t = (index + 0.5) / count
          const x = from.x + (to.x - from.x) * t
          const z = from.z + (to.z - from.z) * t
          marks.push({
            position: [x, 0.077, z],
            scale: [0.13, 0.012, 1.4],
            rotationY: Math.atan2(to.x - from.x, to.z - from.z),
            color: '#a4a88f',
          })
        }
      }
    })

    for (const node of city.roads.nodes) {
      const width = nodeWidths.get(node.id) ?? 4.5
      roads.push({ position: [node.x, 0.029, node.z], scale: [width, 0.09, width] })
    }

    for (const block of city.blocks) {
      sidewalks.push({
        position: [block.x, 0.13, block.z],
        scale: [block.width + 2.25, 0.22, block.depth + 2.25],
        color: block.isPlaza ? '#71818b' : block.isPark ? '#365455' : '#435466',
      })
      curbs.push({
        position: [block.x, 0.08, block.z],
        scale: [block.width + 2.8, 0.15, block.depth + 2.8],
        color: '#687b8b',
      })
      if (block.isPlaza) {
        const insetX = block.width / 2 + 3.2
        const insetZ = block.depth / 2 + 3.2
        for (const sign of [-1, 1]) {
          for (let index = -2; index <= 2; index += 1) {
            crosswalks.push({ position: [block.x + index * 0.85, 0.081, block.z + sign * insetZ], scale: [0.42, 0.012, 2.5] })
            crosswalks.push({ position: [block.x + sign * insetX, 0.081, block.z + index * 0.85], scale: [2.5, 0.012, 0.42] })
          }
        }
      }
    }
    return { roads, sidewalks, curbs, marks, crosswalks }
  }, [city])

  return (
    <>
      <InstancedBoxes items={geometry.roads} color="#2a394b" roughness={0.96} receiveShadow />
      <InstancedBoxes items={geometry.curbs} roughness={0.94} receiveShadow />
      <InstancedBoxes items={geometry.sidewalks} roughness={0.92} receiveShadow />
      <InstancedBoxes items={geometry.marks} roughness={0.95} />
      <InstancedBoxes items={geometry.crosswalks} color="#aab7af" roughness={0.95} />
    </>
  )
}
