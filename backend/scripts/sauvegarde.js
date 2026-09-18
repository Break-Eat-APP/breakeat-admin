/**
 * Une sauvegarde complète de la base, dans un fichier.
 *
 * Écrit parce que Railway ne sauvegarde PAS automatiquement sur l'offre
 * actuelle : au 18/09/2026, l'onglet Backups affiche « No backup schedule », et
 * la seule copie existante datait de 27 jours — prise par Railway pour sa
 * propre maintenance, pas pour nous.
 *
 * Ce que ça protège : la perte, qui est irréversible. Une migration qui tourne
 * mal, une fausse manipulation, un incident chez l'hébergeur. Aucune ligne de
 * code ne rattrape une base disparue.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * USAGE
 *
 *   Poser l'adresse de la base dans l'environnement, puis lancer :
 *
 *     node scripts/sauvegarde.js
 *     node scripts/sauvegarde.js C:/chemin/vers/le/dossier
 *
 *   L'adresse se copie depuis Railway → service Postgres → Variables →
 *   `DATABASE_URL`. Elle NE DOIT JAMAIS être écrite dans un fichier du dépôt,
 *   ni collée dans une conversation : elle donne un accès complet aux données.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE LA SAUVEGARDE VAUT
 *
 * Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : c'est un
 * fichier. La restauration se lit en bas de ce fichier, et mérite d'être
 * essayée UNE fois, sur une base d'essai, avant d'en avoir besoin.
 */

const { spawnSync } = require('child_process');
const { existsSync, statSync, mkdirSync } = require('fs');
const path = require('path');

const adresse = process.env.DATABASE_URL;
if (!adresse) {
  console.error(
    'DATABASE_URL absente.\n\n' +
      "  L'adresse se copie depuis Railway → service Postgres → Variables.\n" +
      '  Sous PowerShell :   $env:DATABASE_URL = "postgresql://..."\n' +
      '  Puis :              node scripts/sauvegarde.js\n',
  );
  process.exit(1);
}

const dossier = process.argv[2] || path.join(process.cwd(), 'sauvegardes');
if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true });

// Horodatage triable, et lisible sans décoder : 2026-09-19_0142.
const maintenant = new Date();
const deuxChiffres = (n) => String(n).padStart(2, '0');
const horodatage =
  `${maintenant.getFullYear()}-${deuxChiffres(maintenant.getMonth() + 1)}-` +
  `${deuxChiffres(maintenant.getDate())}_${deuxChiffres(maintenant.getHours())}` +
  `${deuxChiffres(maintenant.getMinutes())}`;
const fichier = path.join(dossier, `breakeat_${horodatage}.dump`);

/**
 * Format « custom » plutôt que du SQL brut : il se restaure table par table si
 * besoin, il est compressé, et `pg_restore` sait le relire même sur une version
 * de PostgreSQL plus récente.
 */
const arguments_ = ['--format=custom', '--no-owner', '--no-privileges', `--file=${fichier}`, adresse];

console.log(`Sauvegarde en cours → ${fichier}`);
let resultat = spawnSync('pg_dump', arguments_, { stdio: ['ignore', 'inherit', 'inherit'] });

/**
 * `pg_dump` absent : on va le chercher dans Docker plutôt que de renvoyer
 * l'utilisateur vers une installation.
 *
 * Une sauvegarde remise à plus tard n'existe pas. Si Docker tourne — et il
 * tourne déjà ici, pour la base d'essai — la machine a tout ce qu'il faut.
 */
if (resultat.error && resultat.error.code === 'ENOENT') {
  console.log('  pg_dump absent sur la machine — on passe par Docker.');

  // Depuis un conteneur, `localhost` désigne le conteneur LUI-MÊME : une base
  // locale ne s'atteint que par `host.docker.internal`. Sans cette traduction,
  // sauvegarder une base d'essai échouerait sans dire pourquoi.
  const adresseDepuisConteneur = adresse
    .replace('@localhost:', '@host.docker.internal:')
    .replace('@127.0.0.1:', '@host.docker.internal:');

  resultat = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${dossier.split(path.sep).join('/')}:/sortie`,
      'postgres:16',
      'pg_dump',
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      `--file=/sortie/${path.basename(fichier)}`,
      adresseDepuisConteneur,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
}

if (resultat.error && resultat.error.code === 'ENOENT') {
  console.error(
    '\nNi `pg_dump` ni Docker ne répondent sur cette machine.\n\n' +
      '  Démarrer Docker Desktop, ou installer les outils clients PostgreSQL\n' +
      '  (postgresql.org/download), puis relancer.\n',
  );
  process.exit(1);
}

if (resultat.status !== 0) {
  console.error('\nLa sauvegarde a ÉCHOUÉ. Rien ne garantit le fichier produit — ne pas s’y fier.');
  process.exit(resultat.status || 1);
}

// Un fichier vide serait le pire des cas : une sauvegarde qui rassure et ne
// contient rien. On vérifie donc qu'il pèse quelque chose.
const taille = existsSync(fichier) ? statSync(fichier).size : 0;
if (taille < 1024) {
  console.error(`\nLe fichier ne pèse que ${taille} octets : ce n’est pas une sauvegarde valable.`);
  process.exit(1);
}

const mo = (taille / (1024 * 1024)).toFixed(1);
console.log(`\n✓ Sauvegarde terminée — ${mo} Mo`);
console.log(`  ${fichier}`);
console.log(
  '\n  À GARDER AILLEURS que sur cette machine : une sauvegarde posée à côté de\n' +
    '  ce qu’elle protège disparaît avec lui.\n' +
    '\n  Pour restaurer, sur une base VIDE :\n' +
    `    pg_restore --clean --if-exists --no-owner --dbname="<adresse>" "${fichier}"\n`,
);
