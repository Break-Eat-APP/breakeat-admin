/**
 * Récupération d'accès — crée (ou remet à niveau) un compte SUPER_ADMIN.
 *
 * À utiliser quand plus personne ne peut se connecter au back-office ou au
 * dashboard : un mot de passe est haché en base (argon2) et ne peut donc PAS
 * être relu, seulement remplacé.
 *
 * Le script est volontairement idempotent :
 *  - compte inexistant  → il est créé ;
 *  - compte existant    → mot de passe remplacé, rôle SUPER_ADMIN, réactivé.
 *
 * ⚠️ Ne prend AUCUN identifiant en dur : tout vient de l'environnement, et rien
 * n'est journalisé à part l'email. Le mot de passe ne transite ni par le code,
 * ni par les logs, ni par git.
 *
 * ── Utilisation ─────────────────────────────────────────────────
 * En local (base de développement) :
 *   ADMIN_EMAIL=moi@exemple.fr ADMIN_PASSWORD='MonMotDePasse!' pnpm --filter @break-eat/backend admin:grant
 *
 * Sur la base de production, depuis Railway (la variable DATABASE_URL y est
 * déjà définie, elle ne quitte donc jamais le serveur) :
 *   railway run pnpm --filter @break-eat/backend admin:grant
 *   (en ayant défini ADMIN_EMAIL et ADMIN_PASSWORD dans la commande)
 */
import { PrismaClient, GlobalRole } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/** Exigence minimale, alignée sur la validation d'inscription de l'app. */
const MIN_PASSWORD_LENGTH = 8;

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const displayName = process.env.ADMIN_NAME?.trim() || 'Administrateur';

  if (!email || !password) {
    throw new Error(
      'ADMIN_EMAIL et ADMIN_PASSWORD sont requis.\n' +
        "Exemple : ADMIN_EMAIL=moi@exemple.fr ADMIN_PASSWORD='MonMotDePasse!' pnpm --filter @break-eat/backend admin:grant",
    );
  }
  if (!email.includes('@')) {
    throw new Error(`ADMIN_EMAIL ne ressemble pas à une adresse email : ${email}`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }

  // Même algorithme que l'inscription : le compte reste utilisable par l'API.
  const passwordHash = await argon2.hash(password);

  const existing = await prisma.user.findUnique({ where: { email } });

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, globalRole: GlobalRole.SUPER_ADMIN, isActive: true },
    create: {
      email,
      passwordHash,
      displayName,
      globalRole: GlobalRole.SUPER_ADMIN,
      isActive: true,
    },
    select: { id: true, email: true, globalRole: true },
  });

  console.log(existing ? '\n✅  Compte mis à jour' : '\n✅  Compte créé');
  console.log(`    email : ${user.email}`);
  console.log(`    rôle  : ${user.globalRole}`);

  // Un SUPER_ADMIN accède au back-office sans appartenir à une organisation,
  // mais le dashboard manager, lui, se cale sur une organisation. On signale
  // le cas plutôt que de rattacher l'utilisateur d'autorité.
  const memberships = await prisma.organizationMember.count({ where: { userId: user.id } });
  if (memberships === 0) {
    const orgs = await prisma.organization.findMany({ select: { id: true, name: true }, take: 5 });
    console.log('\n⚠️  Ce compte n’est membre d’aucune organisation.');
    console.log('    Le back-office (SUPER_ADMIN) fonctionnera ; le dashboard manager');
    console.log('    a besoin d’une organisation. Organisations existantes :');
    if (orgs.length === 0) {
      console.log('      (aucune — à créer depuis le back-office)');
    } else {
      orgs.forEach((o) => console.log(`      • ${o.name} — ${o.id}`));
      console.log('\n    Pour rattacher ce compte, relancer avec :');
      console.log(`      ADMIN_ORG_ID=<id ci-dessus> …`);
    }
  } else {
    console.log(`    membre de ${memberships} organisation(s)`);
  }

  // Rattachement explicite à une organisation, si demandé.
  const orgId = process.env.ADMIN_ORG_ID?.trim();
  if (orgId) {
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
    if (!org) throw new Error(`Organisation introuvable : ${orgId}`);
    await prisma.organizationMember.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
      update: { orgRole: 'ORG_ADMIN' },
      create: { userId: user.id, organizationId: orgId, orgRole: 'ORG_ADMIN' },
    });
    console.log(`\n✅  Rattaché à « ${org.name} » en tant qu’ORG_ADMIN`);
  }

  console.log('\nTu peux maintenant te connecter au back-office et au dashboard.\n');
}

main()
  .catch((err: unknown) => {
    console.error('\n❌ ', err instanceof Error ? err.message : err, '\n');
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
