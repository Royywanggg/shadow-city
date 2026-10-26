import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import type { PedestrianNetwork } from '../city/model'
import type { CitizenState } from '../simulation/types'

export function SelectedRoute({ agent, graph }: { agent: CitizenState | null; graph: PedestrianNetwork }) {
  const points = useMemo(() => {
    if (!agent || agent.route.length === 0) return []
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
    const origin = nodes.get(agent.route[0].fromNodeId)
    if (!origin) return []
    const result: [number, number, number][] = [[origin.x, origin.surfaceY + 0.16, origin.z]]
    for (const step of agent.route) {
      const node = nodes.get(step.toNodeId)
      if (!node) return []
      result.push([node.x, node.surfaceY + 0.16, node.z])
    }
    return result
  }, [agent?.route, graph])

  if (!agent || points.length < 2) return null
  return <Line points={points} color="#90c8c2" lineWidth={1.3} transparent opacity={0.75} depthTest />
}
