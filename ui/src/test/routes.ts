/**
 * Stub routes answering every GET of the contract from the fixtures (a fresh copy per request), for component tests
 * and the preview. `extra` adds or overrides routes (keys like `"POST /api/apps/brain/intake/check"`).
 */
import { setApiRoutes, type RouteHandler } from './stubs/app-sdk'
import { BASE } from '../types'
import { fx } from './data'

export const API = BASE

export function fixtureRoutes(): Record<string, RouteHandler> {
  return {
    [`GET ${API}/status`]: () => fx.status(),
    [`GET ${API}/settings`]: () => fx.settings(),
    [`GET ${API}/overview*`]: () => fx.overview(),
    [`GET ${API}/requirements/*`]: () => fx.detail(),
    [`GET ${API}/intake/next*`]: () => fx.intakeNext(),
    [`GET ${API}/crew`]: () => fx.crew(),
    [`GET ${API}/brain*`]: () => fx.brain(),
    [`GET ${API}/todo`]: () => fx.todo(),
    [`GET ${API}/team`]: () => fx.team(),
  }
}

export function installFixtureRoutes(extra: Record<string, RouteHandler> = {}): void {
  setApiRoutes({ ...fixtureRoutes(), ...extra })
}
