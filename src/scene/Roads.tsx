import { useMemo } from 'react'
import type { CityModel, RoadNode } from '../city/model'
import { InstancedBoxes, type BoxInstance } from './InstancedBoxes'
import { surfaceTextures } from './SurfaceTextures'

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
  const surfaces = surfaceTextures()
  const geometry = useMemo(() => {
    const roads: BoxInstance[] = []
    const sidewalks: BoxInstance[] = []
    const curbs: BoxInstance[] = []
    const marks: BoxInstance[] = []
    const crosswalks: BoxInstance[] = []
    const nodes = new Map(city.roads.nodes.map((node) => [node.id, node]))
    const nodeWidths = new Map<string, number>()
    const roadEdges = new Map(city.roads.edges.map((edge) => [edge.id, edge]))

    city.roads.edges.forEach((edge) => {
      const from = nodes.get(edge.from)!
      const to = nodes.get(edge.to)!
      roads.push(roadBox(from, to, edge.width, 0.025, 0.08))
      nodeWidths.set(edge.from, Math.max(nodeWidths.get(edge.from) ?? 0, edge.width))
      nodeWidths.set(edge.to, Math.max(nodeWidths.get(edge.to) ?? 0, edge.width))

      if (edge.kind === 'avenue') {
        const length = Math.hypot(to.x - from.x, to.z - from.z)
        const count = Math.max(2, Math.floor(length / 5))
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
    }

    const pedestrianNodes = new Map(city.pedestrian.nodes.map((node) => [node.id, node]))
    for (const crossing of city.pedestrian.edges.filter((edge) => edge.kind === 'crossing')) {
      const from = pedestrianNodes.get(crossing.from)!
      const to = pedestrianNodes.get(crossing.to)!
      const road = roadEdges.get(crossing.sourceRoadEdgeId!)!
      const acrossX = Math.abs(to.x - from.x) > Math.abs(to.z - from.z)
      const count = road.kind === 'avenue' ? 6 : 3
      const span = Math.max(1, crossing.length - 0.75)
      const stripeWidth = Math.min(0.48, span / count * 0.56)
      const stripeLength = road.kind === 'avenue' ? 2.05 : 1.35
      for (let index = 0; index < count; index += 1) {
        const along = -span / 2 + (index + 0.5) * span / count
        crosswalks.push({
          position: [(from.x + to.x) / 2 + (acrossX ? along : 0), 0.086,
            (from.z + to.z) / 2 + (acrossX ? 0 : along)],
          scale: acrossX ? [stripeWidth, 0.012, stripeLength] : [stripeLength, 0.012, stripeWidth],
          color: road.kind === 'avenue' ? '#aab7af' : '#748c90',
        })
      }
    }
    return { roads, sidewalks, curbs, marks, crosswalks }
  }, [city])

  return (
    <>
      <InstancedBoxes items={geometry.roads} color="#344859" roughness={1} receiveShadow
        map={surfaces.asphalt.color} normalMap={surfaces.asphalt.normal}
        roughnessMap={surfaces.asphalt.roughness} textureWorldScale={5} />
      <InstancedBoxes items={geometry.curbs} roughness={1} receiveShadow
        map={surfaces.paving.color} normalMap={surfaces.paving.normal}
        roughnessMap={surfaces.paving.roughness} textureWorldScale={8} />
      <InstancedBoxes items={geometry.sidewalks} roughness={1} receiveShadow
        map={surfaces.paving.color} normalMap={surfaces.paving.normal}
        roughnessMap={surfaces.paving.roughness} textureWorldScale={8} />
      <InstancedBoxes items={geometry.marks} roughness={0.95} />
      <InstancedBoxes items={geometry.crosswalks} color="#aab7af" roughness={0.95} />
    </>
  )
}
