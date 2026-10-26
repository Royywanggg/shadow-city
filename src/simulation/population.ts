import { hashSeed } from './rng'
import type { AgentProfile, CitizenActivity, CitizenEvent, CitizenState, SimulationEvent } from './types'
import type { Offence, OffendingProfile } from './v4Types'

export const POPULATION_IDENTITY_VERSION = 'population-identity-v1'
export const DEFAULT_IDENTITY_SEED = 'shadow-city-identity-01'
export const DEFAULT_APPEARANCE_SEED = 'shadow-city-appearance-01'

export interface PopulationIdentityConfig {
  readonly identitySeed: string
  readonly appearanceSeed: string
}

export interface CitizenAppearance {
  readonly presetId: string
  readonly bodyPresetId: string
  /** Null until a compatible, independently swappable asset is actually integrated. */
  readonly outfitPresetId: string | null
  readonly hairstylePresetId: string | null
  readonly primaryClothingColor: string | null
  readonly secondaryClothingColor: string | null
  readonly accessoryPresetId: string | null
  readonly animationPhaseOffset: number
}

export interface CitizenIdentity {
  readonly id: string
  readonly displayName: string
  /** The current synthetic movement model has no employment or occupation. */
  readonly occupation: null
  readonly appearance: CitizenAppearance
}

export interface PopulationCitizen {
  readonly id: string
  readonly identity: CitizenIdentity
  readonly profile: AgentProfile
  readonly state: CitizenState
  readonly offendingProfile: OffendingProfile | null
}

export interface PopulationResearchView {
  readonly asOfTick: number
  readonly identityCatalog: Readonly<PopulationIdentityConfig & { readonly version: typeof POPULATION_IDENTITY_VERSION }>
  readonly citizens: readonly PopulationCitizen[]
}

export interface PopulationAgentHistory {
  readonly asOfTick: number
  readonly agentId: string
  /** Actual initial state, since Tick 0 emits no activity-start event. */
  readonly initialActivity: CitizenActivity
  readonly activityEvents: readonly CitizenEvent[]
  readonly offences: readonly Offence[]
}

export interface PopulationResearchPort {
  getView(): PopulationResearchView
  getAgentHistory(agentId: string): PopulationAgentHistory | null
  subscribe(listener: () => void): () => void
}

const FIRST_NAMES = Object.freeze([
  'Alex', 'Amara', 'Ari', 'Avery', 'Blair', 'Cameron', 'Casey', 'Charlie',
  'Dakota', 'Darcy', 'Devon', 'Drew', 'Eden', 'Ellis', 'Emery', 'Finley',
  'Frankie', 'Harper', 'Hayden', 'Indigo', 'Jamie', 'Jesse', 'Jordan', 'Kai',
  'Kit', 'Lee', 'Morgan', 'Noor', 'Quinn', 'Remy', 'Robin', 'Sam',
])

const LAST_NAMES = Object.freeze([
  'Adler', 'Ali', 'Arden', 'Arora', 'Baker', 'Bell', 'Bennett', 'Brooks',
  'Campbell', 'Chen', 'Clarke', 'Cole', 'Costa', 'Dawson', 'Diaz', 'Evans',
  'Farah', 'Foster', 'Garcia', 'Grant', 'Gupta', 'Hale', 'Harris', 'Hassan',
  'Ibrahim', 'Ivanov', 'James', 'Khan', 'Kim', 'Lee', 'Lewis', 'Lin',
  'Martin', 'Miller', 'Morgan', 'Nair', 'Nguyen', 'Okafor', 'Park', 'Patel',
  'Reed', 'Rivera', 'Rossi', 'Shah', 'Singh', 'Taylor', 'Walker', 'Wright',
])

// The two accent materials are verified for nine current character presets.
// Character 7 retains its authored colors because its materials also cover head details.
// This version can realize at most 9 * 12 tinted combinations plus that authored preset.
const CLOTHING_PALETTES = Object.freeze([
  ['#8ca7ae', '#c4b7a4'], ['#ad9087', '#a8bdba'], ['#94a488', '#c7b4a6'],
  ['#8f9eaf', '#c2b8b0'], ['#ad9a82', '#a6b8b5'], ['#9f92a5', '#c2b5a1'],
  ['#87a4a1', '#c6b8ad'], ['#a99694', '#afc0b3'], ['#9b9d83', '#b6bac7'],
  ['#919db2', '#c6ad9c'], ['#ad9f94', '#9eb9bf'], ['#93a897', '#c0b0b9'],
] as const)

const NAME_COMBINATIONS = FIRST_NAMES.length * LAST_NAMES.length

function citizenOrdinal(id: string): number {
  const match = /^citizen-(\d+)$/.exec(id)
  return match ? Number(match[1]) : hashSeed(id)
}

function appearanceFor(id: string, appearanceSeed: string): CitizenAppearance {
  const body = hashSeed(`${appearanceSeed}\u0000character:${id}`) % 10
  const palette = CLOTHING_PALETTES[hashSeed(`${appearanceSeed}\u0000palette:${id}`) % CLOTHING_PALETTES.length]
  const tintable = body !== 7
  const phase = hashSeed(`${appearanceSeed}\u0000animation:${id}`) / 4294967296
  return Object.freeze({
    presetId: `character-${body}`,
    bodyPresetId: `body-${body}`,
    outfitPresetId: null,
    hairstylePresetId: null,
    primaryClothingColor: tintable ? palette[0] : null,
    secondaryClothingColor: tintable ? palette[1] : null,
    accessoryPresetId: null,
    animationPhaseOffset: phase,
  })
}

export function createCitizenIdentity(id: string, config: PopulationIdentityConfig = {
  identitySeed: DEFAULT_IDENTITY_SEED,
  appearanceSeed: DEFAULT_APPEARANCE_SEED,
}): CitizenIdentity {
  if (!id || !config.identitySeed || !config.appearanceSeed) throw new Error('Invalid citizen identity input')
  // This name permutation preserves existing names when population grows.
  const nameSlot = (citizenOrdinal(id) * 1031 + hashSeed(config.identitySeed)) % NAME_COMBINATIONS
  const firstName = FIRST_NAMES[nameSlot % FIRST_NAMES.length]
  const lastName = LAST_NAMES[Math.floor(nameSlot / FIRST_NAMES.length)]
  return Object.freeze({
    id,
    displayName: `${firstName} ${lastName}`,
    occupation: null,
    appearance: appearanceFor(id, config.appearanceSeed),
  })
}

export function createCitizenIdentityCatalog(
  profiles: readonly AgentProfile[],
  config?: PopulationIdentityConfig,
): ReadonlyMap<string, CitizenIdentity> {
  return new Map(profiles.map((profile) => [profile.id, createCitizenIdentity(profile.id, config)]))
}

function prefixThroughTick<T>(items: readonly T[], tick: number, getTick: (item: T) => number): readonly T[] {
  let low = 0
  let high = items.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (getTick(items[middle]) <= tick) low = middle + 1
    else high = middle
  }
  return Object.freeze(items.slice(0, low))
}

/** Incremental live indexes, queried at the selected replay Tick. */
export class PopulationHistoryIndex {
  private readonly eventsByAgent = new Map<string, CitizenEvent[]>()
  private readonly offencesByAgent = new Map<string, Offence[]>()

  addEvents(events: readonly SimulationEvent[]): void {
    for (const event of events) {
      if (event.source !== 'citizen') continue
      const existing = this.eventsByAgent.get(event.agentId) ?? []
      existing.push(event)
      this.eventsByAgent.set(event.agentId, existing)
    }
  }

  addOffences(offences: readonly Offence[]): void {
    for (const offence of offences) {
      const existing = this.offencesByAgent.get(offence.offenderAgentId) ?? []
      existing.push(offence)
      this.offencesByAgent.set(offence.offenderAgentId, existing)
    }
  }

  getAgentHistory(agentId: string, asOfTick: number, initialActivity: CitizenActivity): PopulationAgentHistory {
    return Object.freeze({
      asOfTick,
      agentId,
      initialActivity,
      activityEvents: prefixThroughTick(this.eventsByAgent.get(agentId) ?? [], asOfTick, (event) => event.tick),
      offences: prefixThroughTick(this.offencesByAgent.get(agentId) ?? [], asOfTick, (offence) => offence.occurrenceTick),
    })
  }

  clear(): void {
    this.eventsByAgent.clear()
    this.offencesByAgent.clear()
  }
}
