// The algorithm and its uint32 state are versioned with the simulation format.
export function hashSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export interface RandomSample {
  readonly state: number
  readonly value: number
}

export function nextRandom(previousState: number): RandomSample {
  const state = (previousState + 0x6d2b79f5) >>> 0
  let value = state
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return { state, value: ((value ^ (value >>> 14)) >>> 0) / 4294967296 }
}

export function createRandomStream(seed: string, streamName: string): number {
  return hashSeed(`${seed}\u0000${streamName}`)
}
