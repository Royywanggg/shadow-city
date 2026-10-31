import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, Object3D, type InstancedMesh } from 'three'
import type { DevTerrainV1 } from '../../world/terrain/devTerrain'
import type { CityModel } from '../../city/model'
import { escarpmentZBoundsAtMm, heightAtMm } from '../../world/terrain/devTerrain'
import { DEV_UPPER_ROAD_EDGE_ID } from '../../world/generation/devUpperRoadPlan'
import { InstancedBoxes, type BoxInstance } from '../InstancedBoxes'

export function createEscarpmentFaceGeometry(terrain: DevTerrainV1): BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const lower = new Color('#43545b')
  const middle = new Color('#596b6d')
  const upper = new Color('#7c8983')
  const crest = new Color('#536c60')
  const bands = [[0, lower], [3_000, middle], [6_500, upper],
    [9_000, crest]] as const
  for (const patch of terrain.nonWalkableEscarpment.patches) {
    // The ground sampler, blocked polygon and visible rock all use the same
    // front contour. The continuous terrace is kept clear of through roads.
    for (const front of patch.frontLine) {
      for (const [inward, tone] of bands) {
        const z = front.z - inward
        positions.push(front.x / 1000,
          heightAtMm(terrain, front.x, z) / 1000 + 0.08, z / 1000)
        colors.push(tone.r, tone.g, tone.b)
      }
    }
    const start = positions.length / 3 - patch.frontLine.length * bands.length
    for (let segment = 0; segment < patch.frontLine.length - 1; segment += 1) {
      for (let band = 0; band < bands.length - 1; band += 1) {
        const a = start + segment * bands.length + band
        const b = a + bands.length
        indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

interface LandscapeTree {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly height: number
  readonly color: string
}

function EscarpmentTrees({ terrain, city }: { terrain: DevTerrainV1; city: CityModel }) {
  const canopyRef = useRef<InstancedMesh>(null)
  const trees = useMemo(() => {
    const upperRoad = terrain.roadProfiles.find((profile) =>
      profile.edgeId === DEV_UPPER_ROAD_EDGE_ID)
    return terrain.nonWalkableEscarpment.patches.flatMap((patch, patchIndex) => {
    const minX = patch.frontLine[0].x + 1_800
    const maxX = patch.frontLine.at(-1)!.x - 1_800
    if (minX >= maxX) return []
    const count = Math.max(7, Math.round((maxX - minX) / 3_800))
    return Array.from({ length: count }, (_, index): LandscapeTree => {
      const jitter = Math.sin((patchIndex + 1) * 19 + index * 7.3) * 0.28
      const tx = (index + 0.5 + jitter) / count
      const tz = (Math.sin((patchIndex + 1) * 13 + index * 11.7) + 1) / 2
      const xMm = Math.round(minX + (maxX - minX) * tx)
      const { frontZ } = escarpmentZBoundsAtMm(patch, xMm)
      const zMm = Math.round(frontZ - 4_000 - 2_500 * tz)
      return { x: xMm / 1000, z: zMm / 1000,
        y: heightAtMm(terrain, xMm, zMm) / 1000,
        height: 2.1 + (index % 3) * 0.42,
        color: index % 2 ? '#476359' : '#38564f' }
    }).filter((tree) => {
      const clearPath = !terrain.terraceAccess ||
        [...terrain.terraceAccess.stair, ...terrain.terraceAccess.trail]
          .every((point) => Math.hypot(tree.x * 1000 - point.x,
            tree.z * 1000 - point.z) > 3_500)
      const clearBuildings = city.buildings.every((building) =>
        building.masses.filter((mass) => mass.baseY < 2).every((mass) =>
          Math.abs(tree.x - building.x - mass.offsetX) > mass.width / 2 + 1.8 ||
          Math.abs(tree.z - building.z - mass.offsetZ) > mass.depth / 2 + 1.8))
      const clearRoad = !upperRoad || upperRoad.path.every((point) =>
        Math.hypot(tree.x * 1000 - point.x, tree.z * 1000 - point.z) > 6_000)
      return clearPath && clearBuildings && clearRoad
    })
    })
  }, [terrain, city])
  const trunks: BoxInstance[] = useMemo(() => trees.map((tree) => ({
    position: [tree.x, tree.y + tree.height * 0.34, tree.z],
    scale: [0.22, tree.height * 0.68, 0.22], color: '#46504a',
  })), [trees])
  useLayoutEffect(() => {
    const mesh = canopyRef.current
    if (!mesh) return
    const helper = new Object3D()
    const color = new Color()
    trees.forEach((tree, index) => {
      helper.position.set(tree.x, tree.y + tree.height * 0.88, tree.z)
      helper.rotation.y = index * 1.83
      helper.scale.set(tree.height * 0.37, tree.height * 0.53, tree.height * 0.37)
      helper.updateMatrix()
      mesh.setMatrixAt(index, helper.matrix)
      mesh.setColorAt(index, color.set(tree.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [trees])
  if (!trees.length) return null
  return <>
    <InstancedBoxes items={trunks} castShadow roughness={1} />
    <instancedMesh ref={canopyRef} args={[undefined, undefined, trees.length]} castShadow>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial color="#ffffff" roughness={0.96} flatShading />
    </instancedMesh>
  </>
}

export function TerrainEscarpment({ terrain, city }: { terrain: DevTerrainV1;
  city: CityModel }) {
  const faces = useMemo(() => createEscarpmentFaceGeometry(terrain), [terrain])
  useEffect(() => () => faces.dispose(), [faces])
  if (terrain.nonWalkableEscarpment.patches.length === 0) return null
  return <>
    <mesh geometry={faces} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.98} flatShading side={2} />
    </mesh>
    <EscarpmentTrees terrain={terrain} city={city} />
  </>
}
