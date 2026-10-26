import { hashSeed } from '../rng'
import type { SocialProfileV1 } from './socialTypes'

function sample(seed: string, agentId: string, trait: string): number {
  return hashSeed(`${seed}\u0000social-profile-v1\u0000${agentId}\u0000${trait}`) / 4294967296
}

/** Social traits use their own seed domain, independent of appearance and offending. */
export function createSocialProfileV1(agentId: string, socialSeed: string): SocialProfileV1 {
  if (!agentId || !socialSeed) throw new Error('Social profile needs an agent ID and social seed')
  return {
    agentId,
    sociability: 0.2 + 0.75 * sample(socialSeed, agentId, 'sociability'),
    attention: 0.25 + 0.7 * sample(socialSeed, agentId, 'attention'),
    recognitionAcuity: 0.3 + 0.65 * sample(socialSeed, agentId, 'recognition'),
    interactionPatience: 0.2 + 0.75 * sample(socialSeed, agentId, 'patience'),
  }
}

export function createSocialProfilesV1(agentIds: readonly string[], socialSeed: string): readonly SocialProfileV1[] {
  if (new Set(agentIds).size !== agentIds.length) throw new Error('Duplicate social profile agent ID')
  return [...agentIds].sort().map((id) => createSocialProfileV1(id, socialSeed))
}
