'use client';

// ─────────────────────────────────────────────────────────────
// BREAK EAT — Logo (the official "B + éclair" mark + wordmark)
// ─────────────────────────────────────────────────────────────
// SINGLE source for the logo across the whole platform (admin /
// operator / backoffice), shipped via @break-eat/brand.
// Swapping the artwork later means editing ONLY this file (+ the
// PNGs each app serves from its own /public).
//
// Artwork (the user's OFFICIAL logo v2, processed to orange-on-
// transparent so it sits on the white UI — the lightning bolt is a
// transparent knockout that reads white on white):
//   • /logo-full.png  → B + éclair + "BREAKEAT" wordmark (full lockup)
//   • /logo-mark.png  → B + éclair ONLY (compact mark)
//
// ⚠️ Each consuming app MUST place logo-full.png + logo-mark.png in
//    its own public/ directory (Next serves /public at the web root).
//
// Usage:
//   • Login (full lockup):    <BreakEatLogo size={60} showWordmark />
//   • Dashboard (mark only):  <BreakEatLogo size={36} />
// ─────────────────────────────────────────────────────────────

type Props = {
  /** Height of the logo in px (width scales to keep ratio). Default 48. */
  size?: number;
  /** Use the full lockup (mark + "BREAKEAT" wordmark). Default false = mark only. */
  showWordmark?: boolean;
  /** Optional extra alt text suffix (rarely needed). */
  title?: string;
};

export function BreakEatLogo({ size = 48, showWordmark = false, title }: Props) {
  const src = showWordmark ? '/logo-full.png' : '/logo-mark.png';
  const alt = title ? `Break Eat — ${title}` : 'Break Eat';

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={{ height: size, width: 'auto', display: 'block', flexShrink: 0 }}
    />
  );
}

export default BreakEatLogo;
