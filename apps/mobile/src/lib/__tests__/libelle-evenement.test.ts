import { dateEtHeure, titreEvenement } from '../libelle-evenement';

/**
 * Le titre se trompe SANS LEVER D'ERREUR. Il affiche simplement « Marseille vs
 * Monaco – Monaco » sur l'accueil de tous les clients, et personne ne le
 * remarque avant qu'un club ne le signale.
 */
describe('titreEvenement', () => {
  it('garde le nom seul quand l’adversaire y est déjà', () => {
    expect(titreEvenement({ name: 'Marseille vs Monaco', opponentName: 'Monaco' })).toBe(
      'Marseille vs Monaco',
    );
  });

  it('ajoute l’adversaire quand le nom ne le dit pas', () => {
    expect(titreEvenement({ name: 'Match de gala', opponentName: 'Racing 92' })).toBe(
      'Match de gala – Racing 92',
    );
  });

  it('IGNORE LES ACCENTS pour comparer — et les garde pour afficher', () => {
    // Un club écrit « Besiktas » dans un champ et « Beşiktaş » dans l'autre.
    // Comparer les chaînes telles quelles donnerait
    // « Marseille vs Besiktas – Beşiktaş ».
    expect(titreEvenement({ name: 'Marseille vs Besiktas', opponentName: 'Beşiktaş' })).toBe(
      'Marseille vs Besiktas',
    );
    // Et dans l'autre sens, l'accent du nom affiché n'est pas abîmé.
    expect(titreEvenement({ name: 'Finale à Bercy', opponentName: 'Racing' })).toBe(
      'Finale à Bercy – Racing',
    );
  });

  it('ignore la casse', () => {
    expect(titreEvenement({ name: 'OM vs PSG', opponentName: 'psg' })).toBe('OM vs PSG');
  });

  it('se contente du nom sans adversaire — le cas d’un concert', () => {
    expect(titreEvenement({ name: 'Concert Marina Kaye' })).toBe('Concert Marina Kaye');
    expect(titreEvenement({ name: 'Concert', opponentName: null })).toBe('Concert');
    // Un adversaire fait d'espaces n'est pas un adversaire : colle tel quel,
    // il donnerait « Concert – ».
    expect(titreEvenement({ name: 'Concert', opponentName: '   ' })).toBe('Concert');
  });

  it('nettoie les espaces du nom', () => {
    expect(titreEvenement({ name: '  Match de gala  ', opponentName: 'Racing' })).toBe(
      'Match de gala – Racing',
    );
  });
});

describe('dateEtHeure', () => {
  it('écrit le jour court puis l’heure en HH:MM', () => {
    // 14 novembre 2026 à 21:00, heure de Paris (UTC+1 en novembre).
    const texte = dateEtHeure('2026-11-14T20:00:00.000Z');
    expect(texte).toContain('14');
    expect(texte).toContain('·');
    expect(texte).toMatch(/\d{2}:\d{2}$/);
  });

  it('garde le ZÉRO DE TÊTE — « 08:30 », jamais « 8:30 »', () => {
    // On hésite une demi-seconde entre 8 h du matin et 8 h du soir ; le zéro
    // lève le doute sans y penser. C'est la forme déjà retenue ailleurs pour
    // l'ouverture de la commande.
    expect(dateEtHeure('2026-11-14T07:30:00.000Z')).toMatch(/\b08:30$/);
  });

  it('N’ÉCRIT PAS L’ANNÉE', () => {
    // La section ne montre que les prochains événements : « 2026 » sur chaque
    // ligne occuperait de la place pour une information que personne ne
    // cherche.
    expect(dateEtHeure('2026-11-14T20:00:00.000Z')).not.toContain('2026');
  });
});
