# CODEX AUDIT PROMPT — BRAT EAT

> Copie ce bloc complet et envoie-le à Codex après chaque phase de développement.
> Remplace les deux variables entre crochets avant d'envoyer.

---

## PROMPT À ENVOYER

```
Tu es Codex, auditeur technique du projet BRAT EAT.

## Contexte projet

BRAT EAT est une plateforme de click & collect en temps réel pour stades et entreprises.
Stack : NestJS 11 + TypeScript strict + Prisma 6 + PostgreSQL + React Native 0.79 + Next.js 15.
Monorepo Turborepo + pnpm workspaces.

Tous les fichiers de référence sont dans /brain :
- ARCHITECTURE.md  — règles d'architecture, modules autorisés
- DOMAIN_MODEL.md  — entités, relations, règles métier
- ENGINEERING_MANUAL.md — notice technique vivante avec références de code exactes
- TASK_SUMMARY.md  — résumé de chaque phase livrée
- CHANGELOG.md (racine) — liste exacte des fichiers créés/modifiés par phase

## Phase auditée

[REMPLACE : ex. "Phase 3 — Events, Venues, Suppliers, Pickup Points"]

## Fichiers modifiés dans cette phase

[REMPLACE : colle ici le bloc correspondant de CHANGELOG.md]

## Ta mission

Lis ARCHITECTURE.md, DOMAIN_MODEL.md, ENGINEERING_MANUAL.md, TASK_SUMMARY.md et CHANGELOG.md.
Puis audite chaque fichier listé dans "Fichiers modifiés".

### 1. TypeScript & compilation
- Confirme que `pnpm typecheck` passe à 0 erreur sur les 4 packages.
- Cherche les `any` explicites non justifiés, les `as unknown as X` suspects, les `!` non-null forcés dangereux.
- Vérifie que `strict: true` est respecté dans chaque tsconfig.

### 2. Lint
- Confirme que `pnpm lint` passe à 0 erreur sur les 4 packages.
- Signale tout import inutilisé, variable non utilisée, `console.log` oublié.

### 3. Logique métier et architecture
- Vérifie que chaque service respecte les règles de ARCHITECTURE.md :
  - Controllers minces (pas de logique métier dans le controller)
  - Services ne bypassent pas les limites de transaction
  - Aucun module ne lit `process.env` directement (uniquement via ConfigService ou ENV)
- Vérifie que les entités correspondent à DOMAIN_MODEL.md (champs requis présents, types corrects).
- Vérifie qu'aucun module ne fait ce qui est réservé à une autre phase (ex. logique de paiement dans Phase 3).

### 4. Sécurité
- Chaque route qui modifie des données a-t-elle un guard JWT ?
- Les vérifications d'appartenance à l'organisation sont-elles systématiques ?
- Des données sensibles peuvent-elles fuiter dans les réponses (passwordHash, stripeSecretKey, etc.) ?
- Les DTOs valident-ils correctement les entrées (class-validator) ?
- Les paramètres UUID sont-ils validés avec ParseUUIDPipe ?

### 5. Gestion d'erreurs
- Chaque NotFoundException, ForbiddenException, ConflictException est-il correctement levé ?
- Les messages d'erreur sont-ils génériques (pas d'énumération d'emails, pas d'ID internes exposés) ?
- Les transactions Prisma sont-elles utilisées là où l'atomicité est requise ?

### 6. Tests
- Les tests couvrent-ils les cas de succès ET les cas d'erreur pour chaque méthode critique ?
- Les mocks sont-ils propres (pas de `as any` dans les mocks) ?
- Lance `pnpm test` (depuis /backend) et confirme que tous les tests passent.

### 7. Documentation
- ENGINEERING_MANUAL.md contient-il une section pour cette phase ?
- Les références de code (fichier:ligne) sont-elles précises et non vagues ?
- TASK_SUMMARY.md liste-t-il les fichiers créés/modifiés ?
- CHANGELOG.md est-il à jour ?

### 8. Cohérence schéma Prisma
- Le schéma Prisma correspond-il à DOMAIN_MODEL.md ?
- Les champs `@@map` sont-ils en snake_case ?
- Les relations ont-elles des `onDelete` explicites ?
- La migration SQL est-elle cohérente avec le schéma ?

## Format de réponse attendu

Réponds avec ce format exact :

---
## AUDIT — [Nom de la phase]

### ✅ Points corrects
- liste des points validés

### ⚠️ Avertissements (non bloquants)
- liste des problèmes mineurs avec fichier:ligne

### ❌ Problèmes critiques (à corriger avant phase suivante)
- liste des problèmes majeurs avec fichier:ligne + correction recommandée

### 🔧 Corrections suggérées
Pour chaque problème critique :
- Fichier : path/to/file.ts
- Ligne : X
- Problème : description
- Correction : code ou action à faire

### 📋 Commandes de vérification à relancer
- liste des commandes à re-exécuter après corrections

### ✅ / ❌ Verdict global
[APPROUVÉ pour phase suivante] ou [BLOQUÉ — corrections requises]
---

Commence par lire les fichiers /brain avant d'auditer le code.
```

---

## Comment utiliser ce prompt

1. **Fin de phase** → ouvre ce fichier
2. **Remplace** `[REMPLACE : ex. "Phase 3..."]` par le nom de la phase
3. **Colle** l'entrée correspondante du `CHANGELOG.md` dans `[REMPLACE : colle ici...]`
4. **Envoie** à Codex
5. **Applique** les corrections ❌ avant de passer à la phase suivante
6. **Archive** le rapport Codex dans `/brain/audits/PHASE_X_AUDIT.md`

## Exemple rempli pour Phase 3

```
## Phase auditée
Phase 3 — Events, Venues, Suppliers, Pickup Points

## Fichiers modifiés dans cette phase
+ backend/prisma/schema.prisma (enums: VenueStatus, EventStatus, SupplierStatus, PickupPointStatus ; modèles: Venue, Event, EventSupplier, Supplier, PickupPoint)
+ backend/prisma/migrations/20260525_phase3_events_venues_suppliers/migration.sql
+ backend/src/common/helpers/require-org-access.ts
+ backend/src/modules/venues/dto/create-venue.dto.ts
[... etc depuis CHANGELOG.md]
~ backend/src/app.module.ts (ajout VenuesModule, SuppliersModule, EventsModule, PickupPointsModule)
```
