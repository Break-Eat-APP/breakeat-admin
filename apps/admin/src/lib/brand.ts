// ─────────────────────────────────────────────────────────────
// BREAK EAT — brand tokens (re-export of the shared package).
// ─────────────────────────────────────────────────────────────
// The canonical source now lives in @break-eat/brand, so admin,
// operator and backoffice all share ONE definition (single source
// of truth). Keep importing from '@/lib/brand' anywhere in the
// admin app — this thin shim simply forwards to the shared package.
// ─────────────────────────────────────────────────────────────
export { BRAND } from '@break-eat/brand';
export type { Brand } from '@break-eat/brand';
