/**
 * LE SUPPORT BREAKEAT — une adresse, et les messages qu'on lui prépare.
 *
 * L'adresse vivait dans `aide.screen.tsx`. Le bon de commande en a besoin
 * aussi (« Signaler un problème avec ma commande », demande de Rémi, 10/11) :
 * deux copies d'une adresse finissent par diverger le jour où elle change.
 */
export const ADRESSE_SUPPORT = 'contact@breakeatapp.com';

/** Ce qu'il faut pour que le support retrouve la commande sans redemander. */
export interface CommandeASignaler {
  numero: string;
  reference: string;
  buvette: string | null;
  passeeLe: string;
}

/**
 * Le lien `mailto:` d'un signalement, PRÉ-REMPLI avec la commande.
 *
 * Sans ces lignes, chaque échange commence par « quelle commande ? quelle
 * buvette ? quel jour ? » — trois questions pour une réponse qui tenait en un
 * message. Le client n'a plus qu'à décrire le problème.
 */
export function lienSignalement(
  commande: CommandeASignaler,
  pied: { compte: string | null; appareil: string; version: string },
): string {
  const quand = new Date(commande.passeeLe).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const corps = [
    'Bonjour,',
    '',
    'J’ai un problème avec ma commande :',
    '',
    '(décrivez le problème ici)',
    '',
    '—',
    `Commande : ${commande.numero}`,
    `Référence du reçu : ${commande.reference}`,
    ...(commande.buvette ? [`Buvette : ${commande.buvette}`] : []),
    `Passée le : ${quand}`,
    `Compte : ${pied.compte ?? 'non connecté'}`,
    `Appareil : ${pied.appareil}`,
    `Application : BreakEat ${pied.version}`,
  ].join('\n');
  return (
    `mailto:${ADRESSE_SUPPORT}` +
    `?subject=${encodeURIComponent(`BreakEat — Problème avec la commande ${commande.numero}`)}` +
    `&body=${encodeURIComponent(corps)}`
  );
}
