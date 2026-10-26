import { hashSeed } from '../rng'
import type { AgentKnowledgeV1, AgentMemoryV1, SocialConfigV1 } from './socialTypes'

/** This token is owner-local. The true referent ID stays in private relationship state. */
export function createRecognitionTokenV1(
  socialSeed: string, ownerAgentId: string, referentAgentId: string,
): string {
  if (!socialSeed || !ownerAgentId || !referentAgentId ||
    ownerAgentId === referentAgentId) throw new Error('Invalid recognition reference')
  const first = hashSeed(`${socialSeed}\u0000recognition-v1\u0000${ownerAgentId}\u0000${referentAgentId}`)
  const second = hashSeed(`${referentAgentId}\u0000${ownerAgentId}\u0000${socialSeed}\u0000recognition-v1`)
  return `person-${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`
}

function validUnit(value: number): boolean { return Number.isFinite(value) && value >= 0 && value <= 1 }

function checkSubjectiveRecord(record: AgentKnowledgeV1 | AgentMemoryV1): void {
  if (!record.id || !record.ownerAgentId ||
    (record.subjectToken !== null && !/^person-[0-9a-f]{16}$/.test(record.subjectToken))) {
    throw new Error('Subjective record requires an owner-local recognition token')
  }
}

/** Bounded, deterministic replacement; no ground truth ID is stored in this record type. */
export function upsertKnowledgeV1(
  records: readonly AgentKnowledgeV1[], record: AgentKnowledgeV1,
  config: SocialConfigV1, tick: number,
): readonly AgentKnowledgeV1[] {
  checkSubjectiveRecord(record)
  if (!validUnit(record.confidence) || !Number.isSafeInteger(record.acquiredTick) ||
    record.acquiredTick > tick || record.acquiredTick < 0 ||
    (record.expiresTick !== null && record.expiresTick < record.acquiredTick)) {
    throw new Error('Invalid subjective knowledge')
  }
  if (records.some((item) => item.ownerAgentId !== record.ownerAgentId)) {
    throw new Error('Knowledge owner mismatch')
  }
  const current = records.filter((item) => item.id !== record.id &&
    (item.expiresTick === null || item.expiresTick > tick))
  if (record.expiresTick === null || record.expiresTick > tick) current.push(record)
  return current.sort((a, b) => b.confidence - a.confidence ||
    b.acquiredTick - a.acquiredTick || a.id.localeCompare(b.id))
    .slice(0, config.knowledgeCapacity)
    .sort((a, b) => a.acquiredTick - b.acquiredTick || a.id.localeCompare(b.id))
}

export function decayMemoriesV1(
  records: readonly AgentMemoryV1[], tick: number, config: SocialConfigV1,
): readonly AgentMemoryV1[] {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error('Invalid memory Tick')
  return records.map((memory) => {
    if (tick < memory.lastUpdatedTick) throw new Error('Cannot replay memory backwards')
    const attenuation = Math.pow(0.5,
      (tick - memory.lastUpdatedTick) / config.memoryHalfLifeTicks)
    return { ...memory, confidence: memory.confidence * attenuation,
      salience: memory.salience * attenuation, lastUpdatedTick: tick }
  }).filter((memory) => memory.confidence >= 0.04 && memory.salience >= 0.04)
}

/** Routine passers-by are deliberately omitted; callers add salient experiences only. */
export function rememberExperienceV1(
  records: readonly AgentMemoryV1[], memory: AgentMemoryV1,
  config: SocialConfigV1, tick: number,
): readonly AgentMemoryV1[] {
  checkSubjectiveRecord(memory)
  if (!validUnit(memory.confidence) || !validUnit(memory.salience) ||
    !memory.observationCode || !Number.isSafeInteger(memory.createdTick) ||
    memory.createdTick < 0 || memory.createdTick > tick ||
    memory.lastUpdatedTick !== memory.createdTick ||
    records.some((item) => item.ownerAgentId !== memory.ownerAgentId)) {
    throw new Error('Invalid subjective memory')
  }
  const current = decayMemoriesV1(records, tick, config).filter((item) => item.id !== memory.id)
  current.push({ ...memory, confidence: memory.confidence * Math.pow(0.5,
    (tick - memory.createdTick) / config.memoryHalfLifeTicks),
  salience: memory.salience * Math.pow(0.5,
    (tick - memory.createdTick) / config.memoryHalfLifeTicks), lastUpdatedTick: tick })
  return current.sort((a, b) => b.salience - a.salience ||
    b.createdTick - a.createdTick || a.id.localeCompare(b.id))
    .slice(0, config.memoryCapacity)
    .sort((a, b) => a.createdTick - b.createdTick || a.id.localeCompare(b.id))
}
