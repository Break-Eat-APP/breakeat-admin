# 🚀 Déploiement backend (Railway) + plan de migration

## Comment Railway déploie
`railway.json` → `startCommand: cd backend && pnpm db:migrate:prod && node dist/main`
où `db:migrate:prod = prisma migrate deploy`.

➡️ **À chaque déploiement, Railway applique automatiquement les migrations** présentes
dans `backend/prisma/migrations/` avant de démarrer le serveur. `prisma migrate deploy`
exige `migration_lock.toml` (ajouté) — sinon échec.

## Migrations concernées (nouvelles)
1. `20260607_phase15_notifications_referral` — `scheduled_pushes`, `push_tokens`,
   `suppliers.is_external` + `referral_code`.
2. `20260624_phase16_venue_geo` — `venues.latitude` + `longitude`.
3. `migration_lock.toml` (provider postgresql) — rattrapage indispensable.

## Sur la PROD (Railway) — rien de spécial à faire
La base de prod n'a PAS encore ces objets (l'ancien code déployé ne les utilisait pas).
`migrate deploy` va donc les **créer proprement** au déploiement. Aucun `resolve` requis.

⚠️ Pré-vérif conseillée (avant/juste après déploiement) :
```
# pointer DATABASE_URL sur la prod, puis :
cd backend && pnpm exec prisma migrate status
```
Doit lister phase15 + phase16 comme « not yet applied » avant, « applied » après.
Si l'historique de prod est incohérent (ex. base créée via `db push`), résoudre AVANT
de redéployer (sinon `migrate deploy` peut buter sur un objet déjà existant).

## Sur la DEV (local) — étape de rattrapage (drift SQL direct)
Sur le poste de dev, `scheduled_pushes`/`push_tokens`/colonnes supplier ont été créés
jadis en SQL direct (dette REPRISE). Donc, base de dev allumée, marquer la migration
comme déjà appliquée pour éviter qu'elle ne se rejoue :
```
cd backend
pnpm exec prisma migrate resolve --applied 20260607_phase15_notifications_referral
```
Pour `phase16` (venues lat/lng) : si les colonnes n'existent pas encore en dev, laisser
`migrate deploy`/`migrate dev` les créer ; sinon `resolve --applied 20260624_phase16_venue_geo`.

## Étapes de déploiement
1. **Pousser la branche** `feat/dashboard-config-blocs-abc` sur origin (fait).
2. **Déclencher le déploiement Railway** : merge vers la branche suivie par Railway
   (généralement `main`) → Railway rebuild + `migrate deploy` + start. (Le déclenchement
   exact dépend de la branche connectée dans le dashboard Railway.)
3. **Vérifier** : `GET https://breakeat-admin-production.up.railway.app/health` (200) puis
   `GET …/api/v1/public/venues` (200, liste — vide tant qu'aucun lieu n'a de coordonnées).
4. **Seeder lat/lng** sur les venues pour activer le tri par proximité.
5. **CORS** : ajouter l'origine de l'app web déployée à `CORS_ORIGINS` (cf. DEPLOY-WEB.md).

## Bloqueur fonctionnel restant
Commande de bout en bout = contrat **Flaix** (Phase 11.5, non écrit). Hors périmètre déploiement.
