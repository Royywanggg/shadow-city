import { MapControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import type { MapControls as MapControlsType } from 'three-stdlib'

export function CameraRig({ resetToken }: { resetToken: number }) {
  const { camera, size, invalidate } = useThree()
  const controlsRef = useRef<MapControlsType>(null)
  const previousBaseZoom = useRef(0)
  const previousResetToken = useRef(resetToken)
  const baseZoom = Math.min(size.width / 325, size.height / 235)

  useLayoutEffect(() => {
    const oldBase = previousBaseZoom.current
    const relativeZoom = oldBase > 0 ? camera.zoom / oldBase : 1
    camera.zoom = baseZoom * relativeZoom
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    previousBaseZoom.current = baseZoom
    invalidate()
  }, [baseZoom, camera, invalidate])

  useLayoutEffect(() => {
    if (previousResetToken.current === resetToken) return
    previousResetToken.current = resetToken
    const controls = controlsRef.current
    if (!controls) return
    controls.target.set(0, 0, 0)
    camera.position.set(188, 168, 188)
    camera.zoom = baseZoom
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    controls.update()
    invalidate()
  }, [baseZoom, camera, invalidate, resetToken])

  const keepCityInView = () => {
    const controls = controlsRef.current
    if (!controls) return
    const x = Math.max(-66, Math.min(66, controls.target.x))
    const z = Math.max(-66, Math.min(66, controls.target.z))
    const dx = x - controls.target.x
    const dz = z - controls.target.z
    if (dx === 0 && dz === 0) return
    controls.target.set(x, 0, z)
    camera.position.x += dx
    camera.position.z += dz
    camera.updateMatrixWorld()
    invalidate()
  }

  return (
    <MapControls
      ref={controlsRef}
      makeDefault
      enableRotate={false}
      enableDamping
      dampingFactor={0.085}
      screenSpacePanning={false}
      minZoom={baseZoom * 0.72}
      maxZoom={baseZoom * 2.8}
      onChange={keepCityInView}
    />
  )
}
