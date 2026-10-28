import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

/** Static architecture shadows refresh only when the light or scene geometry changes. */
export function ShadowUpdateController({ enabled, revision }: {
  enabled: boolean; revision: string }) {
  const { gl, invalidate } = useThree()
  useEffect(() => {
    if (!enabled) return
    const previous = gl.shadowMap.autoUpdate
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    invalidate()
    return () => {
      gl.shadowMap.autoUpdate = previous
      gl.shadowMap.needsUpdate = true
      invalidate()
    }
  }, [enabled, gl, invalidate])
  useEffect(() => {
    if (!enabled) return
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [enabled, gl, invalidate, revision])
  return null
}
