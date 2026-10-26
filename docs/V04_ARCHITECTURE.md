# v0.4 ground truth and observation architecture

This document records the v0.4 synthetic research model. `VISION.md`, `VISUAL_DIRECTION.md`, and `ROADMAP.md` govern product scope and visual direction. None of the incident or reporting parameters are calibrated to real places, people, or crime rates.

## Data ownership and one-way flow

```text
CityModel (static) + SimulationConfigV3.citizen -> v2 citizen tick
                                                    |
                                                    v
                                      authoritative outdoor positions
                                                    |
CityModel + SimulationConfigV3.incident ----------> synthetic Incident process
                                                    |
                                                    v
                                      Ground Truth incidents and events
                                                    |
SimulationConfigV3.observation -------------------> reporting decisions and delay
                                                    |
                                      private outcomes / available records
                                              |                  |
                                              v                  v
                                      GroundTruthView    ObservedWorldView
                                      (researcher)       (observer capability)
```

`src/simulation/engineV3.ts` composes the existing pure v2 citizen transition with the incident and reporting modules. At Tick `t` it advances citizens, groups the resulting outdoor positions by block, generates incidents, decides reports, then delivers all reports due by `t`. A zero-delay report is available at the end of its occurrence Tick. The reporting branch receives completed incidents but never feeds back into citizens or incident generation. The camera has its own `CameraController` and cannot change world or reporting state. `CityModel` stays read-only.

The v3 state contains the nested v2 citizen state, an append-only ground-truth incident list, and a private reporting branch with one outcome per incident. Transitions return separate citizen/diagnostic, `IncidentOccurred`, and `ReportAvailable` event arrays. Incident IDs and truth event IDs are independent of public report order. `SimulationSession` keeps the three histories separate and checks event, incident, report, pending-action, and Tick limits before committing a transition. The existing v1/v2 engine and replay paths remain available.

## Synthetic incident process

`src/simulation/incidents/generateIncidents.ts` conducts at most one Bernoulli trial per occupied block per Tick. Only citizens with `travelling`, `returningHome`, or `atDestination` activity count as outdoor presence. Each is associated with the nearest block boundary, with stable block-ID tie breaking. A selected citizen supplies a position already known to lie on the pedestrian graph; their ID is private spatial provenance, **not** an offender, victim, or witness designation. `involvedAgentIds` is empty in this prototype.

For an occupied block, the synthetic per-hour intensity is:

```text
lambda = baselineRatePerOccupiedBlockHour
       × districtMultiplier × timeBandMultiplier
       × publicSpaceMultiplier (only in a park or plaza)
       × [1 + densitySlope × (min(outdoorPresence, maxDensityCount) - 1)]

p(incident this Tick) = 1 - exp(-lambda × logicalSecondsPerTick / 3600)
```

The clock uses `startHour` plus fixed logical seconds, modulo 24 hours; its day/evening/night bands are model variables and do not change the nighttime art direction. The default synthetic baseline is 1.2 expected incidents per occupied block per simulated hour. An explicit `?review=1` fixture uses 2.4 for screenshot review. Neither value is a measured urban rate. Type (`disruption` or `safety`), severity (`minor` or `serious`), occurrence and position use distinct deterministic samples keyed by world run ID, Tick, block ID, and purpose. At most one incident can occupy a block/Tick key, giving a stable ID `incident-{worldRunId}-{tick}-{blockId}`. `worldRunId` includes the citizen run and incident configuration but excludes reporting parameters.

## Reporting and availability

`src/simulation/observation/reporting.ts` validates a fixed `ReportingConfig`. Its `globalProbability` is the baseline for severity exponent 1. For severity `s`, the effective probability is `1 - (1 - globalProbability) ** severityExponent[s]`. The default exponents are minor 1 and serious 1.5. Thus global probability 0 selects none and 1 selects every eligible incident. A stable sample derived from `(observationSeed, incident ID, decision)` decides whether the incident will be reported. The sample is independent of the probability, scenario label, incident-generation samples, and citizen RNG.

A second incident-keyed sample selects an integer creation delay in `[minDelayTicks, maxDelayTicks]`; `availableTick = createdTick + ingestDelayTicks`. The private outcome is exactly one of `notReported`, `scheduled`, or `available`. A scheduled outcome remains hidden even after its private creation Tick, until availability. Reports due in a Tick are ordered by availability Tick, occurrence Tick, then incident ID. Public report IDs are assigned **only on delivery** as contiguous `report-000001`, `report-000002`, and so on; they neither encode incident IDs nor leave gaps for unreported incidents. A private outcome retains report-to-incident provenance for researcher validation. Available public records include reported occurrence, arrival, location, block, type, and severity. This version assumes those reported fields equal ground truth; reporting errors and misinformation are deferred.

Three UI scenarios share city, citizen seed and parameters, incident parameters, observation seed, and delay rules. A/B/C change only global reporting probability to 0.3/0.6/0.9. Changing scenario pauses playback and starts a new fixed scenario at Tick 0. No live parameter mutation is claimed. Because each incident keeps the same report-decision sample, increasing probability gives a superset of **privately linked incident IDs** selected for reporting. Public report IDs may differ between scenarios because they reflect delivery order.

## Information boundaries

`SimulationSession.getGroundTruthView()` is a researcher capability. It includes all occurred incidents, private reporting outcomes, and truth-versus-report metrics. `SimulationSession.createObserverPort()` returns a restricted object with only `getView()` and `subscribe()`. The public selector explicitly constructs new `ObservationRecord` objects and copies their allowed fields; it requires a matching `available` outcome and `availableTick <= asOfTick`. The resulting `ObservedWorldView` exposes only `asOfTick`, available records, and their count. It does not expose hidden incident IDs, pending outcomes, provenance, future reports, or true totals.

The existing generic `getSnapshot()` and `getEventHistory()` remain internal/research-oriented and must not be handed to observer-only components or future Police Agents. v0.4's Observed incident scene and panel receive only `ObserverPort`; the researcher modes separately receive the session. The v3 simulation readout uses available-report counts in every mode, so Observed Mode never receives a hidden total. The development v0.4 fixture requires `?test=1` and exposes Tick controls plus a public count, not raw truth. The legacy raw v0.3 fixture is available only under explicit `?model=v2` regression mode. UI mode selection is an information-view choice, not an authentication system; TypeScript and a shared browser process do not protect against hostile code with access to application internals.

## Metrics and replay

For all incidents occurred by Tick `t`, the researcher metrics enforce:

```text
totalIncidents = unreportedIncidents + pendingReports + availableReports
currentCoverage = availableReports / totalIncidents
eventuallyReportedShare = (pendingReports + availableReports) / totalIncidents
```

`maturedReportingShare` uses only incidents older than the maximum creation plus ingestion delay; `meanReportDelayTicks` averages `availableTick - occurrenceTick` over available reports. Counts by severity, district, and block are provided for truth and available reports. Ratios with zero denominator are `null`, displayed as an em dash. These are synthetic reporting measures, not police detection, investigation, or arrest rates. Observer-only panels cannot compute truth-denominator measures.

`replayToTick` reconstructs v3 state and all three event streams from Tick 0 with the same static city, versioned config, and accepted commands. `inspectTick` holds the live run separately; the observer view is derived from the inspected state, so a future report cannot appear when seeking to an earlier Tick. Reset recreates citizens, truth, reporting outcomes, records, and histories. Play/Pause/Step/1×/2×/4× only schedule or invoke fixed transitions; they do not change a result at a specified logical Tick. Exact reproducibility assumes the same engine implementation and tested JavaScript environment; cross-runtime bitwise identity has not been established.

## Presentation and limits

The existing cinematic city is rendered once. `IncidentLayer` adds instanced Coral truth markers and Cyan available-report rings. These are depth-independent map annotations at source coordinates, so a marker may visually cross a roof even when its incident position is on a walking surface. Ground Truth Mode reads researcher truth, Observed Mode reads only the observer capability, and Comparison Mode displays both plus district and coverage statistics. New occurrence and arrival emphasis is based on logical Tick age, not wall-clock animation. The reporting scenario panel states that switching resets to Tick 0. No marker is fabricated solely for presentation.

The model has no Police Agent decisions, offender motives, investigations, arrests, false reports, misclassification, spatial reporting error, backend, or database. v0.5 strategies may legitimately change later world outcomes; a fair comparison should then hold initial conditions and exogenous random samples fixed, rather than forcing intervention-dependent truth to remain identical.
