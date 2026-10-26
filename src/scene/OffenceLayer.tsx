import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, DynamicDrawUsage, Object3D, type InstancedMesh } from 'three'
import type { WorldPosition } from '../simulation/types'

export interface GroundOffenceMarker {
  readonly id: string
  readonly occurrenceTick: number
  readonly position: Readonly<WorldPosition>
  readonly severity: 'minor' | 'serious'
}

export interface AvailableOffenceReportMarker {
  readonly reportId: string
  readonly availableTick: number
  readonly reportedPosition: Readonly<WorldPosition>
}

export type OffenceLayerView =
  | { readonly mode: 'groundTruth'; readonly tick: number; readonly incidents: readonly GroundOffenceMarker[]; readonly reports?: never }
  | { readonly mode: 'observed'; readonly tick: number; readonly reports: readonly AvailableOffenceReportMarker[]; readonly incidents?: never }
  | { readonly mode: 'comparison'; readonly tick: number; readonly incidents: readonly GroundOffenceMarker[]; readonly reports: readonly AvailableOffenceReportMarker[] }

/** The public branch never forwards truth markers, even if a caller attaches them at runtime. */
export function visibleOffenceMarkers(view: OffenceLayerView): {
  readonly incidents: readonly GroundOffenceMarker[]
  readonly reports: readonly AvailableOffenceReportMarker[]
} {
  return {
    incidents: view.mode === 'observed' ? [] :
      view.incidents.filter((incident) => incident.occurrenceTick <= view.tick),
    reports: view.mode === 'groundTruth' ? [] :
      view.reports.filter((report) => report.availableTick <= view.tick),
  }
}

const TRUTH_MINOR = new Color('#c97a74')
const TRUTH_SERIOUS = new Color('#e69a85')
const TRUTH_NEW = new Color('#f2b5a3')
const REPORT_OLD = new Color('#72bdc5')
const REPORT_NEW = new Color('#a4e3e0')

function ageScale(age: number): number {
  return age === 0 ? 1.25 : age === 1 ? 1.12 : 1
}

/** All four glyph parts use scene depth and share the reported ground position. */
export function OffenceLayer({ view }: { readonly view: OffenceLayerView }) {
  const truthHeadRef = useRef<InstancedMesh>(null)
  const truthStemRef = useRef<InstancedMesh>(null)
  const truthAnchorRef = useRef<InstancedMesh>(null)
  const reportRingRef = useRef<InstancedMesh>(null)
  const object = useMemo(() => new Object3D(), [])
  const { invalidate } = useThree()
  const { incidents, reports } = useMemo(() => visibleOffenceMarkers(view), [view])

  useLayoutEffect(() => {
    const head = truthHeadRef.current
    const stem = truthStemRef.current
    const anchor = truthAnchorRef.current
    if (head && stem && anchor) {
      for (const mesh of [head, stem, anchor]) mesh.instanceMatrix.setUsage(DynamicDrawUsage)
      incidents.forEach((incident, index) => {
        const age = Math.max(0, view.tick - incident.occurrenceTick)
        const scale = (incident.severity === 'serious' ? 1.2 : 1) * ageScale(age)
        const color = age <= 1 ? TRUTH_NEW : incident.severity === 'serious' ? TRUTH_SERIOUS : TRUTH_MINOR
        object.rotation.set(0, 0, 0)
        object.position.set(incident.position.x, incident.position.y + 2.25, incident.position.z)
        object.scale.setScalar(scale)
        object.updateMatrix()
        head.setMatrixAt(index, object.matrix)
        head.setColorAt(index, color)

        object.position.set(incident.position.x, incident.position.y + 1.12, incident.position.z)
        object.scale.set(1, 1, 1)
        object.updateMatrix()
        stem.setMatrixAt(index, object.matrix)
        stem.setColorAt(index, color)

        object.position.set(incident.position.x, incident.position.y + 0.12, incident.position.z)
        object.rotation.set(-Math.PI / 2, 0, 0)
        object.scale.setScalar(scale)
        object.updateMatrix()
        anchor.setMatrixAt(index, object.matrix)
        anchor.setColorAt(index, color)
      })
      for (const mesh of [head, stem, anchor]) {
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }
    }

    const ring = reportRingRef.current
    if (ring) {
      ring.instanceMatrix.setUsage(DynamicDrawUsage)
      reports.forEach((report, index) => {
        const age = Math.max(0, view.tick - report.availableTick)
        object.position.set(report.reportedPosition.x, report.reportedPosition.y + 0.21, report.reportedPosition.z)
        object.rotation.set(-Math.PI / 2, 0, 0)
        object.scale.setScalar(ageScale(age))
        object.updateMatrix()
        ring.setMatrixAt(index, object.matrix)
        ring.setColorAt(index, age <= 1 ? REPORT_NEW : REPORT_OLD)
      })
      ring.instanceMatrix.needsUpdate = true
      if (ring.instanceColor) ring.instanceColor.needsUpdate = true
    }
    invalidate()
  }, [incidents, reports, view.tick, object, invalidate])

  return (
    <group>
      {incidents.length > 0 && (
        <>
          <instancedMesh ref={truthHeadRef} args={[undefined, undefined, incidents.length]} frustumCulled={false}>
            <octahedronGeometry args={[0.7, 0]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} depthTest depthWrite={false} />
          </instancedMesh>
          <instancedMesh ref={truthStemRef} args={[undefined, undefined, incidents.length]} frustumCulled={false}>
            <cylinderGeometry args={[0.07, 0.07, 2, 4]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} depthTest depthWrite={false} />
          </instancedMesh>
          <instancedMesh ref={truthAnchorRef} args={[undefined, undefined, incidents.length]} frustumCulled={false}>
            <torusGeometry args={[0.95, 0.1, 4, 12]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} depthTest depthWrite={false} />
          </instancedMesh>
        </>
      )}
      {reports.length > 0 && (
        <instancedMesh ref={reportRingRef} args={[undefined, undefined, reports.length]} frustumCulled={false}>
          <torusGeometry args={[1.4, 0.17, 4, 14]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} depthTest depthWrite={false} />
        </instancedMesh>
      )}
    </group>
  )
}
