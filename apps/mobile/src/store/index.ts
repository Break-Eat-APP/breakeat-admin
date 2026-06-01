/**
 * Zustand store root — Phase 1 shell.
 *
 * Stores are added slice by slice from Phase 2 onward:
 *   Phase 2 → authStore (user session, token)
 *   Phase 3 → eventStore (active event, venue)
 *   Phase 5 → cartStore (items, totals, selected slot)
 *   Phase 6 → orderStore (active order, status)
 *
 * Rule: no business logic in stores — only state and setters.
 * Business logic lives in services (src/lib/).
 */

export * from './app.store';
