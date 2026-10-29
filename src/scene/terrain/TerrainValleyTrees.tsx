import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'
import type { CityModel } from '../../city/model'
import type { DevTerrainV1 } from '../../world/terrain/devTerrain'
import { channelCenterXAtMm, heightAtMm } from '../../world/terrain/devTerrain'
import { InstancedBoxes, type BoxInstance } from '../InstancedBoxes'

interface ValleyTree {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly height: number
  readonly color: string
}

function overlapsRoad(terrain: DevTerrainV1, xMm: number, zMm: number): boolean {
  for (const profile of terrain.roadProfiles) {
    for (let index = 1; index < profile.path.length; index += 1) {
      const a = profile.path[index - 1]
      const b = profile.path[index]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const t = Math.max(0, Math.min(1,
        ((xMm - a.x) * dx + (zMm - a.z) * dz) / (dx * dx + dz * dz || 1)))
      if (Math.hypot(xMm - a.x - dx * t, zMm - a.z - dz * t) < 7_000) return true
    }
  }
  return false
}

export function TerrainValleyTrees({ terrain, city }: { terrain: DevTerrainV1;
  city: CityModel }) {
  const canopy = useRef<InstancedMesh>(null)
  const trees = useMemo(() => {
    const result: ValleyTree[] = []
    const first = terrain.channel.centerline[0].z + 3_000
    const last = terrain.channel.centerline.at(-1)!.z - 4_000
    for (let z = first; z <= last; z += 2_400) {
      for (const side of [-1, 1]) for (let row = 0; row < 2; row += 1) {
        const variation = Math.sin(z * 0.00073 + side * 19 + row * 11)
        const x = Math.round(channelCenterXAtMm(terrain, z) +
          side * (9_800 + row * 2_000 + variation * 550))
        const displacedZ = Math.round(z + Math.sin(z * 0.0011 + row * 5) * 650)
        if (overlapsRoad(terrain, x, displacedZ)) continue
        const height = 2.4 + (variation + 1) * 0.65
        result.push({ x: x / 1000, z: displacedZ / 1000,
          y: heightAtMm(terrain, x, displacedZ) / 1000,
          height, color: row === 0 ? '#446b58' : '#3e6052' })
      }
    }
    const open = new Set(terrain.openChannelBlockIds)
    for (const block of city.blocks.filter((item) => open.has(item.id))) {
      for (let row = 0; row < 5; row += 1) for (let column = 0; column < 5; column += 1) {
        const variation = Math.sin((row + 1) * 17.3 + (column + 1) * 43.7 +
          block.x * 0.23 + block.z * 0.37)
        const x = Math.round((block.x + (column - 2) * block.width / 5 +
          variation * 0.55) * 1000)
        const z = Math.round((block.z + (row - 2) * block.depth / 5 +
          Math.cos(variation * 11) * 0.55) * 1000)
        const riverDistance = Math.abs(x - channelCenterXAtMm(terrain, z))
        if (riverDistance < 6_000 || riverDistance > 16_000 ||
          overlapsRoad(terrain, x, z)) continue
        const height = 2.5 + (variation + 1) * 0.85
        result.push({ x: x / 1000, z: z / 1000,
          y: heightAtMm(terrain, x, z) / 1000, height,
          color: variation > 0 ? '#496c57' : '#3d604f' })
      }
    }
    return result
  }, [terrain, city])
  const trunks: BoxInstance[] = useMemo(() => trees.map((tree) => ({
    position: [tree.x, tree.y + tree.height * 0.35, tree.z],
    scale: [0.18, tree.height * 0.7, 0.18], color: '#4d5d50',
  })), [trees])
  useLayoutEffect(() => {
    const mesh = canopy.current
    if (!mesh) return
    const helper = new Object3D()
    const color = new Color()
    trees.forEach((tree, index) => {
      helper.position.set(tree.x, tree.y + tree.height * 0.87, tree.z)
      helper.scale.set(tree.height * 0.32, tree.height * 0.48, tree.height * 0.32)
      helper.rotation.y = index * 1.72
      helper.updateMatrix()
      mesh.setMatrixAt(index, helper.matrix)
      mesh.setColorAt(index, color.set(tree.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [trees])
  if (trees.length === 0) return null
  return <>
    <InstancedBoxes items={trunks} castShadow roughness={1} />
    <instancedMesh ref={canopy} args={[undefined, undefined, trees.length]} castShadow>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color="#ffffff" roughness={0.96} flatShading />
    </instancedMesh>
  </>
}
