/**
 * LE PLAFOND D'INSCRIPTIONS, MESURÉ — pas estimé.
 *
 * L'inscription est le SEUL geste de l'application qui soit coûteux par
 * conception : `argon2.hash` est lent exprès, pour qu'un vol de base ne livre
 * pas les mots de passe. Tout le reste de l'API lit.
 *
 * On mesure trois choses, et la troisième est celle qu'on oublie :
 *
 *   1. le coût d'UN hachage ;
 *   2. ce que la concurrence y change — la bibliothèque est native, donc elle
 *      s'exécute dans le pool de fils de libuv (4 par défaut), pas sur le fil
 *      de Node ;
 *   3. LA MÉMOIRE. Les réglages par défaut d'argon2 demandent 64 Mo PAR
 *      hachage. Quatre en parallèle, c'est 256 Mo — sur une instance Railway
 *      qui n'en a peut-être pas beaucoup plus.
 */
const argon2 = require('argon2');

const MOT_DE_PASSE = 'MotDePasseDEssai!2026';

function mo(octets) {
  return Math.round(octets / 1024 / 1024);
}

async function unSeul(n) {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) await argon2.hash(MOT_DE_PASSE);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { parHachage: ms / n, debit: (n / ms) * 1000 };
}

async function enParallele(concurrence, total) {
  const pointe = { rss: 0 };
  const montre = setInterval(() => {
    const { rss } = process.memoryUsage();
    if (rss > pointe.rss) pointe.rss = rss;
  }, 20);

  const t0 = process.hrtime.bigint();
  let faits = 0;
  await Promise.all(
    Array.from({ length: concurrence }, async () => {
      while (faits < total) {
        faits++;
        await argon2.hash(MOT_DE_PASSE);
      }
    }),
  );
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  clearInterval(montre);
  return { debit: (total / ms) * 1000, p95ms: ms / (total / concurrence), rssMo: mo(pointe.rss) };
}

async function main() {
  const v = await argon2.hash(MOT_DE_PASSE);
  const champs = v.split('$')[3];
  console.log(`Réglages effectifs : ${champs}  (m = mémoire en Kio, t = passes, p = fils)`);
  console.log(`Fils libuv : ${process.env.UV_THREADPOOL_SIZE ?? '4 (défaut)'}`);
  console.log(`RSS au repos : ${mo(process.memoryUsage().rss)} Mo\n`);

  const seul = await unSeul(10);
  console.log(`UN SEUL À LA FOIS   ${seul.parHachage.toFixed(0)} ms/hachage → ${seul.debit.toFixed(1)}/s\n`);

  console.log('EN PARALLÈLE');
  console.log('  concurrence   débit      latence      RSS pointe');
  for (const c of [1, 2, 4, 8, 16, 32]) {
    const r = await enParallele(c, Math.max(c * 3, 12));
    console.log(
      `  ${String(c).padStart(2)}            ${r.debit.toFixed(1).padStart(5)}/s   ` +
        `${r.p95ms.toFixed(0).padStart(5)} ms     ${String(r.rssMo).padStart(4)} Mo`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
