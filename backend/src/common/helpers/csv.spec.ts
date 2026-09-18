import { dateCourte, euros, versCsv } from './csv';

/**
 * Ce qui fait qu'un fichier s'ouvre — ou qu'un club le renvoie en disant que
 * « ça ne marche pas ».
 */
describe('CSV — un fichier qu’Excel sait lire', () => {
  it('sépare par point-virgule, et commence par la marque d’ordre', () => {
    const csv = versCsv(['Nom', 'E-mail'], [['Jo', 'jo@exemple.fr']]);

    // La marque d'ordre : sans elle, Excel lit le fichier dans l'encodage du
    // système et les accents deviennent illisibles.
    expect(csv.startsWith('﻿')).toBe(true);
    // Le point-virgule : Excel en français lit la virgule comme séparateur
    // décimal, et rangerait tout le tableau dans une seule colonne.
    expect(csv).toContain('Nom;E-mail');
    expect(csv).toContain('Jo;jo@exemple.fr');
  });

  it('entoure et double les guillemets d’une valeur qui en contient', () => {
    const csv = versCsv(['Nom'], [['Jo "le grand"']]);
    expect(csv).toContain('"Jo ""le grand"""');
  });

  it('entoure une valeur qui contient le séparateur ou un retour à la ligne', () => {
    const csv = versCsv(['Lieux'], [['Vélodrome ; Annexe'], ['Ligne\nsuivante']]);
    expect(csv).toContain('"Vélodrome ; Annexe"');
    expect(csv).toContain('"Ligne\nsuivante"');
  });

  it('neutralise une valeur qu’un tableur prendrait pour une formule', () => {
    // Le nom vient du client lui-même : quelqu'un peut se nommer « =1+1 », ou
    // pire. La formule s'exécuterait chez celui qui ouvre le fichier, pas chez
    // nous — c'est une injection à part entière.
    const csv = versCsv(['Nom'], [['=1+1'], ['+33 6 12'], ['@quelquun'], ['-5']]);
    expect(csv).toContain(`'=1+1`);
    expect(csv).toContain(`'+33 6 12`);
    expect(csv).toContain(`'@quelquun`);
    expect(csv).toContain(`'-5`);
  });

  it('laisse une valeur ordinaire intacte', () => {
    const csv = versCsv(['Nom'], [['Jo Bricole']]);
    expect(csv).toContain('Jo Bricole');
    expect(csv).not.toContain("'Jo");
  });

  it('écrit vide pour une valeur absente', () => {
    const csv = versCsv(['Nom', 'Téléphone'], [['Jo', null]]);
    expect(csv).toContain('Jo;\r\n');
  });

  it('écrit les montants avec une virgule, et sans symbole', () => {
    // Sans symbole, la colonne reste NUMÉRIQUE, donc sommable par le club.
    expect(euros(1450)).toBe('14,50');
    expect(euros(0)).toBe('0,00');
    expect(euros(7)).toBe('0,07');
  });

  it('écrit les dates à la française', () => {
    expect(dateCourte(new Date('2026-09-18T18:30:00Z'))).toBe('18/09/2026');
  });
});
