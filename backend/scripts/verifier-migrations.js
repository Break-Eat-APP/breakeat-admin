/**
 * REJOUE TOUTES LES MIGRATIONS SUR UNE BASE VIERGE, puis jette la base.
 *
 * Écrit le 25/10/2026, au lendemain de deux jours d'arrêt. La migration
 * `20261023_note_de_commande` déclarait ses identifiants en TEXT alors que
 * cette base les déclare en UUID ; Postgres a refusé la clé étrangère, et
 * Prisma a bloqué TOUTES les migrations suivantes. Trois jours de travail
 * sont restés derrière ce seul fichier.
 *
 * Rien dans le code ne pouvait le voir : le schéma Prisma était valide, la
 * compilation passait, les tests — qui doublent la base — ne touchaient pas
 * une seule colonne réelle. Seul un vrai Postgres le dit.
 *
 * Ça prend vingt secondes. Ça aurait évité deux jours.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *   pnpm db:verifier
 *
 * À lancer AVANT de pousser toute migration écrite à la main. La CI le fait
 * aussi (`Tests d'integration`), mais elle le dit après le push — et une
 * migration fautive bloque alors la file entière.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const CONTENEUR = `breakeat-verif-${process.pid}`;
// La MEME version majeure que la production. Verifier sur 16 ce qui tournera
// sur 18 laisserait passer exactement le genre d'ecart qu'on cherche ici.
const IMAGE = 'postgres:18-alpine';

const executer = (commande, args, options = {}) =>
  spawnSync(commande, args, { encoding: 'utf8', ...options });

function nettoyer() {
  executer('docker', ['rm', '-f', CONTENEUR], { stdio: 'ignore' });
}

// Un conteneur oublié garde un port et de la mémoire. On le retire quoi qu'il
// arrive — y compris sur Ctrl-C, qui ne passe pas par la fin du script.
process.on('SIGINT', () => {
  nettoyer();
  process.exit(130);
});

const docker = executer('docker', ['info']);
if (docker.status !== 0) {
  console.error(
    'Docker ne répond pas.\n\n' +
      '  Démarrer Docker Desktop, puis relancer `pnpm db:verifier`.\n' +
      "  Sans lui, cette vérification ne peut pas s'exécuter — et une migration\n" +
      '  écrite à la main ne devrait pas partir sans elle.\n',
  );
  process.exit(1);
}

console.log(`Base d'essai (${IMAGE})…`);
// Port laissé au choix de Docker : une base de développement occupe souvent
// 5432, et échouer là-dessus serait absurde.
const lancement = executer('docker', [
  'run', '-d', '--name', CONTENEUR,
  '-e', 'POSTGRES_PASSWORD=verif',
  '-e', 'POSTGRES_DB=verif',
  '-p', '0:5432',
  IMAGE,
]);
if (lancement.status !== 0) {
  console.error(`Le conteneur n'a pas démarré :\n${lancement.stderr}`);
  nettoyer();
  process.exit(1);
}

const liaison = executer('docker', ['port', CONTENEUR, '5432/tcp']).stdout || '';
const port = liaison.trim().split('\n')[0]?.split(':').pop();
if (!port) {
  console.error("Impossible de lire le port attribué au conteneur.");
  nettoyer();
  process.exit(1);
}

// Les migrations partiraient avant que Postgres accepte les connexions, et
// l'échec ressemblerait à une migration fautive.
let pret = false;
for (let i = 0; i < 60; i += 1) {
  if (executer('docker', ['exec', CONTENEUR, 'pg_isready', '-U', 'postgres', '-q']).status === 0) {
    pret = true;
    break;
  }
  // Attente synchrone sans processus externe ni shell.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
if (!pret) {
  console.error("Postgres n'a jamais répondu dans le conteneur.");
  nettoyer();
  process.exit(1);
}

console.log(`Rejeu de toutes les migrations sur le port ${port}…\n`);
/**
 * On appelle le JavaScript de Prisma avec le Node courant, jamais le lanceur
 * de `node_modules/.bin`.
 *
 * Depuis la CVE-2024-27980, Node refuse de lancer un `.cmd` sans `shell:
 * true` et rend EINVAL. Ce refus a d'abord ete pris ici pour une migration
 * fautive : le script echouait sur un depot SAIN — le pire des gardes, celui
 * qui crie au loup. Passer par le fichier d'entree evite le lanceur, le
 * shell, et la difference entre plateformes.
 */
const prisma = path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
const migration = executer(process.execPath, [prisma, 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: `postgresql://postgres:verif@localhost:${port}/verif?schema=public`,
  },
});

nettoyer();

/**
 * Un lancement rate n'est PAS une migration fautive, et les confondre coute
 * cher : on cherche l'erreur dans le SQL alors qu'elle est dans l'outillage.
 * `status` vaut `null` quand le processus n'a jamais demarre — ce qui est
 * arrive ici meme, le 25/10, avec un `EINVAL` sur le lanceur `.cmd`.
 */
if (migration.error || migration.status === null) {
  const cause = migration.error ? migration.error.code : 'processus jamais demarre';
  console.error('');
  console.error(`Prisma n'a pas pu etre lance : ${cause}`);
  console.error('');
  console.error("  Ce n'est PAS une migration fautive — RIEN n'a ete verifie.");
  console.error('  Essayer `pnpm install` dans `backend/`, puis relancer.');
  console.error('');
  process.exit(1);
}

if (migration.status !== 0) {
  console.error(
    '\n────────────────────────────────────────────────────────────────\n' +
      'UNE MIGRATION NE PASSE PAS. Ne pas pousser.\n\n' +
      "  L'erreur de Postgres est au-dessus, en clair. Les pièges les plus\n" +
      '  fréquents dans ce dépôt :\n\n' +
      '    · un identifiant déclaré TEXT alors que la base le déclare UUID\n' +
      "      (« incompatible types: text and uuid ») — cette base utilise UUID\n" +
      '      partout depuis `20260527_phase5_stripe_connect` ;\n' +
      '    · une contrainte posée sur des données qui ne la respectent pas ;\n' +
      '    · une table ou une colonne référencée avant d\'exister.\n',
  );
  process.exit(migration.status || 1);
}

console.log(
  '\n✓ Toutes les migrations passent sur une base vierge.\n' +
    '  La base d\'essai a été supprimée.\n',
);
