import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, DynamicDrawUsage, Object3D, type InstancedMesh } from 'three'
import type { Incident, ObservationRecord } from '../simulation/v3Types'

export type IncidentLayerView =
  | { readonly mode: 'groundTruth'; readonly tick: number; readonly incidents: readonly Incident[]; readonly reports?: never }
  | { readonly mode: 'observed'; readonly tick: number; readonly reports: readonly ObservationRecord[]; readonly incidents?: never }
  | { readonly mode: 'comparison'; readonly tick: number; readonly incidents: readonly Incident[]; readonly reports: readonly ObservationRecord[] }

export function visibleIncidentMarkers(view: IncidentLayerView): {
  readonly incidents: readonly Incident[]
  readonly reports: readonly ObservationRecord[]
} {
  return {
    // The observer branch deliberately ignores even an unexpected runtime truth field.
    incidents: view.mode === 'observed' ? [] :
      view.incidents.filter((incident) => incident.occurrenceTick <= view.tick),
    reports: view.mode === 'groundTruth' ? [] :
      view.reports.filter((report) => report.availableTick <= view.tick),
  }
}

const TRUTH_MINOR = new Color('#d47770')
const TRUTH_SERIOUS = new Color('#ed8d7d')
const TRUTH_NEW = new Color('#ffb2a0')
const REPORT_OLD = new Color('#70c8cf')
const REPORT_NEW = new Color('#a8eceb')

function ageScale(age: number): number {
  if (age === 0) return 1.28
  if (age === 1) return 1.16
  return 1
}

/** Marker geometry reads authoritative facts; no render frame changes simulation state. */
export function IncidentLayer({ view }: { readonly view: IncidentLayerView }) {
  const truthRef = useRef<InstancedMesh>(null)
  const reportsRef = useRef<InstancedMesh>(null)
  const object = useMemo(() => new Object3D(), [])
  const { invalidate } = useThree()

  // Only the researcher modes can carry truth records into this component.
  const markers = useMemo(() => visibleIncidentMarkers(view), [view])
  const { incidents, reports } = markers

  useLayoutEffect(() => {
    const truth = truthRef.current
    if (truth) {
      truth.instanceMatrix.setUsage(DynamicDrawUsage)
      incidents.forEach((incident, index) => {
        const age = Math.max(0, view.tick - incident.occurrenceTick)
        object.position.set(incident.position.x, incident.position.y + 1.25, incident.position.z)
        object.rotation.set(0, 0, 0)
        object.scale.setScalar((incident.severity === 'serious' ? 1.17 : 1) * ageScale(age))
        object.updateMatrix()
        truth.setMatrixAt(index, object.matrix)
        truth.setColorAt(index, age <= 1 ? TRUTH_NEW :
          incident.severity === 'serious' ? TRUTH_SERIOUS : TRUTH_MINOR)
      })
      truth.instanceMatrix.needsUpdate = true
      if (truth.instanceColor) truth.instanceColor.needsUpdate = true
    }

    const reportMesh = reportsRef.current
    if (reportMesh) {
      reportMesh.instanceMatrix.setUsage(DynamicDrawUsage)
      reports.forEach((report, index) => {
        const age = Math.max(0, view.tick - report.availableTick)
        object.position.set(report.reportedPosition.x, report.reportedPosition.y + 1.05, report.reportedPosition.z)
        object.rotation.set(-Math.PI / 2, 0, 0)
        object.scale.setScalar(ageScale(age))
        object.updateMatrix()
        reportMesh.setMatrixAt(index, object.matrix)
        reportMesh.setColorAt(index, age <= 1 ? REPORT_NEW : REPORT_OLD)
      })
      reportMesh.instanceMatrix.needsUpdate = true
      if (reportMesh.instanceColor) reportMesh.instanceColor.needsUpdate = true
    }
    invalidate()
  }, [incidents, reports, view.tick, object, invalidate])

  return (
    <group>
      {incidents.length > 0 && (
        <instancedMesh ref={truthRef} args={[undefined, undefined, incidents.length]} frustumCulled={false} renderOrder={20}>
          <octahedronGeometry args={[1.3, 0]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} depthTest={false} depthWrite={false} />
        </instancedMesh>
      )}
      {reports.length > 0 && (
        <instancedMesh ref={reportsRef} args={[undefined, undefined, reports.length]} frustumCulled={false} renderOrder={21}>
          <torusGeometry args={[1.8, 0.2, 4, 14]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} depthTest={false} depthWrite={false} />
        </instancedMesh>
      )}
    </group>
  )
}
