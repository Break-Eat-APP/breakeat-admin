/**
 * CE QUI CLOCHE DANS UNE SAISIE DE LIENS — avant que le public le découvre.
 *
 * On colle vingt liens Flaix d'affilée, en copiant-collant. Deux erreurs
 * passent alors sans bruit, et aucune ne se voit avant le jour du match :
 *
 *  1. LE MÊME LIEN SUR DEUX MATCHS. Le second envoie son public sur la page du
 *     premier. Flaix refusera la commande — sa page est liée à SON match — et
 *     le client lira un refus qu'il ne comprendra pas, sans savoir quoi faire ;
 *  2. DEUX MATCHS QUI SE CHEVAUCHENT sur le même lieu. L'app sert alors celui
 *     qui a commencé le premier, et l'autre reste invisible. Deux matchs qui
 *     s'ENCHAÎNENT ne posent aucun problème (le relais bascule tout seul à la
 *     fin du premier) : seul le vrai chevauchement est signalé.
 *
 * On avertit, on ne refuse pas. Un tournoi de trois jours peut légitimement
 * n'avoir qu'une page de commande, et c'est au club de le savoir — pas à nous
 * de le lui interdire. Mais il doit le VOIR.
 */

export interface MatchAVerifier {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  /** Le lien saisi, tel qu'il est à l'écran (saisie en cours comprise). */
  url: string;
  /** DRAFT, ACTIVE, PAUSED… Seul un match ACTIF ouvre sa commande. */
  status?: string;
}

export interface AlerteLien {
  type: 'lien-partage' | 'chevauchement' | 'pas-actif';
  /** Les matchs concernés, pour les mettre en évidence dans la liste. */
  ids: string[];
  message: string;
}

/** Le statut d'un match, dit comme le club le lit dans sa liste. */
const LIBELLE_STATUT: Record<string, string> = {
  DRAFT: 'brouillon',
  PAUSED: 'suspendu',
  ENDED: 'terminé',
  CANCELLED: 'annulé',
};

/** Un lien vide n'est pas une saisie : on ne l'analyse pas. */
function renseigne(url: string): boolean {
  return url.trim().length > 0;
}

export function alertesDeSaisie(matchs: readonly MatchAVerifier[]): AlerteLien[] {
  const alertes: AlerteLien[] = [];
  const avecLien = matchs.filter((m) => renseigne(m.url));

  // ── 0. Un match qui n'est pas ACTIF n'ouvrira rien.
  //
  // Le cas vécu : un lien collé sur un BROUILLON, un « Liens enregistrés » en
  // vert, et l'application qui répond « aucun événement ouvert ». Tout était
  // correct — sauf que personne ne disait que le match n'était pas publié.
  //
  // On ne refuse pas : coller les liens d'une saison AVANT de publier les
  // matchs est exactement l'usage prévu. On prévient, pour que l'absence
  // d'ouverture le jour J ne soit jamais une surprise.
  const inactifs = avecLien.filter((m) => m.status && m.status !== 'ACTIVE');
  if (inactifs.length > 0) {
    alertes.push({
      type: 'pas-actif',
      ids: inactifs.map((m) => m.id),
      message:
        `${inactifs.length === 1 ? 'Ce match n’est pas actif' : `Ces ${inactifs.length} matchs ne sont pas actifs`} : ` +
        `${inactifs.map((m) => `${m.name} (${LIBELLE_STATUT[m.status as string] ?? m.status})`).join(', ')}. ` +
        `Le lien est bien enregistré, mais l’application n’ouvrira rien tant que le match reste dans cet état. ` +
        `Passe-le en « Actif » dans sa fiche le moment venu.`,
    });
  }

  // ── 1. Le même lien sur plusieurs matchs.
  const parLien = new Map<string, MatchAVerifier[]>();
  for (const m of avecLien) {
    const cle = m.url.trim();
    const liste = parLien.get(cle);
    if (liste) liste.push(m);
    else parLien.set(cle, [m]);
  }
  for (const [, partages] of parLien) {
    if (partages.length < 2) continue;
    alertes.push({
      type: 'lien-partage',
      ids: partages.map((m) => m.id),
      message:
        `Le même lien est collé sur ${partages.length} matchs : ` +
        `${partages.map((m) => m.name).join(', ')}. ` +
        `Chacun doit avoir SON adresse Flaix, sinon le public du second arrive sur la page du premier.`,
    });
  }

  // ── 2. Deux matchs qui se chevauchent VRAIMENT.
  //
  // On compare les horaires des matchs, pas les fenêtres d'ouverture : deux
  // matchs du même jour partagent forcément leur matinée, et c'est normal —
  // le relais bascule du premier au second dès que le premier se termine.
  const tries = [...avecLien].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  for (let i = 0; i < tries.length - 1; i += 1) {
    const a = tries[i];
    const b = tries[i + 1];
    const finA = new Date(a.endAt).getTime();
    const debutB = new Date(b.startAt).getTime();
    if (Number.isNaN(finA) || Number.isNaN(debutB)) continue;
    if (debutB < finA) {
      alertes.push({
        type: 'chevauchement',
        ids: [a.id, b.id],
        message:
          `« ${a.name} » et « ${b.name} » se chevauchent. ` +
          `Pendant ce temps, l'application ouvrira « ${a.name} » — celui qui a commencé le premier.`,
      });
    }
  }

  return alertes;
}
