# Commit record — 2026-10-28

This record separates the completed place, crime and lighting commits from the interrupted organic-city worktree. Commits were created locally on `main`; none was pushed, merged or deployed.

## Existing place commits

| Commit | Conventional message | Scope |
| --- | --- | --- |
| `90a1995` | `chore(assets): stop tracking PNG files` | Ignore PNGs and remove previously tracked screenshot PNGs. |
| `4b4db20` | `feat(simulation): add functional place occupancy and activities` | Functional place runtime and activity state. |
| `dfbfbfc` | `feat(god-view): add Central Galleria place inspector` | Researcher place inspection UI. |
| `8b38292` | `test(places): verify mall interaction in Chrome and replay` | Place tests, browser tooling and JSON results. |
| `4a134e8` | `docs(places): record mall architecture and acceptance gaps` | Place architecture and verification records. |

## New crime commits

Committed in this order, after checking each staged diff:

| Step | Commit | Conventional message | Content |
| --- | --- | --- | --- |
| 1 | `27e3f3e` | `feat(simulation): add typed crime and unified world clock` | Six-second integrated clock, typed offence engine and tests, encounter integration, v5 config/state and legacy-compatible clock handling. |
| 2 | `fdc9095` | `feat(god-view): expose typed crime causal history` | Event index, causal Event Explorer and integrated scenario opt-in. |
| 3 | `2e009a6` | `test(crime): record paired-seed and replay experiments` | Repeatable experiment script and JSON result records. PNG evidence remains ignored by Git. |
| 4 | `ea45fad` | `docs(crime): document causal model and open gates` | Clock, opportunity, offence, knowledge and scientific-limit documents, plus the crime roadmap milestone. |

## New lighting commits

| Step | Commit | Conventional message | Content |
| --- | --- | --- | --- |
| 5 | `70cbf1d` | `feat(lighting): drive city scenes from world time` | Pure lighting keyframes, sky, sun/moon and environment integration, shared emissive response, static shadow update control and actual/preview time UI. |
| 6 | `f16babc` | `test(lighting): verify day-night states in Chrome` | Lighting unit tests, seven-time Chrome capture script and npm command. |
| 7 | `808a0d5` | `docs(lighting): record visual evidence and limits` | Visual direction, roadmap and Chrome evidence. Sunrise darkness and 200-resident performance limits remain open. |

The clock was committed with the crime model because the new typed scenario requires the unified six-second calendar. Lighting reads that same clock without changing SimulationState. Existing legacy 30-second habit experiments keep their versioned semantics. See [`SIMULATION_CLOCK.md`](SIMULATION_CLOCK.md) and [`DAY_NIGHT_VERIFICATION.md`](DAY_NIGHT_VERIFICATION.md).

## Verification of the committed snapshot

The Git index was exported to an isolated temporary directory before verification, so the uncommitted organic files could not influence the result. On that committed snapshot:

- TypeScript typecheck passed.
- 46 test files and 236 tests passed.
- Production build passed.

This verification is separate from the earlier Chrome/Apple M4 lighting screenshots documented in `DAY_NIGHT_VERIFICATION.md`. No new browser capture was performed for the commit split.

## Work deliberately left uncommitted

The interrupted organic-city scenario remains only in the worktree: `src/world/terrain/`, `src/world/generation/generateOrganicWorld*`, `src/scene/OrganicWorldGeometry.tsx`, `scripts/organic-check.mjs`, and organic-only changes in the app, world model, navigation validation, camera and simulation profiles. Its road-versus-building test currently reports five overlaps; it is not an accepted release.

Shared files were staged by exact projected hunk rather than whole-file staging. The staged crime and lighting diffs were checked for organic code before each commit. The original worktree was backed up at `/private/tmp/shadow-city-precommit-20261028-191746` before the split.
