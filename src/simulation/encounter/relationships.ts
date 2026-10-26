import type { DirectedRelationshipV1, RelationshipCategoryV1, SocialConfigV1 } from './socialTypes'

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)) }

export type RelationshipExperienceV1 = 'noticed' | 'greeting' | 'conversation' |
  'helped' | 'disagreement'

/** Passive sightings cannot by themselves produce a familiar relationship. */
export function updateDirectedRelationshipV1(
  previous: DirectedRelationshipV1 | null,
  ownerAgentId: string,
  referentAgentId: string,
  subjectToken: string,
  tick: number,
  experience: RelationshipExperienceV1,
  config: SocialConfigV1,
  interpretation: number = 0.5,
): DirectedRelationshipV1 {
  if (!ownerAgentId || !referentAgentId || ownerAgentId === referentAgentId ||
    !subjectToken || !Number.isSafeInteger(tick) || tick < 0 ||
    !Number.isFinite(interpretation) || interpretation < 0 || interpretation > 1 ||
    (previous !== null && (previous.ownerAgentId !== ownerAgentId ||
      previous.referentAgentId !== referentAgentId || previous.subjectToken !== subjectToken ||
      tick < previous.lastUpdatedTick))) throw new Error('Invalid directed relationship update')
  const prior = previous ?? { ownerAgentId, referentAgentId, subjectToken,
    familiarity: 0, recognitionStrength: 0, trust: 0.5,
    encounterCount: 0, greetingCount: 0, conversationCount: 0,
    lastEncounterTick: tick, lastUpdatedTick: tick, believedIdentity: null }
  const elapsed = tick - prior.lastUpdatedTick
  const familiarity = prior.familiarity * Math.pow(config.familiarityDecayPer100Ticks,
    elapsed / 100)
  const recognitionStrength = prior.recognitionStrength * Math.pow(0.99, elapsed / 100)
  const gain = experience === 'noticed' ? config.familiarityEncounterGain :
    experience === 'greeting' ? config.familiarityGreetingGain :
      config.familiarityConversationGain
  const interpretedGain = gain * (0.75 + 0.5 * interpretation)
  const nextFamiliarity = experience === 'noticed' ?
    Math.max(familiarity, Math.min(0.22, familiarity + interpretedGain)) :
    clamp01(familiarity + interpretedGain)
  const trustShift = experience === 'helped' ? 0.12 * (0.5 + interpretation) :
    experience === 'disagreement' ? -0.12 * (1.5 - interpretation) :
      experience === 'conversation' ? 0.025 * interpretation : 0
  return { ...prior, familiarity: nextFamiliarity,
    recognitionStrength: clamp01(recognitionStrength + (experience === 'noticed' ?
      0.015 : experience === 'greeting' ? 0.09 : 0.16) * (0.5 + interpretation)),
    trust: clamp01(prior.trust + trustShift),
    encounterCount: prior.encounterCount + (experience === 'noticed' ? 1 : 0),
    greetingCount: prior.greetingCount + (experience === 'greeting' ? 1 : 0),
    conversationCount: prior.conversationCount + (experience === 'conversation' ? 1 : 0),
    lastEncounterTick: tick, lastUpdatedTick: tick }
}

/** Identity belief requires an explicit information exchange, not proximity. */
export function setRelationshipIdentityBeliefV1(
  relation: DirectedRelationshipV1, claimedDisplayName: string, tick: number,
): DirectedRelationshipV1 {
  if (!claimedDisplayName.trim() || !Number.isSafeInteger(tick) ||
    tick < relation.lastUpdatedTick) throw new Error('Invalid identity belief')
  return { ...relation, believedIdentity: claimedDisplayName.trim(), lastUpdatedTick: tick }
}

export function relationshipCategoryV1(relation: DirectedRelationshipV1): RelationshipCategoryV1 {
  if (relation.conversationCount >= 2 && relation.familiarity >= 0.4) return 'knownContact'
  if (relation.familiarity >= 0.25) return 'familiar'
  return 'stranger'
}

/** Read-only decay does not rewrite historical encounter or interaction events. */
export function decayDirectedRelationshipV1(
  relation: DirectedRelationshipV1, tick: number, config: SocialConfigV1,
): DirectedRelationshipV1 {
  if (!Number.isSafeInteger(tick) || tick < relation.lastUpdatedTick) {
    throw new Error('Cannot decay a relationship backwards')
  }
  const elapsed = tick - relation.lastUpdatedTick
  return { ...relation,
    familiarity: relation.familiarity * Math.pow(config.familiarityDecayPer100Ticks,
      elapsed / 100),
    recognitionStrength: relation.recognitionStrength * Math.pow(0.99, elapsed / 100),
    lastUpdatedTick: tick }
}
