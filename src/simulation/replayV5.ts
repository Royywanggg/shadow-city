import type { WorldModelV2 } from '../world/model'
import type { AccessCommandV5, SimulationConfigV5, SimulationStateV5 } from './v5Types'
import { advanceStateV5, createEnvironmentV5, createInitialStateV5, worldFingerprintV5 } from './engineV5'
import { createNavigationIndexV2 } from '../world/navigation/routeV2'

export interface ReplayRecordV5 {
  readonly fingerprint: string
  readonly config: SimulationConfigV5
  readonly commands: readonly AccessCommandV5[]
  readonly targetTick: number
}

/** A legacy state cannot be silently interpreted as a multi-level experiment. */
export function replayV5(world: WorldModelV2, record: ReplayRecordV5,
  checkpoint?: SimulationStateV5): SimulationStateV5 {
  const fingerprint = worldFingerprintV5(world, record.config, record.commands)
  if (fingerprint !== record.fingerprint || !Number.isSafeInteger(record.targetTick) ||
    record.targetTick < 0 || record.targetTick > 50_000) {
    throw new Error('V5 replay fingerprint or tick mismatch')
  }
  const environment = createEnvironmentV5(world, record.config, record.commands)
  const index = createNavigationIndexV2(world)
  let state = checkpoint ?? createInitialStateV5(environment, record.commands)
  if (state.fingerprint !== fingerprint || state.tick > record.targetTick) {
    throw new Error('V5 checkpoint fingerprint or tick mismatch')
  }
  while (state.tick < record.targetTick) state = advanceStateV5(state, environment, index)
  return state
}
