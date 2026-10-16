/**
 * AUDIT CHIRURGICAL — UNE SAISON ENTIÈRE, 20 LIEUX, 400 ÉVÉNEMENTS.
 *
 * On ne vérifie pas « ça marche ». On cherche le jour où ça ne marcherait pas :
 * le samedi où vingt stades jouent en même temps, le match de nuit, le
 * changement d'heure, l'événement annulé dont le lien traîne encore.
 *
 * Méthode : plutôt que de recalculer le résultat attendu avec le même
 * raisonnement que le code testé — ce qui confirmerait ses erreurs — on vérifie
 * des PROPRIÉTÉS qui doivent tenir quoi qu'il arrive :
 *
 *   P1. un lien rendu appartient à un événement ACTIF, avec une adresse ;
 *   P2. l'instant est dans [ouverture, fin] de cet événement ;
 *   P3. aucun événement TERMINÉ ne rend jamais de lien ;
 *   P4. parmi tous ceux qui sont ouverts, c'est celui qui a commencé le
 *       premier qui gagne (règle de départage) ;
 *   P5. si rien n'est ouvert mais qu'un match reste à venir, on annonce une
 *       heure, et c'est 8 h locales le jour de CE match (ou son coup d'envoi) ;
 *   P6. un lieu ne rend jamais l'adresse d'un autre lieu.
 *
 * Usage : node scripts/audit-saison.cjs   (depuis backend/, après `nest build`)
 */
const path = require('path');

/** La racine du paquet backend, quel que soit le poste. */
const RACINE = path.join(__dirname, '..');
process.env.DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://audit:audit@localhost:15432/audit';

const { PrismaClient } = require(path.join(RACINE, 'node_modules/@prisma/client'));
const { fenetreDeCommande, heureDOuverture } = require(
  path.join(RACINE, 'dist/common/helpers/fenetre-commande'),
);

const prisma = new PrismaClient();

const ORG = '99999999-9999-4999-8999-999999999999';
const TZ = 'Europe/Paris';
const HEURE = '08:00';
const REGLAGE = { heure: HEURE, timezone: TZ };

/** Début de saison : 17/10/2026. Six mois → traverse LES DEUX changements d'heure. */
const DEBUT_SAISON = new Date('2026-10-17T00:00:00.000Z');

/** Un UUID v4 valide et deterministe : 8-4-4-4-12 caracteres hexadecimaux. */
const uuid = (prefixe, n) =>
  `${prefixe}${String(n).padStart(7, '0')}-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Les heures de coup d'envoi, choisies pour couvrir les cas limites. */
const HORAIRES = [
  { h: 20, min: 30, nom: 'soir' },
  { h: 14, min: 0, nom: 'apres-midi' },
  { h: 18, min: 45, nom: 'fin de journee' },
  { h: 0, min: 30, nom: 'NUIT (avant 8 h)' },
  { h: 7, min: 0, nom: 'MATINAL (avant 8 h)' },
];

async function semer() {
  console.log('── Mise en place ──────────────────────────────────────');
  await prisma.event.deleteMany({ where: { organizationId: ORG } });
  await prisma.venue.deleteMany({ where: { organizationId: ORG } });
  await prisma.organization.deleteMany({ where: { id: ORG } });

  await prisma.organization.create({
    data: { id: ORG, name: 'Ligue Audit', slug: 'ligue-audit-saison', status: 'ACTIVE' },
  });

  const lieux = [];
  for (let v = 1; v <= 20; v += 1) {
    lieux.push({
      id: uuid('a', v),
      organizationId: ORG,
      name: `Stade Audit ${v}`,
      address: `Ville ${v}`,
      latitude: 43 + v * 0.01,
      longitude: 5 + v * 0.01,
      status: 'ACTIVE',
      operatingMode: 'EVENT_BASED',
      flaixEnabled: true,
      ordersOpenAt: HEURE,
      timezone: TZ,
    });
  }
  await prisma.venue.createMany({ data: lieux });

  // 20 événements par lieu, un tous les 9 jours → 180 jours de saison.
  // Tous les lieux jouent LE MÊME JOUR : c'est le samedi de championnat, et
  // c'est le cas qui met vingt relais en service à la même minute.
  const evenements = [];
  let n = 0;
  for (let v = 1; v <= 20; v += 1) {
    for (let j = 0; j < 20; j += 1) {
      n += 1;
      const horaire = HORAIRES[(v + j) % HORAIRES.length];
      const jour = new Date(DEBUT_SAISON.getTime() + j * 9 * 86400000);
      // Heure LOCALE de Paris → on pose l'heure UTC correspondante en tenant
      // compte du décalage réel ce jour-là (le jeu de données doit être juste,
      // sinon l'audit teste ses propres approximations).
      const start = instantParisien(jour, horaire.h, horaire.min);
      const end = new Date(start.getTime() + 4 * 3600000);

      // Contrôles par lieu, avec un lien pour qu'ils soient tentants :
      //  · un BROUILLON, qui doit s'ouvrir quand même (la date décide) ;
      //  · un ANNULÉ et un SUSPENDU, qui doivent rester fermés.
      let status = 'ACTIVE';
      if (j === 5) status = 'DRAFT';
      else if (j === 11) status = 'CANCELLED';
      else if (j === 17) status = 'PAUSED';

      evenements.push({
        id: uuid('b', n),
        organizationId: ORG,
        venueId: uuid('a', v),
        name: `L${v} J${j + 1} (${horaire.nom})`,
        startAt: start,
        endAt: end,
        status,
        visibility: 'PUBLIC',
        isPermanentContainer: false,
        flaixOrderUrl: `https://commande.flaix.bo.synertic.net/o/l${v}-j${j + 1}`,
      });
    }
  }
  await prisma.event.createMany({ data: evenements });
  console.log(`   ${lieux.length} lieux, ${evenements.length} événements`);
  console.log(
    `   dont ${evenements.filter((e) => e.status !== 'ACTIVE').length} non ouvrables ` +
      `(brouillon / annulé / suspendu), lien posé quand même`,
  );
  return { lieux, evenements };
}

/** L'instant UTC correspondant à une heure locale parisienne (deux passes). */
function instantParisien(jourUtc, h, min) {
  const y = jourUtc.getUTCFullYear();
  const m = jourUtc.getUTCMonth();
  const d = jourUtc.getUTCDate();
  const souhaite = Date.UTC(y, m, d, h, min);
  let instant = souhaite;
  for (let i = 0; i < 2; i += 1) {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(instant));
    const l = (t) => Number(p.find((x) => x.type === t).value);
    const vu = Date.UTC(l('year'), l('month') - 1, l('day'), l('hour') % 24, l('minute'));
    instant += souhaite - vu;
  }
  return new Date(instant);
}

function heureLocale(d) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

// ── Les propriétés ────────────────────────────────────────────────
const echecs = [];
function verifier(nom, condition, detail) {
  if (!condition) echecs.push(`${nom} — ${detail}`);
}

function controler(lieu, evenements, instant) {
  const f = fenetreDeCommande(evenements, instant, REGLAGE);
  const t = instant.getTime();

  if (f.etat === 'ouvert') {
    const e = f.evenement;
    // P1 — un BROUILLON s'ouvre (la date decide) ; ce qui veut dire STOP, non.
    verifier(
      'P1',
      !['PAUSED', 'CANCELLED', 'ENDED'].includes(e.status),
      `${lieu} : lien rendu sur un événement ${e.status}`,
    );
    verifier('P1', !!e.flaixOrderUrl, `${lieu} : lien rendu sans adresse`);
    // P2
    const ouv = heureDOuverture(e, REGLAGE).getTime();
    verifier('P2', t >= ouv, `${lieu} : ouvert AVANT l'heure (${heureLocale(instant)})`);
    verifier('P2', t <= e.endAt.getTime(), `${lieu} : ouvert APRÈS la fin (${e.name})`);
    // P3
    verifier('P3', e.endAt.getTime() >= t, `${lieu} : événement terminé rendu (${e.name})`);
    // P4 — le premier commencé parmi tous les ouverts
    const ouverts = evenements.filter(
      (x) =>
        !['PAUSED', 'CANCELLED', 'ENDED'].includes(x.status) &&
        x.flaixOrderUrl &&
        t >= heureDOuverture(x, REGLAGE).getTime() &&
        t <= x.endAt.getTime(),
    );
    const attendu = ouverts.sort((a, b) => a.startAt - b.startAt)[0];
    verifier('P4', attendu && attendu.id === e.id, `${lieu} : mauvais événement servi`);
    // P6
    verifier('P6', f.url === e.flaixOrderUrl, `${lieu} : adresse d'un AUTRE événement`);
    verifier(
      'P6',
      f.url.includes(`/o/l${lieu.split(' ').pop()}-`),
      `${lieu} : adresse d'un AUTRE LIEU (${f.url})`,
    );
    return 'ouvert';
  }

  if (f.etat === 'bientot') {
    // P5
    const attendue = heureDOuverture(f.evenement, REGLAGE);
    verifier(
      'P5',
      f.ouvreA.getTime() === attendue.getTime(),
      `${lieu} : heure annoncée incohérente`,
    );
    verifier('P5', f.ouvreA.getTime() > t, `${lieu} : annonce une ouverture déjà passée`);
    verifier(
      'P5',
      f.evenement.endAt.getTime() > t,
      `${lieu} : annonce un événement DÉJÀ TERMINÉ`,
    );
    // Et personne d'autre ne devait être ouvert.
    const ouverts = evenements.filter(
      (x) =>
        !['PAUSED', 'CANCELLED', 'ENDED'].includes(x.status) &&
        x.flaixOrderUrl &&
        t >= heureDOuverture(x, REGLAGE).getTime() &&
        t <= x.endAt.getTime(),
    );
    verifier('P5', ouverts.length === 0, `${lieu} : annoncé « bientôt » alors qu'un match est ouvert`);
    return 'bientot';
  }

  // 'aucun' : il ne doit rester aucun match ouvrable à venir.
  const restants = evenements.filter(
    (x) =>
      !['PAUSED', 'CANCELLED', 'ENDED'].includes(x.status) &&
      x.flaixOrderUrl &&
      x.endAt.getTime() > t,
  );
  verifier(
    'Aucun',
    restants.length === 0,
    `${lieu} : « rien » alors que ${restants.length} match(s) restent`,
  );
  return 'aucun';
}

async function main() {
  const { evenements } = await semer();

  const lieux = await prisma.venue.findMany({
    where: { organizationId: ORG },
    orderBy: { name: 'asc' },
    select: {
      name: true,
      ordersOpenAt: true,
      timezone: true,
      events: {
        orderBy: { startAt: 'asc' },
        select: {
          id: true,
          name: true,
          status: true,
          startAt: true,
          endAt: true,
          isPermanentContainer: true,
          flaixOrderUrl: true,
        },
      },
    },
  });

  // ── Les instants éprouvés ───────────────────────────────────────
  const instants = [];
  const ajouter = (d, note) => instants.push({ d, note });

  // Un balayage régulier de toute la saison, toutes les 6 h.
  for (let ms = DEBUT_SAISON.getTime() - 86400000; ms < DEBUT_SAISON.getTime() + 190 * 86400000; ms += 6 * 3600000) {
    ajouter(new Date(ms), null);
  }

  // Et les instants qui comptent, à la minute près.
  const j1 = new Date(DEBUT_SAISON);
  ajouter(instantParisien(j1, 7, 59), '7 h 59 — JUSTE AVANT l’ouverture');
  ajouter(instantParisien(j1, 8, 0), '8 h 00 — PILE à l’ouverture');
  ajouter(instantParisien(j1, 8, 1), '8 h 01 — juste après');
  // Changement d'heure : 25/10/2026 (fin de l'heure d'été) et 28/03/2027.
  ajouter(instantParisien(new Date('2026-10-25T00:00:00Z'), 8, 0), '8 h le jour du passage à l’heure d’hiver');
  ajouter(instantParisien(new Date('2027-03-28T00:00:00Z'), 8, 0), '8 h le jour du passage à l’heure d’été');

  console.log('\n── Contrôle ───────────────────────────────────────────');
  console.log(`   ${instants.length} instants × ${lieux.length} lieux = ${instants.length * lieux.length} vérifications`);

  const compte = { ouvert: 0, bientot: 0, aucun: 0 };
  const t0 = Date.now();
  for (const { d } of instants) {
    for (const l of lieux) {
      compte[controler(l.name, l.events, d)] += 1;
    }
  }
  const duree = Date.now() - t0;

  console.log(`   ouvert : ${compte.ouvert} · bientôt : ${compte.bientot} · aucun : ${compte.aucun}`);
  console.log(`   calculé en ${duree} ms`);

  // ── Les instants remarquables, en clair ─────────────────────────
  console.log('\n── Aux instants qui comptent (lieu 1) ─────────────────');
  const lieu1 = lieux[0];
  for (const { d, note } of instants.filter((i) => i.note)) {
    const f = fenetreDeCommande(lieu1.events, d, REGLAGE);
    const dit =
      f.etat === 'ouvert'
        ? `OUVERT → ${f.url.split('/').pop()}`
        : f.etat === 'bientot'
          ? `ouvre à ${heureLocale(f.ouvreA)}`
          : 'rien';
    console.log(`   ${heureLocale(d).padEnd(17)} ${note.padEnd(46)} ${dit}`);
  }

  // ── Un samedi de championnat : les 20 lieux à la même minute ────
  const samedi = instantParisien(DEBUT_SAISON, 12, 0);
  const ouvertsSimultanes = lieux.filter(
    (l) => fenetreDeCommande(l.events, samedi, REGLAGE).etat === 'ouvert',
  );
  const adresses = new Set(
    ouvertsSimultanes.map((l) => fenetreDeCommande(l.events, samedi, REGLAGE).url),
  );
  console.log('\n── Le samedi de championnat, à midi ───────────────────');
  console.log(`   ${ouvertsSimultanes.length} lieux ouverts en même temps`);
  console.log(`   ${adresses.size} adresses DISTINCTES (doit être égal)`);
  verifier(
    'Simultané',
    adresses.size === ouvertsSimultanes.length,
    `deux lieux partagent la même adresse`,
  );

  // ── Après la saison ─────────────────────────────────────────────
  const apres = new Date(DEBUT_SAISON.getTime() + 200 * 86400000);
  const encoreOuverts = lieux.filter(
    (l) => fenetreDeCommande(l.events, apres, REGLAGE).etat !== 'aucun',
  );
  console.log('\n── Vingt jours après le dernier match ─────────────────');
  console.log(`   ${encoreOuverts.length} lieux encore ouverts (doit être 0)`);

  console.log('\n══ VERDICT ════════════════════════════════════════════');
  if (echecs.length === 0) {
    console.log(`   AUCUN ÉCART sur ${instants.length * lieux.length} vérifications.`);
  } else {
    console.log(`   ${echecs.length} ÉCART(S) :`);
    for (const e of echecs.slice(0, 25)) console.log(`   · ${e}`);
    if (echecs.length > 25) console.log(`   … et ${echecs.length - 25} autres`);
  }
  await prisma.$disconnect();
  process.exit(echecs.length === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(2);
});
