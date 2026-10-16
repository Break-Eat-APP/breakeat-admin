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
}

export interface AlerteLien {
  type: 'lien-partage' | 'chevauchement';
  /** Les matchs concernés, pour les mettre en évidence dans la liste. */
  ids: string[];
  message: string;
}

/** Un lien vide n'est pas une saisie : on ne l'analyse pas. */
function renseigne(url: string): boolean {
  return url.trim().length > 0;
}

export function alertesDeSaisie(matchs: readonly MatchAVerifier[]): AlerteLien[] {
  const alertes: AlerteLien[] = [];
  const avecLien = matchs.filter((m) => renseigne(m.url));

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
