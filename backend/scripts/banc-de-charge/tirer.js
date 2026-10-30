/**
 * LE BANC DE CHARGE — trois scénarios, et des chiffres plutôt qu'un avis.
 *
 * « Est-ce que l'application tient 2 000 commandes simultanées ? » ne se
 * répond pas en lisant du code. On le mesure, ou on se tait.
 *
 * Ce banc tire sur une API RÉELLE (locale ou de recette, jamais la
 * production) et rend ce qui compte : le débit, les latences p50/p95/p99, et
 * surtout la RÉPARTITION DES ÉCHECS — un 429 ne dit pas la même chose qu'un
 * 500 ou qu'un délai dépassé.
 *
 * ── LES TROIS SCÉNARIOS ──────────────────────────────────────────────
 *
 *   stade     un stade, N spectateurs qui ouvrent l'app en même temps.
 *             C'est le coup d'envoi : tout le monde arrive à la minute.
 *
 *   tournee   N lieux, trafic réparti sur la soirée. C'est le scénario
 *             « 50 stades le même samedi ».
 *
 *   calendrier  le nouvel écran : on ouvre un lieu et on lit sa saison.
 *             Mesuré à part parce qu'il lit une fiche complète par appel.
 *
 * Usage :
 *   node scripts/banc-de-charge/tirer.js --api http://localhost:3000/api/v1 \
 *        --scenario stade --clients 2000 --duree 60
 */

function argument(nom, defaut) {
  const i = process.argv.indexOf(`--${nom}`);
  return i === -1 ? defaut : process.argv[i + 1];
}
function nombre(nom, defaut) {
  const v = Number(argument(nom, defaut));
  return Number.isFinite(v) && v > 0 ? v : defaut;
}

const API = argument('api', 'http://localhost:3000/api/v1');
const SCENARIO = argument('scenario', 'stade');
const CLIENTS = nombre('clients', 200);
const DUREE = nombre('duree', 30);

// UNE SÉCURITÉ, ET ELLE N'EST PAS DÉCORATIVE. Tirer deux mille requêtes par
// seconde sur la production un soir de match, c'est provoquer soi-même la
// panne qu'on cherche à prévenir.
if (/railway\.app|breakeat-admin-production/.test(API)) {
  console.error(
    "REFUS : cette adresse ressemble à la PRODUCTION.\n" +
      "  Un banc de charge se tire sur une recette ou en local, jamais sur les\n" +
      "  clients. Relancer avec --api http://localhost:3000/api/v1",
  );
  process.exit(1);
}

/** Les mesures brutes — on calcule les percentiles à la fin, pas en route. */
const latences = [];
const issues = new Map();
let enVol = 0;

function noter(code, debutMs) {
  latences.push(Date.now() - debutMs);
  issues.set(code, (issues.get(code) ?? 0) + 1);
}

async function appeler(chemin) {
  const debut = Date.now();
  try {
    const r = await fetch(`${API}${chemin}`, { headers: { accept: 'application/json' } });
    // On consomme le corps : sans cela, on mesure le temps d'en-tête et non
    // celui d'une réponse réellement servie.
    await r.text();
    noter(String(r.status), debut);
  } catch (e) {
    noter(e?.cause?.code ?? 'reseau', debut);
  }
}

/** Ce qu'un client fait, selon le scénario. */
const parcours = {
  // Le coup d'envoi : on cherche son stade, on l'ouvre.
  stade: () => appeler('/public/venues?q=Stade'),
  // La soirée à 50 lieux : chacun cherche le sien.
  tournee: () => appeler(`/public/venues?q=Stade ${1 + Math.floor(Math.random() * 50)}`),
  // L'écran de la saison, fiche par fiche.
  calendrier: () => appeler('/public/venues?lat=43.5&lng=1.5&radiusKm=50'),
  // LE CAS REEL : un supporter DANS le stade. Rayon serre, une poignee de
  // lieux a portee — et non les cinquante du pays. C est ce que l app fait
  // par defaut, et donc le chiffre qui decide.
  proche: () => appeler('/public/venues?lat=43&lng=1&radiusKm=10'),
};

function percentile(tries, p) {
  if (tries.length === 0) return 0;
  const i = Math.min(tries.length - 1, Math.floor((p / 100) * tries.length));
  return tries[i];
}

async function main() {
  const faire = parcours[SCENARIO];
  if (!faire) {
    console.error(`Scénario inconnu : ${SCENARIO}. Au choix : ${Object.keys(parcours).join(', ')}`);
    process.exit(1);
  }

  console.log(
    `Banc « ${SCENARIO} » — ${CLIENTS} client(s) en parallèle, ${DUREE} s, sur ${API}\n`,
  );

  const fin = Date.now() + DUREE * 1000;
  const debut = Date.now();

  // Des clients qui bouclent, et non N requêtes d'un coup : c'est ce que fait
  // une foule — chacun refait un geste dès qu'il a eu sa réponse.
  const clients = Array.from({ length: CLIENTS }, async () => {
    while (Date.now() < fin) {
      enVol += 1;
      await faire();
      enVol -= 1;
    }
  });

  const horloge = setInterval(() => {
    process.stdout.write(
      `\r  ${latences.length} requête(s), ${enVol} en vol, ` +
        `${Math.round(latences.length / ((Date.now() - debut) / 1000))}/s   `,
    );
  }, 1000);

  await Promise.all(clients);
  clearInterval(horloge);

  const secondes = (Date.now() - debut) / 1000;
  latences.sort((a, b) => a - b);

  console.log(`\n\n── Résultat ──────────────────────────────────────────`);
  console.log(`  Requêtes      ${latences.length} en ${secondes.toFixed(1)} s`);
  console.log(`  Débit         ${(latences.length / secondes).toFixed(1)} req/s`);
  console.log(`  Latence p50   ${percentile(latences, 50)} ms`);
  console.log(`  Latence p95   ${percentile(latences, 95)} ms`);
  console.log(`  Latence p99   ${percentile(latences, 99)} ms`);
  console.log(`  Maximum       ${latences[latences.length - 1] ?? 0} ms`);
  console.log(`\n  Réponses :`);
  for (const [code, n] of [...issues].sort((a, b) => b[1] - a[1])) {
    const part = ((n / latences.length) * 100).toFixed(1);
    const sens =
      code === '200'
        ? 'servies'
        : code === '429'
          ? 'REFUSÉES par la limitation'
          : code.startsWith('5')
            ? 'ERREUR SERVEUR'
            : 'autre';
    console.log(`    ${code.padEnd(8)} ${String(n).padStart(7)}  ${part.padStart(5)} %  ${sens}`);
  }

  const servies = issues.get('200') ?? 0;
  if (servies < latences.length) {
    console.log(
      `\n  ⚠️  ${latences.length - servies} requête(s) non servies. Un chiffre de` +
        ` débit ne vaut rien sans celui-là.`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
