import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * LES LIEUX FAVORIS, GARDÉS D'UNE OUVERTURE À L'AUTRE.
 *
 * Ils ne vivaient nulle part. Le cœur de l'écran des lieux remplissait un
 * simple `useState`, et tout disparaissait à la fermeture de l'app — le
 * commentaire d'origine le disait, « local pour l'instant, persistance
 * backend à venir », et c'est resté.
 *
 * Tant que personne ne lisait ces favoris, la perte ne se voyait pas : on les
 * reposait en deux touches. Le 06/11/2026, la section « À ne pas manquer » de
 * l'accueil s'est mise à en dépendre — et une section qui se vide à chaque
 * lancement n'existe pas.
 *
 * ── POURQUOI SUR L'APPAREIL, ET PAS SUR LE SERVEUR ───────────────────
 *
 * Un favori côté serveur suivrait le client d'un téléphone à l'autre, et
 * c'est mieux. Mais il demanderait une table, une migration, deux routes —
 * et surtout un COMPTE : or on peut parcourir les lieux sans être connecté,
 * et c'est volontaire. Un favori qui exige de s'inscrire n'est plus un
 * raccourci, c'est un péage.
 *
 * Le stockage local garde donc la fonction utilisable pour tout le monde. La
 * synchronisation entre appareils reste à faire, et se posera le jour où un
 * client en aura deux.
 *
 * ── CE QU'ON GARDE, ET POURQUOI PAS PLUS ─────────────────────────────
 *
 * L'identifiant, le nom et les deux visuels — de quoi dessiner la tuile sans
 * réseau. Rien d'autre : l'heure d'ouverture, le lien du jour et l'événement
 * en cours changent d'une heure à l'autre, et une copie périmée serait pire
 * qu'une absence. Ils se redemandent au serveur à l'ouverture du lieu.
 */

const CLE = 'break_eat_favoris';

export interface LieuFavori {
  id: string;
  name: string;
  photoUrl: string | null;
  imageUrl: string | null;
}

/** Ce qu'on accepte de relire. Un enregistrement abîmé est ignoré, pas jeté. */
function estUnFavori(v: unknown): v is LieuFavori {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && o.id.length > 0 && typeof o.name === 'string';
}

/**
 * Les favoris enregistrés — une liste vide si rien n'a jamais été posé, ou si
 * ce qui l'a été est illisible.
 *
 * ON NE LÈVE JAMAIS. Un stockage corrompu ne doit pas empêcher l'accueil de
 * s'afficher : perdre ses favoris est ennuyeux, ne plus pouvoir commander ne
 * l'est pas du tout.
 */
export async function lireFavoris(): Promise<LieuFavori[]> {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    if (!brut) return [];
    const lu: unknown = JSON.parse(brut);
    if (!Array.isArray(lu)) return [];
    // Chaque entrée est validée séparément : une ligne abîmée ne doit pas
    // emporter les autres.
    return lu.filter(estUnFavori).map((f) => ({
      id: f.id,
      name: f.name,
      photoUrl: typeof f.photoUrl === 'string' ? f.photoUrl : null,
      imageUrl: typeof f.imageUrl === 'string' ? f.imageUrl : null,
    }));
  } catch (e: unknown) {
    console.warn('Favoris illisibles, on repart d’une liste vide :', e);
    return [];
  }
}

/** Enregistre la liste. Un échec se journalise et ne remonte pas à l'écran. */
export async function ecrireFavoris(favoris: readonly LieuFavori[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CLE, JSON.stringify(favoris));
  } catch (e: unknown) {
    console.warn('Favoris non enregistrés :', e);
  }
}
