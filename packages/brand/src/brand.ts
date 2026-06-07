// ─────────────────────────────────────────────────────────────
// BREAK EAT — Centralized brand tokens (Phase 11 refonte v2)
// ─────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the whole platform design — shared by
// every surface (admin / operator / backoffice) via @break-eat/brand.
// Tweak a value HERE and it propagates to every screen that imports
// BRAND. No screen-by-screen hunting required.
//
// Authoritative palette decisions (02/06/2026):
//   • Orange  = #FC4002  (vivid — replaces the old "clémentine" #FF4D00)
//   • Background = pure white, neutral, NO decorative shapes
//   • Font    = Fredoka everywhere (each app wires --font-fredoka in its layout)
// ─────────────────────────────────────────────────────────────

export const BRAND = {
  // Core orange
  orange: '#FC4002', // primary / accents / CTAs
  orangeDark: '#DA3702', // hover & pressed states
  orangeSoft: '#FDB9A3', // disabled buttons / soft fills
  orangeTint: 'rgba(252, 64, 2, 0.08)', // faint background wash (use sparingly)

  // Neutrals
  ink: '#1c1917', // primary text
  inkSoft: '#44403c', // labels / secondary text
  grey: '#a8a29e', // muted hints
  border: '#ece3dd', // hairline borders
  bg: '#ffffff', // neutral white background (no shapes)
  bgSubtle: '#faf7f5', // cards / subtle raised surfaces

  // Shadows (kept subtle, orange-tinted)
  shadowSoft: '0 12px 44px rgba(252, 64, 2, 0.10)',
  shadowButton: '0 8px 20px rgba(252, 64, 2, 0.28)',

  // Typography
  //  • font → Fredoka, pour TOUTE l'UI ("Fredoka partout"). Chaque app
  //    définit la variable CSS --font-fredoka dans son app/layout.tsx.
  //  Le logotype "BREAKEAT" n'est pas du texte : c'est l'artwork officiel
  //  (public/logo-full.png), donc aucune police de wordmark n'est exposée ici.
  font: 'var(--font-fredoka), system-ui, -apple-system, sans-serif',
} as const;

export type Brand = typeof BRAND;
