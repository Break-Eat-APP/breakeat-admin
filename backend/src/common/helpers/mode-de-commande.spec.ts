import { EventStatus } from '@prisma/client';
import { modeDeCommande } from './mode-de-commande';
import type { EvenementCommandable } from './fenetre-commande';

/**
 * PAR OÙ PASSE LA COMMANDE D'UN LIEU — la règle, et elle est unique.
 *
 * Elle était écrite à TROIS endroits qui ne disaient pas la même chose : le
 * calendrier, le panier, et l'application. Les deux travers opposés tombaient
 * sur un club en pleine bascule —
 *
 *   · un lieu basculé sans lien utilisable n'avait PLUS AUCUN bouton, ni
 *     Flaix ni Break Eat : le supporter arrivait et ne pouvait rien
 *     commander ;
 *   · une vieille adresse laissée sur un match joué six mois plus tôt
 *     suffisait à faire refuser un panier Break Eat.
 *
 * Ces tests sont la règle. Si l'un d'eux change, c'est une décision métier,
 * pas un détail d'implémentation.
 */
describe('le mode de commande d’un lieu', () => {
  const MAINTENANT = new Date('2026-10-30T20:00:00Z');
  const REGLAGE = { heure: '08:00', timezone: 'Europe/Paris' };
  const HEURE = 3_600_000;

  const match = (over: Partial<EvenementCommandable> = {}): EvenementCommandable => ({
    id: 'm-1',
    name: 'Match',
    // En cours : commencé il y a une heure, fini dans deux.
    startAt: new Date(MAINTENANT.getTime() - HEURE),
    endAt: new Date(MAINTENANT.getTime() + 2 * HEURE),
    status: EventStatus.ACTIVE,
    isPermanentContainer: false,
    flaixOrderUrl: 'https://commande.flaix.bo.synertic.net/c/m1',
    ...over,
  });

  const mode = (flaixEnabled: boolean, evenements: EvenementCommandable[]) =>
    modeDeCommande({ flaixEnabled }, evenements, MAINTENANT, REGLAGE);

  it('un lieu NON basculé reste sur Break Eat, quoi qu’il porte', () => {
    expect(mode(false, [match()])).toBe('break-eat');
    expect(mode(false, [])).toBe('break-eat');
  });

  it('une rencontre ouverte chez Flaix : c’est Flaix qui vend', () => {
    expect(mode(true, [match()])).toBe('flaix');
  });

  /**
   * Une ouverture est RÉELLEMENT prévue — un match à venir porte son lien. Le
   * lieu est donc bien passé à Flaix, et fermé en attendant. Surtout pas
   * rabattu sur Break Eat, qui vendrait une carte que le club ne tient plus.
   */
  it('la commande Flaix ouvre plus tard : FERMÉ, et pas de repli', () => {
    const demain = new Date(MAINTENANT.getTime() + 86_400_000);
    expect(
      mode(true, [
        match({ startAt: demain, endAt: new Date(demain.getTime() + 2 * HEURE) }),
      ]),
    ).toBe('ferme');
  });

  // ─── LE REPLI — ce qui sauve un club en pleine bascule ──────────

  /**
   * Basculé, mais pas encore configuré : aucun lien collé. On ne coupe pas sa
   * vente du soir pour autant.
   */
  it('basculé SANS aucun lien : repli sur Break Eat', () => {
    expect(mode(true, [match({ flaixOrderUrl: null })])).toBe('break-eat');
    expect(mode(true, [])).toBe('break-eat');
  });

  /**
   * LE CAS QUI COUPAIT LA VENTE. Une adresse oubliée sur un match joué il y a
   * six mois ne joint plus rien — elle ne doit donc rien fermer.
   */
  it('le seul lien est sur un match TERMINÉ : repli sur Break Eat', () => {
    const vieux = new Date(MAINTENANT.getTime() - 180 * 86_400_000);
    expect(
      mode(true, [
        match({
          startAt: vieux,
          endAt: new Date(vieux.getTime() + 2 * HEURE),
          status: EventStatus.ENDED,
        }),
      ]),
    ).toBe('break-eat');
  });

  /**
   * `PAUSED` et `CANCELLED` veulent dire STOP, et seul un humain les pose. Un
   * match suspendu ne tient pas le lieu fermé : s'il n'y a rien d'autre, le
   * parcours Break Eat reprend la main.
   */
  it('un match suspendu ou annulé ne retient pas le lieu', () => {
    expect(mode(true, [match({ status: EventStatus.PAUSED })])).toBe('break-eat');
    expect(mode(true, [match({ status: EventStatus.CANCELLED })])).toBe('break-eat');
  });

  /**
   * Un lieu PERMANENT (restaurant) est ouvert en continu : son contenant n'a
   * ni horaire ni fin, et il vend tous les jours.
   */
  it('un lieu ouvert en continu passe par Flaix dès qu’il a son lien', () => {
    expect(mode(true, [match({ isPermanentContainer: true })])).toBe('flaix');
  });

  /**
   * Plusieurs rencontres le même jour : il suffit qu'UNE soit ouverte pour
   * que le lieu soit chez Flaix. C'est le scénario multi-événements.
   */
  it('une seule rencontre ouverte suffit, même parmi des matchs passés', () => {
    const vieux = new Date(MAINTENANT.getTime() - 90 * 86_400_000);
    expect(
      mode(true, [
        match({
          id: 'vieux',
          startAt: vieux,
          endAt: new Date(vieux.getTime() + 2 * HEURE),
          status: EventStatus.ENDED,
        }),
        match({ id: 'en-cours' }),
      ]),
    ).toBe('flaix');
  });
});
