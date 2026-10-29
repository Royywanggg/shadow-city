import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, Object3D, type InstancedMesh } from 'three'
import type { DevTerrainV1 } from '../../world/terrain/devTerrain'
import { heightAtMm } from '../../world/terrain/devTerrain'
import { InstancedBoxes, type BoxInstance } from '../InstancedBoxes'

function rockFaces(terrain: DevTerrainV1): BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const lower = new Color('#46565c')
  const upper = new Color('#788280')
  for (const patch of terrain.nonWalkableEscarpment.patches) {
    const polygon = patch.polygonXZ
    for (let side = 0; side < polygon.length; side += 1) {
      const from = polygon[side]
      const to = polygon[(side + 1) % polygon.length]
      const dx = to.x - from.x
      const dz = to.z - from.z
      const length = Math.hypot(dx, dz) || 1
      const nx = -dz / length
      const nz = dx / length
      const segments = Math.max(2, Math.ceil(length / 2_000))
      for (let segment = 0; segment < segments; segment += 1) {
        const a = segment / segments
        const b = (segment + 1) / segments
        const append = (t: number, inward: number, tone: Color) => {
          const x = from.x + dx * t + nx * inward
          const z = from.z + dz * t + nz * inward
          positions.push(x / 1000, heightAtMm(terrain, Math.round(x), Math.round(z)) / 1000 + 0.08,
            z / 1000)
          colors.push(tone.r, tone.g, tone.b)
        }
        const index = positions.length / 3
        append(a, 0, lower)
        append(a, 2_400, upper)
        append(b, 0, lower)
        append(b, 2_400, upper)
        indices.push(index, index + 2, index + 1,
          index + 1, index + 2, index + 3)
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

function EscarpmentTrees({ terrain }: { terrain: DevTerrainV1 }) {
  const canopyRef = useRef<InstancedMesh>(null)
  const trees = useMemo(() => terrain.nonWalkableEscarpment.patches.flatMap((patch, patchIndex) => {
    const xs = patch.polygonXZ.map((point) => point.x)
    const zs = patch.polygonXZ.map((point) => point.z)
    const minX = Math.min(...xs) + 4_600
    const maxX = Math.max(...xs) - 4_600
    const minZ = Math.min(...zs) + 4_600
    const maxZ = Math.max(...zs) - 4_600
    if (minX >= maxX || minZ >= maxZ) return []
    return Array.from({ length: 7 }, (_, index): LandscapeTree => {
      const tx = (Math.sin((patchIndex + 1) * 19 + index * 7.3) + 1) / 2
      const tz = (Math.sin((patchIndex + 1) * 13 + index * 11.7) + 1) / 2
      const xMm = Math.round(minX + (maxX - minX) * tx)
      const zMm = Math.round(minZ + (maxZ - minZ) * tz)
      return { x: xMm / 1000, z: zMm / 1000,
        y: heightAtMm(terrain, xMm, zMm) / 1000,
        height: 2.1 + (index % 3) * 0.42,
        color: index % 2 ? '#476359' : '#38564f' }
    })
  }), [terrain])
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

export function TerrainEscarpment({ terrain }: { terrain: DevTerrainV1 }) {
  const faces = useMemo(() => rockFaces(terrain), [terrain])
  useEffect(() => () => faces.dispose(), [faces])
  if (terrain.nonWalkableEscarpment.patches.length === 0) return null
  return <>
    <mesh geometry={faces} castShadow receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.98} flatShading side={2} />
    </mesh>
    <EscarpmentTrees terrain={terrain} />
  </>
}
