/**
 * Le JOUR DE SERVICE d'un lieu.
 *
 * Un service de stade finit après minuit : à 00h30, le comptoir sert encore le
 * match du soir. Un compteur remis à zéro sur le jour calendaire ferait donc
 * repartir la numérotation à 1 en plein coup de feu, et deux clients porteraient
 * le même numéro à dix minutes d'intervalle.
 *
 * Le jour bascule ici à **4h du matin, heure du LIEU** — après la fermeture de
 * tout service raisonnable, avant l'ouverture du suivant.
 *
 * L'heure locale, pas UTC : à 01h à Paris on est encore la veille en UTC, et le
 * compteur d'un lieu doit suivre le rythme de son comptoir, pas celui de
 * Greenwich.
 */
const BASCULE_HEURE_LOCALE = 4;

/** Décalage du fuseau, en minutes, à cet instant précis (été comme hiver). */
function decalageFuseau(instant: Date, fuseau: string): number {
  const lu = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: fuseau,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const local = Date.UTC(
    Number(lu.year),
    Number(lu.month) - 1,
    Number(lu.day),
    Number(lu.hour),
    Number(lu.minute),
  );
  return Math.round((local - instant.getTime()) / 60_000);
}

/**
 * Le jour de service contenant `instant`, rendu comme une date UTC à minuit —
 * une clé, pas un horodatage.
 */
export function jourDeService(instant: Date, fuseau = 'Europe/Paris'): Date {
  const decalage = decalageFuseau(instant, fuseau);
  const local = new Date(instant.getTime() + decalage * 60_000);
  // Avant la bascule, on appartient encore au service de la veille.
  if (local.getUTCHours() < BASCULE_HEURE_LOCALE) {
    local.setUTCDate(local.getUTCDate() - 1);
  }
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}
