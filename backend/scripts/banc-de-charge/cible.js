/**
 * À QUI ON A LE DROIT DE FAIRE MAL.
 *
 * Un banc de charge est un outil de destruction mesurée : le tireur envoie
 * des milliers de requêtes, et le semeur ÉCRIT dans une base. Les deux
 * doivent refuser la production, et le refus ne peut pas être décoratif.
 *
 * ── POURQUOI UNE LISTE D'AUTORISÉS, ET PLUS UNE LISTE D'INTERDITS ──
 *
 * Le tireur bloquait les noms connus de la production par expression
 * régulière — `railway.app`, `breakeat-admin-production`. Cela paraît
 * suffisant jusqu'au jour où le club pose son propre domaine : `api.
 * break-eat.fr` ne ressemble à rien d'interdit, et le banc tire deux mille
 * requêtes par seconde sur les clients, un soir de match. On provoque alors
 * exactement la panne qu'on cherchait à prévenir.
 *
 * Une liste d'interdits doit prévoir tous les noms futurs. Une liste
 * d'AUTORISÉS n'a rien à prévoir : ce qui n'y figure pas est refusé, y
 * compris ce qu'on n'avait pas imaginé. Pour sortir de la machine locale, il
 * faut nommer la cible soi-même, dans `BANC_CIBLE_AUTORISEE` — un geste
 * conscient, pas un oubli.
 *
 * ── ET LE SEMEUR N'AVAIT AUCUN GARDE ──────────────────────────
 *
 * Il créait organisations, lieux et événements directement avec Prisma, sur
 * la base que `DATABASE_URL` désignait. Une variable d'environnement restée
 * en place dans un terminal, et le semis partait dans une base réelle :
 * quatre-vingts faux clubs et cinq mille faux matchs chez de vrais clients,
 * à démêler à la main.
 *
 * Nommer l'hôte ne suffit pas pour lui. Un tunnel, un transfert de port, une
 * copie de production restaurée en local — l'adresse dit `localhost` et la
 * base contient de vrais clients. On REGARDE donc la base : une base qui
 * porte des paiements ou des commandes n'est pas jetable, quel que soit son
 * nom et quoi qu'en dise celui qui lance le script. C'est une propriété de
 * la cible, pas une promesse de l'opérateur.
 */

/**
 * Les hôtes où l'on a le droit de taper sans rien demander.
 *
 * `.localhost` et `.test` sont réservés par l'IETF (RFC 2606 et 6761) à
 * l'usage local : aucun service réel ne peut les porter.
 */
const HOTES_LOCAUX = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function estLocal(hote) {
  const h = hote.toLowerCase();
  return HOTES_LOCAUX.has(h) || h.endsWith('.localhost') || h.endsWith('.test');
}

/** L'hôte explicitement autorisé par l'opérateur, s'il en a nommé un. */
function hoteAutorise() {
  const brut = (process.env.BANC_CIBLE_AUTORISEE || '').trim();
  return brut ? brut.toLowerCase() : null;
}

function hoteDe(adresse, quoi) {
  let url;
  try {
    url = new URL(adresse);
  } catch {
    console.error(`REFUS : ${quoi} n'est pas une adresse lisible — « ${adresse} ».`);
    process.exit(1);
  }
  return url.hostname;
}

function verifierHote(adresse, quoi, exemple) {
  const hote = hoteDe(adresse, quoi);
  if (estLocal(hote)) return hote;

  const autorise = hoteAutorise();
  if (autorise && hote.toLowerCase() === autorise) {
    console.log(`Cible hors machine locale AUTORISÉE explicitement : ${hote}.`);
    return hote;
  }

  // ON NE RECOPIE PAS L'HÔTE DANS LA SORTIE DE SECOURS.
  //
  // Souffler « BANC_CIBLE_AUTORISEE=api.break-eat.fr » à quelqu'un de pressé,
  // c'est lui donner la ligne à copier-coller pour tirer sur la production.
  // Le refus nomme ce qu'il a refusé ; il n'indique pas comment passer outre
  // pour CETTE cible-là.
  console.error(
    `REFUS : « ${hote} » n'est pas une cible de banc.\n` +
      `  Un banc de charge se tire en local, ou sur une RECETTE que l'on nomme.\n` +
      `  Ce qui n'est pas nommé est refusé — y compris un domaine de production\n` +
      `  que personne n'avait prévu de bloquer.\n\n` +
      `  En local  : ${exemple}\n` +
      `  Recette   : poser BANC_CIBLE_AUTORISEE sur l'hôte de la recette,\n` +
      `              et vérifier à deux fois que c'en est bien une.\n`,
  );
  process.exit(1);
}

/** Le tireur : on vérifie l'hôte de l'API, et c'est tout ce qu'on peut voir. */
function exigerApiDEssai(api) {
  return verifierHote(api, "l'adresse de l'API", 'http://localhost:3000/api/v1');
}

/**
 * Le semeur : l'hôte, PUIS ce que la base contient.
 *
 * Rend le nom de la base, et termine le processus si elle n'est pas jetable.
 */
async function exigerBaseJetable(prisma) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('REFUS : DATABASE_URL n’est pas posée. Rien à semer, et nulle part.');
    process.exit(1);
  }
  verifierHote(url, 'DATABASE_URL', 'postgresql://…@localhost:5432/charge');

  // CE QUE LA BASE CONTIENT, pas ce qu'elle s'appelle. Un paiement ou une
  // commande veut dire de vrais clients : aucun banc n'en produit, puisque le
  // semeur ne sème ni panier ni paiement.
  const [paiements, commandes] = await Promise.all([
    prisma.payment.count(),
    prisma.order.count(),
  ]);

  if (paiements > 0 || commandes > 0) {
    console.error(
      `REFUS : cette base porte ${commandes} commande(s) et ${paiements} paiement(s).\n` +
        `  Ce ne sont pas des données de banc — le semeur n'en crée aucune. Ce sont\n` +
        `  de vrais clients, et y verser quatre-vingts faux clubs se démêlerait à\n` +
        `  la main.\n\n` +
        `  Un banc se sème sur une base NEUVE :\n` +
        `    docker run -d --name breakeat-charge -e POSTGRES_PASSWORD=charge \\\n` +
        `      -e POSTGRES_DB=charge -p 0:5432 postgres:18-alpine\n`,
    );
    process.exit(1);
  }

  const base = new URL(url).pathname.replace(/^\//, '') || '(sans nom)';
  console.log(`Base jetable confirmée : ${base} — ni commande ni paiement.`);
  return base;
}

module.exports = { exigerApiDEssai, exigerBaseJetable, estLocal };
