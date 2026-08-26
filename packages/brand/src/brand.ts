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
  //
  // Contraste RELEVÉ (26/08) : les dashboards paraissaient éteints. Un texte
  // secondaire trop pâle ne se lit pas comme « discret », il se lit comme
  // « délavé » — et c'est ce qui vieillit une interface. Chaque cran gagné se
  // voit immédiatement sur des écrans denses en données.
  ink: '#241f1d', // titres & texte principal — plus profond, plus net
  inkSoft: '#4d4641', // labels / texte secondaire — lisible, pas fantomatique
  grey: '#776e68', // hints — 4.7:1 sur le canevas, seuil WCAG du petit texte
  border: '#eee7e1', // filets — chauds, presque invisibles
  bg: '#fbf8f5', // canevas — blanc cassé chaud
  bgSubtle: '#f5efe9', // remplissages, chips, en-têtes de tableau
  surface: '#ffffff', // cartes — blanc franc, ressort sur le canevas

  // Shadows — douces, NEUTRES, en couches.
  //
  // Renforcées (26/08) : à 0.04 d'opacité elles étaient invisibles, et une carte
  // sans relief se confond avec le canevas. Une interface « vivante » se
  // reconnaît d'abord à ses plans — ce qui est posé sur quoi.
  shadowCard: '0 1px 2px rgba(36, 31, 29, 0.05), 0 4px 16px rgba(36, 31, 29, 0.07)',
  shadowSoft: '0 2px 4px rgba(36, 31, 29, 0.05), 0 14px 36px rgba(36, 31, 29, 0.10)',
  shadowButton: '0 6px 18px rgba(252, 64, 2, 0.26)', // CTA orange — lueur de marque

  // Couleurs d'ÉTAT. Séparées de l'accent : l'orange dit « la marque », le vert
  // et le rouge disent « ce qui se passe ». Les confondre rend un tableau de
  // bord illisible d'un coup d'œil.
  //
  // Rassemblées ici parce qu'elles étaient réécrites à la main dans chaque
  // écran — plus de 100 occurrences de '#dc2626' à travers les trois apps.
  success: '#15803d',
  successBg: '#e8f6ed',
  warning: '#a16207',
  warningBg: '#fdf5e3',
  danger: '#c2251f',
  dangerBg: '#fdecea',
  info: '#1d6f8f',
  infoBg: '#e6f1f6',

  /**
   * Titre de section — orange vif, en capitales espacées.
   *
   * Ce n'est pas de la décoration : sur un écran dense, l'œil cherche d'abord
   * la structure. Un titre qui se distingue du contenu par sa COULEUR et sa
   * FORME se repère sans être lu, et donne à l'ensemble un rythme de logiciel
   * plutôt que de document.
   */
  sectionTitle: {
    color: '#FC4002',
    fontFamily: 'var(--font-display), var(--font-sans), sans-serif',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
  },

  // Arrondis (cohérence — le nouveau code s'y réfère)
  radius: {
    card: 16,
    control: 12,
    pill: 999,
  },

  // Typography
  //  • font → Inter, pour TOUTE l'UI. Chaque app définit --font-sans dans son
  //    app/layout.tsx (next/font/google). Fallback : stack système (Arial-like).
  /**
   * Police de TITRE — Raleway, cablee sur --font-display par chaque app.
   *
   * Reservee aux titres de section et aux groupes de menu. Une seconde
   * famille employee sur un seul role donne du rythme sans disperser : la
   * structure se reconnait a sa forme avant d etre lue.
   */
  fontDisplay: 'var(--font-display), var(--font-sans), Helvetica, Arial, sans-serif',

  font: 'var(--font-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
} as const;

export type Brand = typeof BRAND;
