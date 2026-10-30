/**
 * LE JEU DE DONNÉES DU BANC DE CHARGE.
 *
 * On ne mesure pas une application sur une base vide. Les requêtes qui tiennent
 * à dix lignes s'effondrent à dix mille, et c'est précisément l'écart qu'on
 * cherche à voir — pas à supposer.
 *
 * Ce que ça sème, et pourquoi exactement ça :
 *
 *   · DES LIEUX, autant qu'on en veut. Le scénario « 50 stades » n'a de sens
 *     que si les 50 existent : la recherche publique les parcourt tous ;
 *   · DES SAISONS ENTIÈRES par lieu, et pas seulement les matchs à venir.
 *     C'est le cœur du sujet — `/public/venues` charge TOUS les événements de
 *     chaque lieu, sans borne, à chaque requête. Un club de troisième saison
 *     en porte des centaines. Semer trois matchs par lieu donnerait un banc
 *     flatteur et faux ;
 *   · DES COMPTES, pour le scénario d'inscription.
 *
 * Usage :
 *   DATABASE_URL=… node scripts/banc-de-charge/semer.js --lieux 50 --saisons 3
 */
const { PrismaClient } = require('@prisma/client');
const { exigerBaseJetable } = require('./cible');

function argument(nom, defaut) {
  const i = process.argv.indexOf(`--${nom}`);
  if (i === -1) return defaut;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : defaut;
}

const LIEUX = argument('lieux', 50);
const SAISONS = argument('saisons', 3);
/** Treize matchs à domicile par saison — un championnat de Top 14. */
const MATCHS_PAR_SAISON = argument('matchs', 13);

const prisma = new PrismaClient();

async function main() {
  // AVANT TOUT, ET SANS QUOI RIEN NE PART. Ce script ÉCRIT : une
  // `DATABASE_URL` restée en place dans un terminal, et le semis verse
  // quatre-vingts faux clubs chez de vrais clients. Le garde regarde l'hôte,
  // puis ce que la base CONTIENT — voir `cible.js`.
  await exigerBaseJetable(prisma);

  const total = LIEUX * SAISONS * MATCHS_PAR_SAISON;
  console.log(
    `Semis : ${LIEUX} lieu(x) × ${SAISONS} saison(s) × ${MATCHS_PAR_SAISON} matchs ` +
      `= ${total} événements.`,
  );

  const maintenant = Date.now();
  const JOUR = 86_400_000;

  for (let l = 0; l < LIEUX; l += 1) {
    const org = await prisma.organization.create({
      data: {
        name: `Club ${l + 1}`,
        slug: `club-${l + 1}-${maintenant}`,
        status: 'ACTIVE',
      },
    });

    const lieu = await prisma.venue.create({
      data: {
        organizationId: org.id,
        name: `Stade ${l + 1}`,
        address: `${l + 1} avenue du Sport, Ville ${l + 1}`,
        // Des coordonnées réelles : la recherche par proximité calcule des
        // distances, et le faire sur des `null` ne mesurerait rien.
        latitude: 43 + (l % 10) * 0.1,
        longitude: 1 + (l % 10) * 0.1,
        status: 'ACTIVE',
        // Un lieu sur deux passe par Flaix : c'est le scénario du jour, et
        // les deux chemins n'ont pas le même coût.
        flaixEnabled: l % 2 === 0,
        ordersOpenAt: '08:00',
        timezone: 'Europe/Paris',
      },
    });

    // Les saisons, de la plus ancienne à la prochaine. La dernière est à
    // venir : c'est elle que le calendrier affiche, les autres sont le poids
    // mort que la requête traîne quand même.
    const evenements = [];
    for (let s = 0; s < SAISONS; s += 1) {
      for (let m = 0; m < MATCHS_PAR_SAISON; m += 1) {
        const decalage = (s - (SAISONS - 1)) * 300 + m * 14;
        const debut = new Date(maintenant + decalage * JOUR);
        evenements.push({
          organizationId: org.id,
          venueId: lieu.id,
          name: `Stade ${l + 1} - Adversaire ${m + 1}`,
          startAt: debut,
          endAt: new Date(debut.getTime() + 3 * 3_600_000),
          status: decalage < 0 ? 'ENDED' : 'ACTIVE',
          visibility: 'PUBLIC',
          opponentName: `Adversaire ${m + 1}`,
          flaixOrderUrl:
            l % 2 === 0
              ? `https://commande.flaix.bo.synertic.net/c${l + 1}/m${s}-${m}`
              : null,
        });
      }
    }
    await prisma.event.createMany({ data: evenements });

    if ((l + 1) % 10 === 0) console.log(`  … ${l + 1}/${LIEUX} lieux`);
  }

  const lieux = await prisma.venue.count();
  const evts = await prisma.event.count();
  console.log(`Semé : ${lieux} lieux, ${evts} événements.`);
  console.log(
    `\nCE QUE ÇA VEUT DIRE : une recherche publique qui renvoie ${lieux} lieux ` +
      `lit ${evts} lignes d'événements — à CHAQUE requête, et sans cache ` +
      `(la route est en no-store).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
