import { EventStatus } from '@prisma/client';
import {
  SAISON_A_VENIR_MAX,
  SAISON_PASSES_MAX,
  saisonDuLieu,
  type EvenementDeSaisonSource,
} from './saison-du-lieu';

/**
 * LA SAISON D'UN LIEU — ce que le calendrier a le droit de montrer.
 *
 * Trois choses se décident ici, et chacune ment si elle se trompe :
 *
 *  · CE QUI EST ÉCARTÉ — un match annulé, le contenant d'un restaurant. Un
 *    match annulé laissé parmi les passés laisse croire qu'il s'est joué ;
 *  · QUELLE CASE EST OUVERTE — la même règle que le bouton « Commander ». Un
 *    calendrier qui cercle un match dont le bouton refuse, c'est la panne du
 *    10/10 en pire : la promesse est à l'écran, le refus est au doigt ;
 *  · OÙ ON COUPE — garder les matchs d'il y a trois ans et jeter ceux du mois
 *    dernier serait le pire des deux.
 */
describe('la saison d’un lieu', () => {
  /**
   * QUI EST OUVERT — une décision par événement, et non plus un identifiant.
   *
   * Un lieu pouvait n'ouvrir qu'une rencontre à la fois. Deux épreuves le
   * même jour dans le même stade, et la seconde s'affichait au calendrier
   * SANS bouton : visible, et inaccessible.
   */
  const AUCUN = () => false;
  const seul = (id: string) => (ev: { id: string }) => ev.id === id;
  const MAINTENANT = new Date('2026-10-31T12:00:00Z');

  /** Un match, posé à N jours de l'instant de référence. */
  const match = (
    id: string,
    joursDecalage: number,
    extra: Partial<EvenementDeSaisonSource> = {},
  ): EvenementDeSaisonSource => {
    const debut = new Date(MAINTENANT.getTime() + joursDecalage * 86_400_000);
    return {
      id,
      name: `Match ${id}`,
      startAt: debut,
      endAt: new Date(debut.getTime() + 2 * 3_600_000),
      status: EventStatus.ACTIVE,
      ...extra,
    };
  };

  it('range les matchs dans l’ordre du calendrier, passés d’abord', () => {
    const saison = saisonDuLieu([match('c', 7), match('a', -7), match('b', 1)], MAINTENANT, AUCUN);
    expect(saison.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  // ─── Ce qui est ÉCARTÉ ──────────────────────────────────────────

  /**
   * Un match annulé n'a pas de commande à prendre. Et laissé estompé parmi
   * les passés, il laisserait croire qu'il s'est joué.
   */
  it('ÉCARTE un match annulé', () => {
    const saison = saisonDuLieu(
      [match('joue', -2), match('annule', 2, { status: EventStatus.CANCELLED })],
      MAINTENANT,
      AUCUN,
    );
    expect(saison.map((e) => e.id)).toEqual(['joue']);
  });

  /**
   * Le contenant d'un lieu PERMANENT (restaurant) n'est pas un match : ni
   * adversaire, ni fin. Il remplirait le calendrier d'une case vide de sens.
   */
  it('ÉCARTE le contenant d’un lieu ouvert en continu', () => {
    const saison = saisonDuLieu(
      [match('resto', 0, { isPermanentContainer: true })],
      MAINTENANT,
      seul('resto'),
    );
    expect(saison).toEqual([]);
  });

  /**
   * Un match TERMINÉ reste au calendrier, estompé : c'est la mémoire de la
   * saison. Seul `CANCELLED` disparaît — « terminé » et « n'a pas eu lieu »
   * ne disent pas la même chose.
   */
  it('GARDE un match terminé, et le marque passé', () => {
    const saison = saisonDuLieu(
      [match('fini', -3, { status: EventStatus.ENDED })],
      MAINTENANT,
      AUCUN,
    );
    expect(saison).toHaveLength(1);
    expect(saison[0].passe).toBe(true);
  });

  // ─── PASSÉ ou À VENIR ───────────────────────────────────────────

  /**
   * UN MATCH COMMENCÉ N'EST PAS PASSÉ. C'est pendant la rencontre qu'on
   * commande le plus : estomper le match du jour à 15 h couperait la vente
   * au moment où elle compte.
   */
  it('un match EN COURS n’est pas passé', () => {
    const enCours: EvenementDeSaisonSource = {
      ...match('ec', 0),
      startAt: new Date(MAINTENANT.getTime() - 3_600_000),
      endAt: new Date(MAINTENANT.getTime() + 3_600_000),
    };
    const [m] = saisonDuLieu([enCours], MAINTENANT, AUCUN);
    expect(m.passe).toBe(false);
  });

  it('un match fini à la seconde près est passé', () => {
    const fini: EvenementDeSaisonSource = {
      ...match('f', 0),
      startAt: new Date(MAINTENANT.getTime() - 7_200_000),
      endAt: MAINTENANT,
    };
    expect(saisonDuLieu([fini], MAINTENANT, AUCUN)[0].passe).toBe(true);
  });

  // ─── Quelle case est OUVERTE ────────────────────────────────────

  it('marque ouverte LA case que la fenêtre de commande désigne, et elle seule', () => {
    const saison = saisonDuLieu([match('a', -2), match('b', 0), match('c', 5)], MAINTENANT, seul('b'));
    expect(saison.filter((e) => e.ouvert).map((e) => e.id)).toEqual(['b']);
  });

  /**
   * Un lieu Flaix dont la commande ouvre plus tard est FERMÉ. L'appelant
   * passe alors `null` : aucune case ne doit se cercler, sinon le calendrier
   * annonce une commande que le bouton refusera.
   */
  it('n’ouvre AUCUNE case quand rien n’est ouvert', () => {
    const saison = saisonDuLieu([match('a', 1), match('b', 8)], MAINTENANT, AUCUN);
    expect(saison.some((e) => e.ouvert)).toBe(false);
  });

  // ─── L'adversaire ───────────────────────────────────────────────

  it('rend l’adversaire quand il est saisi', () => {
    const [m] = saisonDuLieu(
      [match('a', 1, { opponentName: 'Racing 92', opponentLogoUrl: 'https://x.test/r92.png' })],
      MAINTENANT,
      AUCUN,
    );
    expect(m.opponentName).toBe('Racing 92');
    expect(m.opponentLogoUrl).toBe('https://x.test/r92.png');
  });

  /**
   * Les deux champs sont facultatifs, et `undefined` ne doit pas traverser
   * jusqu'à l'app : `null` est explicite, `undefined` disparaît du JSON et
   * l'app lirait un champ absent.
   */
  it('rend null — jamais undefined — quand l’adversaire n’est pas saisi', () => {
    const [m] = saisonDuLieu([match('a', 1)], MAINTENANT, AUCUN);
    expect(m.opponentName).toBeNull();
    expect(m.opponentLogoUrl).toBeNull();
  });

  // ─── Où on COUPE ────────────────────────────────────────────────

  /**
   * Au bout de trois saisons, un lieu porte des centaines d'événements. On
   * garde les plus RÉCENTS — couper dans l'ordre chronologique garderait les
   * matchs d'il y a trois ans et jetterait ceux du mois dernier.
   */
  it('garde les passés les PLUS RÉCENTS, et les remet dans l’ordre', () => {
    const vieux = Array.from({ length: 20 }, (_, i) => match(`p${i}`, -(i + 1)));
    const saison = saisonDuLieu(vieux, MAINTENANT, AUCUN);

    expect(saison).toHaveLength(SAISON_PASSES_MAX);
    // p0 est le plus récent (hier) : il doit être là, et en DERNIER.
    expect(saison[saison.length - 1].id).toBe('p0');
    expect(saison[0].id).toBe(`p${SAISON_PASSES_MAX - 1}`);
    const dates = saison.map((e) => new Date(e.startAt).getTime());
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
  });

  it('borne aussi les matchs à venir', () => {
    const beaucoup = Array.from({ length: 40 }, (_, i) => match(`v${i}`, i + 1));
    const saison = saisonDuLieu(beaucoup, MAINTENANT, AUCUN);
    expect(saison).toHaveLength(SAISON_A_VENIR_MAX);
    // Les PROCHAINS, pas les plus lointains.
    expect(saison[0].id).toBe('v0');
  });

  /**
   * Le plein des deux côtés : la borne des passés ne doit pas manger celle
   * des matchs à venir. C'est ce qui arriverait avec une seule coupe globale.
   */
  it('les deux bornes sont indépendantes', () => {
    const saison = saisonDuLieu(
      [
        ...Array.from({ length: 20 }, (_, i) => match(`p${i}`, -(i + 1))),
        ...Array.from({ length: 40 }, (_, i) => match(`v${i}`, i + 1)),
      ],
      MAINTENANT,
      AUCUN,
    );
    expect(saison).toHaveLength(SAISON_PASSES_MAX + SAISON_A_VENIR_MAX);
    expect(saison.filter((e) => e.passe)).toHaveLength(SAISON_PASSES_MAX);
  });

  it('un lieu sans aucun événement rend une liste vide, pas une erreur', () => {
    expect(saisonDuLieu([], MAINTENANT, AUCUN)).toEqual([]);
  });
});
