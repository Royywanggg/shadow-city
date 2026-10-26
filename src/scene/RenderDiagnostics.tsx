import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    __shadowCityDiagnostics?: {
      drawCalls: number
      triangles: number
      medianActiveFrameMs: number | null
      p50ActiveFrameMs: number | null
      p95ActiveFrameMs: number | null
      sampledFrames: number
      renderedFrames: number
    }
  }
}

export function RenderDiagnostics() {
  const gl = useThree((state) => state.gl)
  const activeIntervals = useRef<number[]>([])
  const renderedFrames = useRef(0)

  useEffect(() => {
    const previous = gl.info.autoReset
    gl.info.autoReset = false
    return () => { gl.info.autoReset = previous }
  }, [gl])

  useFrame((_, delta) => {
    renderedFrames.current += 1
    gl.info.reset()
    const interval = delta * 1000
    if (interval > 0 && interval < 100) {
      activeIntervals.current.push(interval)
      if (activeIntervals.current.length > 120) activeIntervals.current.shift()
    }
    const sorted = [...activeIntervals.current].sort((a, b) => a - b)
    const percentile = (fraction: number) => sorted.length
      ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]
      : null
    queueMicrotask(() => {
      window.__shadowCityDiagnostics = {
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        medianActiveFrameMs: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
        p50ActiveFrameMs: percentile(0.5),
        p95ActiveFrameMs: percentile(0.95),
        sampledFrames: sorted.length,
        renderedFrames: renderedFrames.current,
      }
    })
  }, -100)
  return null
}
