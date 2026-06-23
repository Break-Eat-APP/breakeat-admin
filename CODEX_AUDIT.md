# 🔍 Audit Codex — 2026-06-23

État : dépôt clean, `prisma validate` OK. Ne pas passer à l'étape suivante avant les P1.

## ✅ Avancement correctifs (2026-06-23)
- **P1 #1 sécurité app-settings/feature-flags** : FAIT (helper `requireScopedAccess` + `filterScopedRows`, contrôleurs `CurrentUser`, 9 tests). Commit `fix(security)`.
- **P2 #4 double-envoi push** : FAIT (claim atomique PENDING→PROCESSING).
- **P2 #5 eventId hors org** : FAIT (vérif appartenance dans `ScheduledPush.create`).
- **P2 #7 compta annulées** : FAIT (CA exclut `status=CANCELLED` + specs alignées).
- **RESTE** : P1 #2 (migration Prisma officielle), P1 #3 (pipeline Turbo racine), P2 #6 (flux referral externe — décision de design), P3 (icônes mobile), docs .docx Phases 15/18 + contradiction Turbo.


## P1 (bloquant)
1. **Sécurité app-settings & feature-flags** : tout utilisateur JWT peut lire/écrire/supprimer. Critique (apparence mobile, notifs, campagnes en dépendent). Fix : `CurrentUser` + `SUPER_ADMIN` pour scope GLOBAL, `MANAGE_ROLES` + appartenance org pour ORG/EVENT (write/delete), read filtré par appartenance, delete selon le scope de la ligne. + tests. Réfs : app-settings.controller.ts:21/69, feature-flags.controller.ts:21/70.
2. **Migrations Prisma manquantes** : `ScheduledPush`, `PushToken`, `Supplier.isExternal/referralCode` au schéma mais migrations s'arrêtent à `20260606_phase11_operator_screens`. `prisma migrate deploy` ne créera pas ces tables sur une base neuve. Fix : migration Prisma officielle (pas du SQL manuel hors repo).
3. **Pipeline racine Turbo KO** : `corepack pnpm typecheck/lint/test` → "Unable to find package manager binary". Doc dit à tort que c'est sain. Fix : Turbo fiable OU scripts racine `pnpm -r --if-present run ...` ; corriger la doc.

## P2
4. **ScheduledPush double envoi** multi-instance : claim atomique `PENDING -> PROCESSING` via `updateMany where {id,status:'PENDING'}` avant envoi. (scheduled-push.service.ts:86)
5. **ScheduledPush.create** ne vérifie pas que `eventId` appartient à l'org. (scheduled-push.service.ts:44)
6. **Referral externe incohérent** : l'URL a `:orgId` non passé au service ; `findByReferralCode` exige déjà l'appartenance org → bloque un vrai exploitant externe. (suppliers.controller.ts:92, suppliers.service.ts:96)
7. **Compta** : UI dit "annulées exclues" mais backend filtre seulement `paymentStatus=SUCCEEDED` → une commande annulée mais payée serait comptée. (stats.service.ts:116, accounting/page.tsx:173)

## P3
8. **Mobile Apparence** : n'affiche pas encore les icônes configurées (image/texte seulement). (event-home.screen.tsx:234)

## Corrigés / OK
- Écran public READY : `OptionalJwtAuthGuard` + `canAccessEvent` OK. `.gitignore` couvre `*.tsbuildinfo`.
- Docs Markdown globalement à jour ; manquent : `.docx` Phases 15/18, et contradiction Turbo à corriger.

## Ordre conseillé
Sécurité app-settings/feature-flags → migration Prisma → pipeline racine → cron push / referral / compta → mobile icônes → docs.
