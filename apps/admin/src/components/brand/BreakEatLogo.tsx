// ─────────────────────────────────────────────────────────────
// BREAK EAT — logo (re-export of the shared package).
// ─────────────────────────────────────────────────────────────
// Canonical component lives in @break-eat/brand. Existing admin
// imports of '@/components/brand/BreakEatLogo' keep working via this
// shim. The PNG artwork is served from apps/admin/public/.
// ─────────────────────────────────────────────────────────────
export { BreakEatLogo, BreakEatLogo as default } from '@break-eat/brand';
