import { FlagScope, Prisma } from '@prisma/client';

/**
 * ÉCRIRE UNE LIGNE À PORTÉE, Y COMPRIS GLOBALE — ce qui ne marchait pas.
 *
 * `feature_flags` et `app_settings` partagent la même forme : une clé, une
 * portée, et un `scope_id` NUL quand la portée est GLOBALE. Les deux services
 * écrivaient par `upsert` sur la clé composée `(key, scope, scopeId)`, avec
 * ce cast :
 *
 *     const sid = (scopeId ?? null) as string;
 *
 * Le cast fait taire TypeScript. Prisma, lui, VALIDE AU RUNTIME et refuse :
 *
 *     Argument `scopeId` must not be null.
 *
 * Donc poser un interrupteur GLOBAL ne rendait pas une mauvaise valeur : il
 * levait, et l'API répondait 500. Vérifié sur une vraie base le 31/10.
 *
 * Et aucun test ne pouvait l'attraper : les deux suites doublent `upsert` par
 * un `jest.fn()`, qui accepte tout ce qu'on lui passe. Le test « upserts a
 * global flag » passait au vert pendant que le vrai chemin échouait. C'est la
 * forme de confiance la plus coûteuse — une doublure qui valide moins que la
 * vraie chose.
 *
 * ── LA MANŒUVRE, ET POURQUOI ELLE EST SÛRE ──────────────────────
 *
 * Portée NON globale : rien ne change, `upsert` sur la clé composée. Ce chemin
 * fonctionne, Prisma y émet un `ON CONFLICT (key, scope, scope_id)` et la base
 * l'arbitre. On n'y touche pas.
 *
 * Portée GLOBALE : on lit, puis on crée ou on met à jour par `id`. Deux
 * écritures simultanées peuvent passer la lecture ensemble — c'est alors
 * l'index partiel posé par `20261031_unicite_interrupteurs_globaux` qui
 * tranche, et le perdant reçoit un `P2002`. On ne le laisse pas remonter : on
 * relit et on met à jour. Pour un interrupteur, « le dernier qui parle a
 * raison » est la sémantique attendue, et deux exploitants qui le basculent
 * en même temps ne doivent pas en voir un échouer.
 *
 * SANS l'index, ce rattrapage ne servirait à rien : les deux insertions
 * passeraient. La migration et ce fichier ne valent qu'ensemble.
 */

/** Le minimum qu'une table à portée doit savoir faire. */
export interface TableAPortee<L> {
  findFirst(args: {
    where: { key: string; scope: FlagScope; scopeId: null };
    select: { id: true };
  }): Promise<{ id: string } | null>;
  create(args: { data: Record<string, unknown> }): Promise<L>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<L>;
  upsert(args: {
    where: { key_scope_scopeId: { key: string; scope: FlagScope; scopeId: string } };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<L>;
}

/** Vrai pour la violation d'unicité de PostgreSQL, telle que Prisma la rend. */
function estUnDoublon(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}

/**
 * Pose une valeur sur la portée demandée, et rend la ligne écrite.
 *
 * `donnees` est ce qui change (la valeur, l'activation, les métadonnées) ;
 * la clé et la portée sont passées à part parce qu'elles IDENTIFIENT la ligne
 * et ne doivent jamais être modifiées par une mise à jour.
 */
export async function poserSurLaPortee<L>(
  table: TableAPortee<L>,
  identite: { key: string; scope: FlagScope; scopeId: string | null },
  donnees: Record<string, unknown>,
): Promise<L> {
  const { key, scope, scopeId } = identite;

  if (scopeId !== null) {
    return table.upsert({
      where: { key_scope_scopeId: { key, scope, scopeId } },
      create: { key, scope, scopeId, ...donnees },
      update: donnees,
    });
  }

  const existante = await table.findFirst({
    where: { key, scope, scopeId: null },
    select: { id: true },
  });
  if (existante) return table.update({ where: { id: existante.id }, data: donnees });

  try {
    return await table.create({ data: { key, scope, scopeId: null, ...donnees } });
  } catch (e) {
    if (!estUnDoublon(e)) throw e;

    // Quelqu'un a écrit entre notre lecture et notre insertion. L'index a
    // fait son travail ; il reste à mettre à jour SA ligne plutôt que de
    // rendre une erreur à qui ne fait que basculer un interrupteur.
    const gagnante = await table.findFirst({
      where: { key, scope, scopeId: null },
      select: { id: true },
    });
    if (!gagnante) throw e;
    return table.update({ where: { id: gagnante.id }, data: donnees });
  }
}
