/**
 * Un fichier CSV qui s'ouvre correctement dans Excel, en français.
 *
 * Trois détails font la différence entre un fichier exploitable et un fichier
 * que le club renvoie en disant « ça ne marche pas » :
 *
 *  1. le SÉPARATEUR est le point-virgule. Excel en version française lit la
 *     virgule comme un séparateur décimal : avec des virgules, tout le tableau
 *     atterrit dans une seule colonne ;
 *  2. le fichier commence par une MARQUE D'ORDRE (BOM) UTF-8. Sans elle, Excel
 *     lit le fichier dans l'encodage du système et les accents deviennent des
 *     caractères illisibles — sur un fichier de noms de clients, c'est
 *     rédhibitoire ;
 *  3. les fins de ligne sont en CRLF, ce qu'attendent les tableurs Windows.
 */

/** Sépare les colonnes. Point-virgule, et non virgule — voir l'en-tête. */
const SEPARATEUR = ';';

/**
 * Neutralise une valeur qu'un tableur prendrait pour une formule.
 *
 * Une cellule commençant par `=`, `+`, `-` ou `@` est exécutée à l'ouverture
 * par Excel et LibreOffice. Comme ces fichiers contiennent des noms choisis par
 * les clients eux-mêmes, quelqu'un pourrait se nommer `=1+1` — ou pire, une
 * formule qui appelle une commande. On préfixe donc d'une apostrophe, que le
 * tableur retire à l'affichage.
 *
 * C'est une injection à part entière : elle ne traverse pas notre code, elle
 * s'exécute chez celui qui ouvre le fichier.
 */
function neutraliserFormule(texte: string): string {
  return /^[=+\-@\t\r]/.test(texte) ? `'${texte}` : texte;
}

/** Échappe une cellule : guillemets doublés, et entourée si nécessaire. */
function cellule(valeur: string | number | null | undefined): string {
  if (valeur === null || valeur === undefined) return '';
  const texte = neutraliserFormule(String(valeur));
  const aBesoinDeGuillemets = /[";\r\n]/.test(texte);
  return aBesoinDeGuillemets ? `"${texte.replace(/"/g, '""')}"` : texte;
}

/** Assemble un tableau complet, prêt à être servi ou enregistré. */
export function versCsv(
  entetes: string[],
  lignes: Array<Array<string | number | null | undefined>>,
): string {
  const corps = [entetes, ...lignes]
    .map((ligne) => ligne.map(cellule).join(SEPARATEUR))
    .join('\r\n');
  // La marque d'ordre, sans laquelle Excel abîme les accents.
  return `﻿${corps}\r\n`;
}

/**
 * Un montant en centimes, écrit comme un tableur français l'attend.
 *
 * Virgule décimale et pas de symbole : la colonne reste NUMÉRIQUE, donc
 * sommable. « 12,50 € » serait du texte, et le club ne pourrait pas en faire un
 * total.
 */
export function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** Une date lisible, et triable : `JJ/MM/AAAA`. */
export function dateCourte(date: Date, fuseau = 'Europe/Paris'): string {
  return date.toLocaleDateString('fr-FR', { timeZone: fuseau });
}
