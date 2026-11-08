/**
 * The contract fixtures (src/test/fixtures/*.json), typed, and a fresh copy per call. The backend's test compares their
 * key sets with its own output, so they hold exactly the keys of types.ts — checked here at compile time, both ways:
 * `Loose<T>` (every key of the contract, optional ones too, literals widened as JSON imports are) must accept the
 * file, and `Extra<J, T>` (the file's keys the contract does not have) must be never.
 */
import type {
  BrainView, CrewChecks, IntakeCheck, IntakeNext, Overview, ReflectPreview, RequirementDetail, Settings, StartResult, Status, TeamView, Todo,
} from '../types'
import brainJson from './fixtures/brain.json'
import crewJson from './fixtures/crew.json'
import detailJson from './fixtures/detail.json'
import intakeCheckJson from './fixtures/intake-check.json'
import intakeNextJson from './fixtures/intake-next.json'
import overviewJson from './fixtures/overview.json'
import reflectJson from './fixtures/reflect-preview.json'
import settingsJson from './fixtures/settings.json'
import startJson from './fixtures/start.json'
import statusJson from './fixtures/status.json'
import teamJson from './fixtures/team.json'
import todoJson from './fixtures/todo.json'

type Loose<T> = T extends string ? string
  : T extends number ? number
    : T extends boolean ? boolean
      : T extends null ? null
        : T extends readonly (infer U)[] ? Loose<U>[]
          : T extends object ? { [K in keyof T]-?: Loose<T[K]> }
            : T

type Extra<J, T> = J extends readonly (infer JU)[]
  ? (T extends readonly (infer TU)[] ? Extra<JU, TU> : never)
  : J extends object
    ? (T extends readonly unknown[] ? never : T extends object ? { [K in keyof J]: K extends keyof T ? Extra<J[K], NonNullable<T[K]>> : K }[keyof J] : never)
    : never

/** Compiles only when *J* has every key of *T* and no other. */
function exact<T>() {
  return <J extends Loose<T>>(j: J & ([Extra<J, T>] extends [never] ? unknown : { __extra_keys: Extra<J, T> })): T => j as unknown as T
}

const files = {
  status: exact<Status>()(statusJson),
  overview: exact<Overview>()(overviewJson),
  detail: exact<RequirementDetail>()(detailJson),
  todo: exact<Todo>()(todoJson),
  brain: exact<BrainView>()(brainJson),
  intakeNext: exact<IntakeNext>()(intakeNextJson),
  intakeCheck: exact<IntakeCheck>()(intakeCheckJson),
  start: exact<StartResult>()(startJson),
  crew: exact<CrewChecks>()(crewJson),
  reflect: exact<ReflectPreview>()(reflectJson),
  team: exact<TeamView>()(teamJson),
  settings: exact<Settings>()(settingsJson),
}

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

type Files = typeof files
/** A fresh copy of a fixture (tests change them freely). */
export const fx = Object.fromEntries(Object.entries(files).map(([k, v]) => [k, () => clone(v)])) as { [K in keyof Files]: () => Files[K] }

/** The fixtures' `at` (2026-11-08 14:00 UTC): tests that show "… 前" fix Date.now() here. */
export const FIXTURE_AT = files.overview.at
