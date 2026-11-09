/**
 * UN CACHE DE QUELQUES SECONDES, POUR LES LECTURES QUE TOUT LE MONDE FAIT.
 *
 * Le banc de charge (`scripts/banc-de-charge`) l'a mesuré : la découverte des
 * lieux plafonne à ~45 requêtes par seconde et par instance, parce que CHAQUE
 * requête relit en base les lieux et leurs matchs de la saison. Or au coup
 * d'envoi, des milliers de supporters demandent la MÊME chose au même moment.
 * Mille lectures identiques en base pour une réponse qui n'a pas changé, c'est
 * le mur.
 *
 * Ce cache garde la lecture quelques secondes, et — c'est le plus important —
 * FAIT ATTENDRE LES REQUÊTES SIMULTANÉES SUR LA MÊME LECTURE au lieu d'en lancer
 * une chacune : cent requêtes qui arrivent ensemble ne coûtent qu'un aller-retour
 * en base.
 *
 * CE QU'IL NE FAIT PAS, ET NE DOIT PAS FAIRE :
 *  · garder une réponse PERSONNALISÉE. On n'y met que la lecture brute, la même
 *    pour tous ; la personnalisation (identité dans le lien Flaix, événements
 *    privés, distance) se refait à chaque requête, sur une copie ;
 *  · garder un ÉCHEC. Une lecture qui a échoué est oubliée aussitôt : la
 *    suivante réessaie, au lieu de servir l'erreur pendant toute la durée ;
 *  · grandir sans fin. Au-delà de `maxEntrees`, les entrées expirées partent,
 *    puis les plus anciennes.
 *
 * Il vit dans la mémoire de CHAQUE instance : deux instances ont chacune le
 * leur, et une modification faite dans l'admin apparaît partout au plus tard
 * après `ttlMs`.
 */
export class CacheCourt<T> {
  private readonly entrees = new Map<string, { expire: number; valeur: Promise<T> }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntrees = 500,
    private readonly horloge: () => number = Date.now,
  ) {}

  /** La valeur en cache pour `cle`, ou celle que `charger` rend — une seule fois pour tous. */
  obtenir(cle: string, charger: () => Promise<T>): Promise<T> {
    // Durée nulle : le cache est éteint (tests d'intégration, ou réglage).
    if (this.ttlMs <= 0) return charger();

    const maintenant = this.horloge();
    const existante = this.entrees.get(cle);
    if (existante && existante.expire > maintenant) return existante.valeur;

    const valeur = charger();
    this.entrees.set(cle, { expire: maintenant + this.ttlMs, valeur });
    // Un échec n'est pas une réponse : on l'oublie pour que la suite réessaie.
    valeur.catch(() => {
      if (this.entrees.get(cle)?.valeur === valeur) this.entrees.delete(cle);
    });
    this.elaguer(maintenant);
    return valeur;
  }

  /** Oublie tout — utile quand une écriture doit se voir tout de suite. */
  vider(): void {
    this.entrees.clear();
  }

  get taille(): number {
    return this.entrees.size;
  }

  private elaguer(maintenant: number): void {
    if (this.entrees.size <= this.maxEntrees) return;
    for (const [cle, e] of this.entrees) if (e.expire <= maintenant) this.entrees.delete(cle);
    // Toujours trop : les plus anciennes d'abord (une Map garde l'ordre d'insertion).
    for (const cle of this.entrees.keys()) {
      if (this.entrees.size <= this.maxEntrees) break;
      this.entrees.delete(cle);
    }
  }
}

/**
 * La durée du cache des lectures publiques, en millisecondes.
 *
 * 15 secondes par défaut : assez pour qu'une foule ne lise la base qu'une fois
 * toutes les quinze secondes, assez court pour qu'un lien Flaix corrigé dans
 * l'admin se voie dans l'app avant que le client ait fini de le chercher.
 * RÉGLABLE SANS REDÉPLOYER (`CACHE_LIEUX_MS`) ; `0` l'éteint. Une valeur
 * illisible ou négative retombe sur le défaut.
 */
export const CACHE_LIEUX_MS_DEFAUT = 15_000;
export function dureeCacheLieux(brut = process.env.CACHE_LIEUX_MS): number {
  if (brut === undefined || brut.trim() === '') return CACHE_LIEUX_MS_DEFAUT;
  const n = Number(brut);
  return Number.isFinite(n) && n >= 0 ? n : CACHE_LIEUX_MS_DEFAUT;
}
