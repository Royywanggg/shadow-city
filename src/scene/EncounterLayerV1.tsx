import { Html, Line } from '@react-three/drei'
import type { SimulationStateV5 } from '../simulation/v5Types'
import type { WorldModelV2 } from '../world/model'

/** God View highlight uses authoritative inspected-Tick positions only. */
export function EncounterLayerV1({ state, world, episodeId, level }: {
  state: SimulationStateV5
  world: WorldModelV2
  episodeId: string | null
  level: 'all' | 'L0' | 'L1' | 'L2'
}) {
  const social = state.social
  if (!social || !episodeId) return null
  const episode = [...social.encounters.active, ...social.encounters.completed]
    .find((item) => item.id === episodeId)
  if (!episode || state.tick < episode.startedTick ||
    episode.endedTick !== null && state.tick > episode.endedTick) return null
  const first = state.citizens.find((citizen) => citizen.id === episode.participantIds[0])
  const second = state.citizens.find((citizen) => citizen.id === episode.participantIds[1])
  if (!first || !second) return null
  const participants = [first, second]
  const surfaces = new Map(world.surfaces.map((surface) => [surface.id, surface]))
  if (level !== 'all' && participants.some((citizen) =>
    surfaces.get(citizen.surfaceId)?.levelId !== level)) return null
  const positions = participants.map((citizen) => [citizen.position.x / 1000,
    citizen.position.y / 1000 + 0.14, citizen.position.z / 1000] as const)
  const gapMm = Math.hypot(first.position.x - second.position.x,
    first.position.y - second.position.y, first.position.z - second.position.z)
  const activeInteraction = social.interactions.some((interaction) =>
    interaction.encounterId === episode.id && interaction.status === 'active' &&
    state.tick >= interaction.startTick && state.tick < interaction.plannedEndTick)
  const currentContact = episode.status === 'active' &&
    episode.lastContactGlobalSecond === state.tick * 6 &&
    gapMm <= 3_200
  const drawLink = activeInteraction || currentContact
  const labelPosition: [number, number, number] = [
    (positions[0][0] + positions[1][0]) / 2,
    Math.max(positions[0][1], positions[1][1]) + 2.3,
    (positions[0][2] + positions[1][2]) / 2,
  ]
  return <group>
    {drawLink && <Line points={[positions[0], positions[1]]} color="#f3bd83" lineWidth={2.5}
      transparent opacity={0.8} depthTest={false} renderOrder={90} />}
    {activeInteraction && <Html position={labelPosition} center style={{ pointerEvents: 'none' }}>
      <div className="v06-encounter-label active">CONVERSATION · T{state.tick}</div>
    </Html>}
    {!drawLink && <Html position={labelPosition} center style={{ pointerEvents: 'none' }}>
      <div className="v06-encounter-label">HISTORICAL ENCOUNTER · NO CURRENT CONTACT</div>
    </Html>}
    {positions.map(([x, y, z], index) => <group key={episode.participantIds[index]}
      position={[x, y, z]} renderOrder={91}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.62, 0.79, 32]} />
        <meshBasicMaterial color={index === 0 ? '#f7c58f' : '#9ce5e1'}
          transparent opacity={0.92} depthTest={false} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.12, 10, 10]} />
        <meshBasicMaterial color={index === 0 ? '#f7c58f' : '#9ce5e1'}
          depthTest={false} />
      </mesh>
    </group>)}
  </group>
}
