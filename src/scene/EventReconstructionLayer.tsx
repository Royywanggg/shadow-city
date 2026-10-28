import { Line } from '@react-three/drei'
import { DoubleSide } from 'three'
import type { ExplorerEventV1 } from '../simulation/events/eventIndex'
import type { SimulationStateV5 } from '../simulation/v5Types'
import type { SimulationSessionV5 } from '../simulation/sessionV5'

export function SceneSelectionMarkers({ state, level, visible, onSelect }: {
  state: SimulationStateV5
  level: 'all' | 'L0' | 'L1'
  visible: boolean
  onSelect: (sceneId: string) => void
}) {
  if (!visible) return null
  return <>{state.scene?.entities.filter((item) => item.status === 'present' &&
    (level === 'all' || item.anchor.levelId === level)).map((scene) =>
    <mesh key={scene.id} position={[
      scene.anchor.position.x / 1000, scene.anchor.position.y / 1000 + 0.11,
      scene.anchor.position.z / 1000,
    ]} rotation={[-Math.PI / 2, 0, 0]} onClick={(event) => {
      event.stopPropagation()
      onSelect(scene.id)
    }}>
      <ringGeometry args={[0.35, 0.57, 20]} />
      <meshBasicMaterial color="#8ac7cd" depthTest side={DoubleSide} />
    </mesh>)}</>
}

export function EventReconstructionLayer({ session, state, selected, level,
  traces }: {
  session: SimulationSessionV5
  state: SimulationStateV5
  selected: ExplorerEventV1 | null
  level: 'all' | 'L0' | 'L1'
  traces: ReturnType<SimulationSessionV5['reconstructWindow']> | null
}) {
  if (!selected) return null
  const visible = selected.tick <= state.tick &&
    (level === 'all' || level === selected.levelId)
  const discoveries = selected.sceneId ?
    state.scene?.discoveries.filter((item) => item.sceneId === selected.sceneId) ?? [] : []
  return <>
    {visible && <mesh position={[
      selected.position.x / 1000, selected.position.y / 1000 + 0.07,
      selected.position.z / 1000,
    ]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.72, 0.98, 32]} />
      <meshBasicMaterial color="#f2ca8b" depthTest />
    </mesh>}
    {visible && <mesh position={[
      selected.position.x / 1000, selected.position.y / 1000 + 0.75,
      selected.position.z / 1000,
    ]}>
      <sphereGeometry args={[0.2, 12, 12]} />
      <meshBasicMaterial color="#f2ca8b" depthTest />
    </mesh>}
    {discoveries.map((item) => <mesh key={item.id} position={[
      item.observerPosition.x / 1000, item.observerPosition.y / 1000 + 0.28,
      item.observerPosition.z / 1000,
    ]}>
      <sphereGeometry args={[0.21, 9, 9]} />
      <meshBasicMaterial color="#8ed1c9" depthTest />
    </mesh>)}
    {traces && [...traces.entries()].map(([agentId, samples], index) => {
      const points = samples.filter((item) => item.tick <= state.tick &&
        (level === 'all' || session.getWorld().surfaces.find((surface) =>
          surface.id === item.surfaceId)?.levelId === level))
        .map((item) => [item.position.x / 1000,
          item.position.y / 1000 + 0.17, item.position.z / 1000] as
          [number, number, number])
      return points.length > 1 ? <Line key={agentId} points={points}
        color={index === 0 ? '#e7b778' : '#83d2d2'} lineWidth={2.5}
        transparent opacity={0.85} /> : null
    })}
  </>
}
