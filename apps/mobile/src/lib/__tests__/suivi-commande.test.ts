/**
 * Ce que la pastille centrale affiche.
 *
 * Elle est sur TOUS les écrans : un anneau vert sur une commande qui n'est pas
 * prête enverrait le client au comptoir pour rien, en plein match.
 */
import {
  DUREE_FIN_MS,
  etatPastille,
  expirationEtat,
  type CommandeSuivie,
} from '../suivi-commande';

const MAINTENANT = Date.parse('2026-09-21T20:00:00Z');
const ilYa = (minutes: number) => new Date(MAINTENANT - minutes * 60_000).toISOString();

function commande(status: string, extra: Partial<CommandeSuivie> = {}): CommandeSuivie {
  return { status, createdAt: ilYa(30), updatedAt: ilYa(1), paymentStatus: 'SUCCEEDED', ...extra };
}

describe('etatPastille', () => {
  it('au repos sans aucune commande', () => {
    expect(etatPastille([], MAINTENANT)).toBe('repos');
  });

  it('suit chaque étape du parcours', () => {
    expect(etatPastille([commande('PAID')], MAINTENANT)).toBe('recue');
    expect(etatPastille([commande('ACCEPTED')], MAINTENANT)).toBe('recue');
    expect(etatPastille([commande('PREPARING')], MAINTENANT)).toBe('preparation');
    expect(etatPastille([commande('READY')], MAINTENANT)).toBe('prete');
    expect(etatPastille([commande('PICKED_UP')], MAINTENANT)).toBe('recuperee');
    expect(etatPastille([commande('COMPLETED')], MAINTENANT)).toBe('recuperee');
  });

  it('deux commandes en cours : suit la PLUS AVANCÉE, quel que soit l’ordre', () => {
    const nord = commande('PAID');
    const sud = commande('READY');
    expect(etatPastille([nord, sud], MAINTENANT)).toBe('prete');
    expect(etatPastille([sud, nord], MAINTENANT)).toBe('prete');
  });

  it('une commande en cours l’emporte sur une commande récupérée à l’instant', () => {
    // Sinon le ✓ ferait croire que tout est fini alors qu'une autre attend.
    const finie = commande('PICKED_UP', { updatedAt: ilYa(0) });
    expect(etatPastille([finie, commande('PREPARING')], MAINTENANT)).toBe('preparation');
  });

  it('le ✓ disparaît au bout de dix minutes', () => {
    const minutes = DUREE_FIN_MS / 60_000;
    expect(etatPastille([commande('PICKED_UP', { updatedAt: ilYa(minutes - 1) })], MAINTENANT)).toBe('recuperee');
    expect(etatPastille([commande('PICKED_UP', { updatedAt: ilYa(minutes + 1) })], MAINTENANT)).toBe('repos');
  });

  it('remboursée en totalité : bleu', () => {
    expect(etatPastille([commande('CANCELLED', { paymentStatus: 'REFUNDED' })], MAINTENANT)).toBe('remboursee');
    // Récupérée PUIS remboursée en totalité : c'est le remboursement qui compte.
    expect(etatPastille([commande('PICKED_UP', { paymentStatus: 'REFUNDED' })], MAINTENANT)).toBe('remboursee');
  });

  it('un remboursement PARTIEL ne fait pas passer au bleu', () => {
    // Un produit manquant remboursé : le reste de la commande est servi.
    expect(etatPastille([commande('PREPARING', { paymentStatus: 'PARTIALLY_REFUNDED' })], MAINTENANT)).toBe('preparation');
    expect(etatPastille([commande('PICKED_UP', { paymentStatus: 'PARTIALLY_REFUNDED' })], MAINTENANT)).toBe('recuperee');
  });

  it('une annulation SANS remboursement ne s’affiche pas', () => {
    expect(etatPastille([commande('CANCELLED')], MAINTENANT)).toBe('repos');
  });

  it('parmi les commandes terminées, seule la plus récente compte', () => {
    const remboursee = commande('CANCELLED', { paymentStatus: 'REFUNDED', updatedAt: ilYa(5) });
    const recuperee = commande('PICKED_UP', { updatedAt: ilYa(1) });
    expect(etatPastille([remboursee, recuperee], MAINTENANT)).toBe('recuperee');
  });

  it('retombe sur la date de création si l’API ne donne pas de mise à jour', () => {
    const c: CommandeSuivie = { status: 'PICKED_UP', createdAt: ilYa(2) };
    expect(etatPastille([c], MAINTENANT)).toBe('recuperee');
  });
});

describe('expirationEtat', () => {
  it('rien à expirer pendant une commande en cours', () => {
    expect(expirationEtat([commande('READY')], MAINTENANT)).toBeNull();
  });

  it('le ✓ expire dix minutes après la récupération', () => {
    const c = commande('PICKED_UP', { updatedAt: ilYa(4) });
    expect(expirationEtat([c], MAINTENANT)).toBe(6 * 60_000);
  });
});
