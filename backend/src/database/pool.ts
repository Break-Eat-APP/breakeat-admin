/**
 * LE POOL DE CONNEXIONS, DÉCIDÉ ICI PLUTÔT QUE DEVINÉ AILLEURS.
 *
 * `new PrismaClient()` sans option laisse Prisma choisir :
 * **`nombre_de_cœurs × 2 + 1`**.
 *
 * Ce n'est pas une mauvaise valeur, c'est une valeur **imprévisible**. Dans un
 * conteneur, le nombre de cœurs rapporté est souvent celui de la machine
 * hôte, pas celui alloué au service. La même image peut donc ouvrir 9
 * connexions sur un hôte et 33 sur un autre, sans qu'une ligne de code ait
 * changé.
 *
 * Multiplié par le nombre d'instances, cela devient le genre de panne qui
 * arrive un soir de gros match : on ajoute un replica pour encaisser
 * l'affluence, et c'est précisément ce replica qui épuise les connexions de
 * la base. L'API répond « too many connections » alors que le processeur
 * s'ennuie.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI 10 PAR INSTANCE
 *
 * Node exécute un seul fil : la concurrence vient des entrées-sorties, pas du
 * parallélisme. Dix connexions suffisent à un débit confortable — au-delà,
 * on ne gagne presque rien et on consomme une ressource rare.
 *
 * Avec trois instances, cela fait 30 connexions, plus celles des migrations
 * au démarrage et de la sauvegarde nocturne. On reste loin du plafond d'une
 * base modeste (100), avec de la marge pour un quatrième replica un soir de
 * pointe.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * L'EXPLOITANT GARDE LE DERNIER MOT
 *
 * Tout paramètre déjà présent dans `DATABASE_URL` est respecté : poser
 * `?connection_limit=25` dans Railway l'emporte sur ce fichier. On ne force
 * rien — on remplit ce qui n'a pas été dit, et on le journalise pour que la
 * valeur retenue se lise au démarrage plutôt que de se déduire d'une panne.
 */

/** Connexions ouvertes par instance. Voir le raisonnement ci-dessus. */
export const CONNEXIONS_PAR_INSTANCE = 10;

/**
 * Attente maximale d'une connexion libre, en secondes.
 *
 * Au-delà, la requête échoue plutôt que de retenir le client indéfiniment.
 * Dix secondes : assez pour absorber une pointe, assez peu pour qu'un client
 * bloqué reçoive une erreur plutôt qu'une page qui tourne.
 */
export const ATTENTE_POOL = 10;

/** Attente maximale pour ÉTABLIR une connexion, en secondes. */
export const ATTENTE_CONNEXION = 10;

/**
 * L'adresse de la base, complétée de notre stratégie de pool.
 *
 * Rend `undefined` si aucune adresse n'est posée — Prisma lèvera alors sa
 * propre erreur, bien plus parlante que tout ce qu'on écrirait ici.
 */
export function adresseAvecPool(brute: string | undefined): string | undefined {
  if (!brute) return undefined;

  let u: URL;
  try {
    u = new URL(brute);
  } catch {
    // Adresse non standard : on la passe telle quelle plutôt que de la
    // mutiler. Mieux vaut un pool par défaut qu'une base injoignable.
    return brute;
  }

  const defauts: Array<[string, string]> = [
    ['connection_limit', String(CONNEXIONS_PAR_INSTANCE)],
    ['pool_timeout', String(ATTENTE_POOL)],
    ['connect_timeout', String(ATTENTE_CONNEXION)],
  ];
  for (const [cle, valeur] of defauts) {
    if (!u.searchParams.has(cle)) u.searchParams.set(cle, valeur);
  }
  return u.toString();
}

/**
 * Ce qui sera réellement appliqué, pour le journal de démarrage.
 *
 * Sans l'adresse ni le mot de passe : cette ligne part dans les journaux, et
 * une adresse de base y donnerait un accès complet aux données.
 */
export function resumePool(brute: string | undefined): string {
  if (!brute) return 'aucune adresse de base';
  try {
    const u = new URL(adresseAvecPool(brute) as string);
    const lire = (c: string) => u.searchParams.get(c) ?? '(défaut Prisma)';
    return (
      `connexions ${lire('connection_limit')} par instance, ` +
      `attente pool ${lire('pool_timeout')}s, ` +
      `connexion ${lire('connect_timeout')}s`
    );
  } catch {
    return 'adresse non standard — pool laissé au défaut de Prisma';
  }
}
