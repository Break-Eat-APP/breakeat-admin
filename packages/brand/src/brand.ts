// ─────────────────────────────────────────────────────────────
// BREAK EAT — Centralized brand tokens (refonte v3 — "chaleureux premium")
// ─────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for the whole platform design — shared by
// every surface (admin / operator / backoffice) via @break-eat/brand.
// Tweak a value HERE and it propagates to every screen that imports
// BRAND. No screen-by-screen hunting required.
//
// Authoritative direction (07/06/2026 — remplace "Fredoka partout / blanc pur") :
//   • Orange       = #FC4002  (vivid — accents & CTAs, employé avec parcimonie)
//   • Police       = Inter (UI pro, lisible) — chaque app câble --font-sans
//                    dans son app/layout.tsx. Fini Fredoka (jugée trop "enfant").
//   • Direction    = "chaleureux premium" : canevas blanc cassé chaud,
//                    cartes blanches qui ressortent, profondeur DOUCE et
//                    NEUTRE (pas d'ombres orangées génériques), arrondis maîtrisés.
//   • Le logo "B éclair" reste l'artwork officiel (SVG) — non géré ici.
// ─────────────────────────────────────────────────────────────

export const BRAND = {
  // Core orange
  orange: '#FC4002', // primary / accents / CTAs
  orangeDark: '#DA3702', // hover & pressed states
  orangeSoft: '#FDB9A3', // disabled buttons / soft fills
  orangeTint: 'rgba(252, 64, 2, 0.08)', // faint background wash (use sparingly)

  // Neutrals (warm) — "chaleureux premium"
  ink: '#2d2926', // primary text — anthracite chaud
  inkSoft: '#57514c', // labels / secondary text (un cran plus doux que l'ancien #44403c)
  grey: '#a8a29e', // muted hints
  border: '#ece3dd', // hairline borders (warm)
  bg: '#fcfaf8', // canevas — blanc cassé chaud (était #ffffff pur)
  bgSubtle: '#f5efe9', // insets / chips / surfaces secondaires (un peu plus profond)
  surface: '#ffffff', // cartes — blanc franc, ressort sur le canevas cassé

  // Shadows — douces, NEUTRES, en couches (profondeur premium, sans teinte orange)
  shadowCard: '0 1px 2px rgba(45, 41, 38, 0.04), 0 4px 14px rgba(45, 41, 38, 0.05)', // carte au repos
  shadowSoft: '0 1px 2px rgba(45, 41, 38, 0.04), 0 12px 32px rgba(45, 41, 38, 0.07)', // élévation modale / survol
  shadowButton: '0 6px 18px rgba(252, 64, 2, 0.22)', // CTA orange (lueur douce, conservée pour la marque)

  // Arrondis (cohérence — le nouveau code s'y réfère)
  radius: {
    card: 16,
    control: 12,
    pill: 999,
  },

  // Typography
  //  • font → Inter, pour TOUTE l'UI. Chaque app définit --font-sans dans son
  //    app/layout.tsx (next/font/google). Fallback : stack système (Arial-like).
  font: 'var(--font-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
} as const;

export type Brand = typeof BRAND;
