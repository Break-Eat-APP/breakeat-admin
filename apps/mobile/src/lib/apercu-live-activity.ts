import {
  endLiveActivity,
  listLiveActivities,
  startLiveActivity,
} from '../../modules/live-activity';

/**
 * L'APERÇU DE LA LIVE ACTIVITY — réservé au super admin.
 *
 * Une Live Activity ne démarre que pour une commande BreakEat. Or les lieux en
 * production passent tous par Flaix : il n'y avait aucun moyen de VOIR
 * l'activité, son décompte ou son îlot dynamique, sans un lieu de test et un
 * vrai paiement. L'aperçu en dessine une sur le téléphone, avec une commande
 * inventée.
 *
 * Ce qu'il montre : l'activité « En préparation », un retrait dans trois
 * minutes, le chrono qui descend (écran verrouillé, pastille du haut, vue
 * développée), puis, à zéro, la bascule sur l'heure de retrait.
 *
 * Ce qu'il ne montre PAS : les étapes suivantes (prête, récupérée). Elles
 * arrivent par le serveur, qui ne connaît pas cette commande — c'est voulu :
 * l'aperçu ne doit rien écrire nulle part.
 *
 * Son identifiant commence par `apercu-` : le relais des jetons push
 * (`live-activity-tracking.ts`) l'écarte, pour ne jamais demander au serveur
 * de suivre une commande qui n'existe pas.
 */

export const PREFIXE_APERCU = 'apercu-';

/** Durée du décompte de l'aperçu : assez pour regarder, assez court pour voir la fin. */
const DUREE_DECOMPTE_MS = 3 * 60 * 1000;

export function estUnApercu(orderId: string): boolean {
  return orderId.startsWith(PREFIXE_APERCU);
}

/**
 * Lance l'aperçu. Rend `false` quand l'appareil ne peut pas l'afficher
 * (Android, web, iOS trop ancien, ou activités coupées dans les Réglages).
 */
export async function lancerApercuLiveActivity(maintenant: Date = new Date()): Promise<boolean> {
  // Un seul aperçu à la fois : deux cartes identiques ne montreraient rien de plus.
  await arreterApercuLiveActivity();

  const debut = new Date(maintenant.getTime() + DUREE_DECOMPTE_MS);
  const fin = new Date(debut.getTime() + 15 * 60 * 1000);
  const id = await startLiveActivity(`${PREFIXE_APERCU}${maintenant.getTime()}`, {
    status: 'PREPARING',
    statusLabel: 'En préparation',
    orderNumber: '1045',
    pickupPoint: 'Buvette Sud',
    estimatedReadyAt: null,
    slotStartAt: debut.toISOString(),
    slotEndAt: fin.toISOString(),
    updatedAt: maintenant.toISOString(),
    customerArrived: false,
  });
  return id !== null;
}

/** Retire tout aperçu encore affiché. Les vraies commandes ne sont pas touchées. */
export async function arreterApercuLiveActivity(): Promise<void> {
  const activites = await listLiveActivities();
  await Promise.all(
    activites.filter((a) => estUnApercu(a.orderId)).map((a) => endLiveActivity(a.activityId)),
  );
}
