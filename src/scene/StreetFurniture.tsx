import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Object3D, type InstancedMesh } from 'three'
import type { CityModel, StreetFeature } from '../city/model'
import { InstancedBoxes, type BoxInstance } from './InstancedBoxes'
import type { DevTerrainV1 } from '../world/terrain/devTerrain'
import { heightAtMm } from '../world/terrain/devTerrain'

type ElevatedStreetFeature = StreetFeature & { elevation?: number }

interface FoliageInstance {
  position: [number, number, number]
  scale: number
  color: string
}

function Foliage({ items }: { items: FoliageInstance[] }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const object = new Object3D()
    const color = new Color()
    items.forEach((item, index) => {
      object.position.set(...item.position)
      object.scale.setScalar(item.scale)
      object.updateMatrix()
      mesh.setMatrixAt(index, object.matrix)
      mesh.setColorAt(index, color.set(item.color))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [items])
  if (!items.length) return null
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#ffffff" roughness={0.96} flatShading />
    </instancedMesh>
  )
}

function placed(feature: ElevatedStreetFeature, x: number, y: number, z: number,
  width: number, height: number, depth: number, color?: string): BoxInstance {
  const cosine = Math.cos(feature.rotationY)
  const sine = Math.sin(feature.rotationY)
  return {
    position: [feature.x + cosine * x + sine * z, y + (feature.elevation ?? 0),
      feature.z - sine * x + cosine * z],
    scale: [width, height, depth],
    rotationY: feature.rotationY,
    color,
  }
}

export function StreetFurniture({ city, terrain, enableLights = true, lightIntensity = 1 }: {
  city: CityModel; terrain?: DevTerrainV1; enableLights?: boolean; lightIntensity?: number }) {
  const geometry = useMemo(() => {
    const poles: BoxInstance[] = []
    const heads: BoxInstance[] = []
    const furnishings: BoxInstance[] = []
    const shelterGlass: BoxInstance[] = []
    const foliage: FoliageInstance[] = []
    const lamps: ElevatedStreetFeature[] = []

    for (const source of city.streetFeatures) {
      const feature: ElevatedStreetFeature = terrain ? { ...source,
        elevation: heightAtMm(terrain, Math.round(source.x * 1000),
          Math.round(source.z * 1000)) / 1000 } : source
      if (feature.kind === 'lamp') {
        lamps.push(feature)
        poles.push(placed(feature, 0, 2.42, 0, 0.12, 4.8, 0.12, '#617684'))
        poles.push(placed(feature, 0.28, 4.81, 0, 0.65, 0.12, 0.12, '#82949c'))
        heads.push(placed(feature, 0.6, 4.75, 0, 0.34, 0.12, 0.22))
      } else if (feature.kind === 'tree') {
        poles.push(placed(feature, 0, 1.1 * feature.scale, 0, 0.22, 2.2 * feature.scale, 0.22, '#46544e'))
        foliage.push({ position: [feature.x, 3.0 * feature.scale + (feature.elevation ?? 0), feature.z], scale: 1.72 * feature.scale, color: '#365b55' })
        foliage.push({ position: [feature.x + 0.22, 3.65 * feature.scale + (feature.elevation ?? 0), feature.z - 0.13], scale: 1.15 * feature.scale, color: '#41645e' })
      } else if (feature.kind === 'bench') {
        furnishings.push(placed(feature, 0, 0.52, 0, 3.1, 0.16, 0.8, '#8d9b9d'))
        furnishings.push(placed(feature, 0, 0.94, -0.33, 3.1, 0.77, 0.13, '#687f89'))
        for (const sign of [-1, 1]) furnishings.push(placed(feature, sign * 1.28, 0.29, 0, 0.17, 0.58, 0.6, '#485d67'))
      } else if (feature.kind === 'planter') {
        furnishings.push(placed(feature, 0, 0.45, 0, 2.5, 0.55, 1.45, '#687d81'))
        foliage.push({ position: [feature.x, 1.24 + (feature.elevation ?? 0), feature.z], scale: 0.82, color: '#3d5c54' })
      } else if (feature.kind === 'busStop') {
        furnishings.push(placed(feature, 0, 4.1, 0, 4.8, 0.22, 2.0, '#7d929d'))
        for (const sign of [-1, 1]) poles.push(placed(feature, sign * 2.1, 2.05, -0.72, 0.14, 4.1, 0.14, '#607681'))
        shelterGlass.push(placed(feature, 0, 2.2, -0.8, 4.3, 3.4, 0.08, '#3b6373'))
        furnishings.push(placed(feature, 0, 0.75, 0.35, 2.5, 0.17, 0.72, '#85999f'))
      }
    }
    return { poles, heads, furnishings, shelterGlass, foliage, lamps }
  }, [city, terrain])

  return (
    <>
      <InstancedBoxes items={geometry.poles} castShadow roughness={0.56} metalness={0.36} />
      <InstancedBoxes items={geometry.heads} color="#f0bf82" emissive="#e8a366" emissiveIntensity={1.65} />
      <InstancedBoxes items={geometry.furnishings} castShadow roughness={0.7} metalness={0.18} />
      <InstancedBoxes items={geometry.shelterGlass} roughness={0.3} metalness={0.47} />
      <Foliage items={geometry.foliage} />
      {enableLights && lightIntensity > 0.01 && geometry.lamps.filter((_, index) => index % 6 === 0).map((feature) => (
        <pointLight key={feature.id} position={[feature.x, 4.8 + (feature.elevation ?? 0), feature.z]} color="#e9a76b" intensity={16 * lightIntensity} distance={17} decay={2} />
      ))}
    </>
  )
}
