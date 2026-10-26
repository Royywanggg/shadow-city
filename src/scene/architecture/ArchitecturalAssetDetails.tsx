import { useLoader } from '@react-three/fiber'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, type InstancedMesh, type Mesh, type MeshStandardMaterial } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { Building } from '../../city/model'

const ASSET_ROOT = '/architecture/kenney-commercial-v21/'

interface AssetPlacement {
  readonly position: readonly [number, number, number]
  readonly scale: readonly [number, number, number]
}

function ModelInstances({ file, placements, tint }: {
  file: string
  placements: readonly AssetPlacement[]
  tint: string
}) {
  const gltf = useLoader(GLTFLoader, `${ASSET_ROOT}${file}`)
  const mesh = useMemo(() => gltf.scene.getObjectByProperty('isMesh', true) as Mesh | undefined,
    [gltf])
  const material = useMemo(() => {
    if (!mesh) return null
    const source = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const result = (source as MeshStandardMaterial).clone()
    result.color.set(tint)
    result.roughness = 0.72
    result.metalness = 0.08
    return result
  }, [mesh, tint])
  const ref = useRef<InstancedMesh>(null)

  useEffect(() => () => material?.dispose(), [material])

  useLayoutEffect(() => {
    const instance = ref.current
    if (!instance) return
    const transform = new Object3D()
    placements.forEach((placement, index) => {
      transform.position.set(...placement.position)
      transform.scale.set(...placement.scale)
      transform.updateMatrix()
      instance.setMatrixAt(index, transform.matrix)
    })
    instance.instanceMatrix.needsUpdate = true
    instance.computeBoundingSphere()
  }, [placements])

  if (!mesh || !material || placements.length === 0) return null
  return <instancedMesh ref={ref} args={[mesh.geometry, material, placements.length]}
    castShadow receiveShadow />
}

function assetPlacements(buildings: readonly Building[]) {
  const awnings: AssetPlacement[] = []
  const overhangs: AssetPlacement[] = []
  for (const building of buildings) {
    const first = building.masses[0]
    const front = building.z + first.offsetZ + first.depth / 2
    if (building.kind === 'commercial' || building.kind === 'corner' || building.kind === 'tower') {
      const width = Math.min(4.6, Math.max(2.4, first.width * 0.31))
      awnings.push({ position: [building.entrance.x, 3.55, front + 0.015],
        scale: [width / 0.8, 1.45, 2.0] })
    }
    if (building.kind === 'office' || building.kind === 'tower' || building.kind === 'apartment') {
      const top = building.masses[building.masses.length - 1]
      const width = Math.min(7.5, Math.max(3.4, top.width * 0.54))
      overhangs.push({ position: [building.x + top.offsetX,
        top.baseY + top.height - 0.10, building.z + top.offsetZ + top.depth / 2 + 0.02],
      scale: [width, 0.95, 1.6] })
    }
  }
  return { awnings, overhangs }
}

/** Small, shared glTF facade modules sit on top of CityModel-authoritative massing. */
export function ArchitecturalAssetDetails({ buildings }: { buildings: readonly Building[] }) {
  const placements = useMemo(() => assetPlacements(buildings), [buildings])
  return <Suspense fallback={null}>
    {placements.awnings.length > 0 && <ModelInstances file="detail-awning-wide.glb"
      placements={placements.awnings} tint="#7896a0" />}
    {placements.overhangs.length > 0 && <ModelInstances file="detail-overhang-wide.glb"
      placements={placements.overhangs} tint="#8899a0" />}
  </Suspense>
}
