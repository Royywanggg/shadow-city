import { useLayoutEffect, useMemo, useRef } from 'react'
import { Object3D, type InstancedMesh } from 'three'
import type { Building } from '../../city/model'

interface Vent {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly radius: number
  readonly height: number
}

function roofVents(buildings: readonly Building[]): Vent[] {
  const vents: Vent[] = []
  for (const building of buildings) {
    if (building.kind !== 'commercial' && building.kind !== 'office' &&
      building.kind !== 'civic') continue
    const top = building.masses.at(-1)!
    const count = building.kind === 'commercial' ? 3 : 2
    for (let index = 0; index < count; index += 1) {
      vents.push({
        x: building.x + top.offsetX + top.width * (-0.22 + index * 0.22),
        y: top.baseY + top.height + 0.9,
        z: building.z + top.offsetZ + top.depth * 0.18,
        radius: building.kind === 'civic' ? 0.42 : 0.3,
        height: building.kind === 'commercial' ? 1.35 : 1.05,
      })
    }
  }
  return vents
}

function VentMesh({ vents, cap }: { vents: readonly Vent[]; cap: boolean }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const transform = new Object3D()
    vents.forEach((vent, index) => {
      transform.position.set(vent.x, vent.y + (cap ? vent.height / 2 + 0.08 : 0), vent.z)
      transform.scale.set(vent.radius * (cap ? 2.7 : 2), cap ? 0.16 : vent.height,
        vent.radius * (cap ? 2.7 : 2))
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [cap, vents])
  if (!vents.length) return null
  return <instancedMesh ref={ref} args={[undefined, undefined, vents.length]} castShadow>
    <cylinderGeometry args={[0.5, cap ? 0.5 : 0.58, 1, 12]} />
    <meshStandardMaterial color={cap ? '#354957' : '#82959c'}
      roughness={cap ? 0.69 : 0.57} metalness={cap ? 0.15 : 0.62} />
  </instancedMesh>
}

export function RoofVents({ buildings }: { buildings: readonly Building[] }) {
  const vents = useMemo(() => roofVents(buildings), [buildings])
  return <>
    <VentMesh vents={vents} cap={false} />
    <VentMesh vents={vents} cap />
  </>
}
