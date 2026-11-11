# Audit chirurgical de reprise V2 — Break Eat

**Date :** 26 octobre 2026  
**État audité :** commit `85a964a` + modifications locales non commités  
**Périmètre :** backend, PostgreSQL/Prisma, Redis, WebSocket, outbox, flags, applications web/mobile, CI, build et préparation à 10 000 utilisateurs sur 20 à 50 lieux.

**Aucun code applicatif n’a été modifié pendant cet audit.**

## Verdict immédiat

Les corrections précédentes ont amélioré le dépôt :

- le build complet des applications passe maintenant ;
- le fallback Vercel vers localhost est bloqué en build publiée ;
- le fallback Redis est implémenté et testé ;
- `/ready` existe ;
- la limite de salons WebSocket est présente ;
- le test d’intégration de l’ardoise a reçu le cinquième argument manquant.

Mais l’état actuel ne doit toujours pas être livré :

1. le typecheck échoue encore sur des tests WebSocket ;
2. les tests backend échouent encore sur 11 suites ;
3. l’outbox ajoutée n’est pas atomique avec la transaction métier ;
4. plusieurs instances peuvent rejouer la même ligne d’outbox ;
5. la limite de 600 requêtes/minute par IP peut bloquer un lieu entier ;
6. la révocation d’un accès ne retire pas immédiatement une socket déjà autorisée ;
7. les tests PostgreSQL/Redis réels n’ont pas pu être relancés localement, Docker Desktop étant indisponible.

## Résultats des contrôles

| Contrôle | Résultat |
|---|---|
| Lint Turbo | **OK** — 5 packages |
| Prisma validate | **OK** |
| Typecheck Turbo après génération Prisma | **ÉCHEC** — 6 constructions de `RealtimeService` obsolètes dans les tests |
| Tests unitaires Turbo | **ÉCHEC** — backend : 11 suites en échec, 756 tests passent |
| Build Turbo complet | **OK** — 5 tâches réussies |
| Migrations/intégration réelle | **Non relancé** — Docker Desktop indisponible |
| Audit de charge 10 000 utilisateurs | **Non réalisé** — aucun test de charge automatisé trouvé |

## P0/P1 — Bloquants

### P1-1 — Le typecheck et les tests backend sont encore rouges

**Erreur actuelle :**

```
TS2554: Expected 3 arguments, but got 1
```

Fichiers concernés notamment :

- `backend/src/modules/realtime/diffusion-sure.spec.ts:30,43,61,88,108`
- `backend/src/modules/realtime/isolation-buvettes.spec.ts:39`

Le constructeur de `RealtimeService` exige maintenant :

```ts
RealtimeGateway, OutboxService, PrismaService
```

mais les tests l’instancient encore avec seulement le gateway.

**Impact :** la CI TypeScript et la CI Tests restent rouges. Les 11 suites concernées ne sont pas réellement exécutées ; le fait que 756 tests passent ne valide pas l’ensemble du backend.

**Action obligatoire :** mettre à jour les mocks et les constructions de `RealtimeService`, puis exiger :

- typecheck vert ;
- tests backend verts ;
- tests d’intégration verts ;
- build vert.

### P1-2 — L’outbox n’est pas réellement atomique avec la commande

**Fichiers :**

- `backend/src/modules/realtime/realtime.service.ts:100-157`
- `backend/src/modules/realtime/outbox.service.ts:79-88`
- `backend/src/modules/orders/orders.service.ts:355-365`
- `backend/src/modules/orders/orders.service.ts:604-615`

Le code métier crée d’abord la commande dans une transaction, puis appelle :

```ts
this.realtimeService.emitNewOrder(...)
```

Après cela, `RealtimeService` lance une opération asynchrone « fire-and-forget » et écrit l’outbox via `this.prisma`.

La méthode `OutboxService.deposer()` accepte bien un `TransactionClient`, mais aucun `TransactionClient` de la transaction de commande ne lui est transmis.

**Scénario de perte toujours possible :**

1. la commande et le paiement sont validés ;
2. le processus tombe avant l’écriture de `realtime_outbox` ;
3. aucune ligne ne permet le rejeu ;
4. la commande existe mais le comptoir ne reçoit pas l’événement.

**Conclusion :** l’outbox existe dans le schéma, mais elle ne fournit pas encore la garantie annoncée.

**Action obligatoire :** créer l’événement outbox dans la même transaction que la mutation métier, avec le même `tx`. L’émission immédiate doit ensuite être séparée du dépôt transactionnel.

### P1-3 — Plusieurs instances peuvent rejouer la même ligne en double

**Fichier :** `backend/src/modules/realtime/outbox.service.ts:122-157`.

Chaque instance exécute le cron. Toutes peuvent faire simultanément :

1. `findMany()` des mêmes lignes non livrées ;
2. émettre le même événement ;
3. marquer la même ligne livrée.

Il n’existe pas de verrouillage `FOR UPDATE SKIP LOCKED`, de claim atomique, de statut `PROCESSING` ou de jeton de propriétaire.

**Impact :**

- doublons temps réel pendant une panne/reprise ;
- son ou notification opérateur potentiellement déclenché plusieurs fois ;
- travail Redis multiplié par le nombre d’instances.

Le client opérateur possède une déduplication par `eventId`, ce qui réduit le risque côté dashboard, mais cette garantie n’est pas démontrée pour tous les consommateurs.

**Action :** ajouter un claim atomique multi-instance avant émission, puis tester avec deux ouvriers concurrents.

### P1-4 — La limite globale de 600 requêtes/minute par IP bloque potentiellement un lieu entier

**Fichier :** `backend/src/common/securite/limitation.ts`.

Le compteur global est :

```
600 requêtes par minute et par IP
```

Dans un stade ou un lieu, 10 000 utilisateurs peuvent partager une même IP publique via le Wi-Fi, un proxy ou un NAT.

Même avec une seule requête initiale par utilisateur :

- 10 000 utilisateurs ;
- 600 requêtes autorisées ;
- environ 9 400 requêtes refusées dans la fenêtre.

Le commentaire affirme que 600/minute ne gênera jamais une foule, mais ce n’est pas démontré et le calcul du scénario simultané dit l’inverse.

**Impact :** à l’ouverture d’un événement, des clients légitimes peuvent recevoir des 429 avant même de commander.

**Action obligatoire :**

- réserver la limite IP aux abus évidents ;
- utiliser une limite par utilisateur/session/token pour les comptes connectés ;
- mettre une limite distincte pour les routes publiques de consultation ;
- tester avec 10 000 clients derrière une même IP.

### P1-5 — Une autorisation WebSocket retirée reste active jusqu’à la déconnexion

**Fichier :** `backend/src/modules/realtime/realtime.gateway.ts:168-212`.

Le système mémorise les salons autorisés dans `client.data.salonsAutorises`. Si un utilisateur rejoint une room puis perd son rôle, son rattachement ou son accès à l’organisation, il reste connecté à la room et continue de recevoir les événements.

Le code ne vérifie l’accès qu’au premier `join_room` de cette socket.

**Impact sécurité :** suppression d’un membre, changement de buvette ou révocation d’un opérateur ne coupe pas immédiatement les données temps réel déjà autorisées.

**Action :** prévoir l’invalidation des sockets lors d’une révocation, une vérification périodique ou un mécanisme de version d’autorisation. Ajouter un test : accès accordé, révocation, émission, aucune donnée reçue.

## P2 — Risques importants à traiter avant 10 000 utilisateurs

### P2-1 — La reprise de l’outbox est trop lente pour une grosse panne

**Fichier :** `backend/src/modules/realtime/outbox.service.ts:44-58,130-136`.

Le worker traite au maximum 200 événements par minute. Une panne de 10 000 événements peut donc nécessiter environ 50 minutes de rattrapage, hors erreurs et doublons entre instances.

**Action :** mesurer le débit réel Redis/Socket.IO, augmenter le traitement par lots avec backpressure, et prévoir une alerte sur la profondeur de la file.

### P2-2 — L’outbox n’a pas encore de tests dédiés

Aucun `outbox.service.spec.ts` ni test d’intégration visible ne valide :

- crash avant émission ;
- crash après émission mais avant marquage ;
- deux workers concurrents ;
- Redis indisponible ;
- purge ;
- migration appliquée sur PostgreSQL 18 ;
- événement créé dans la même transaction qu’une commande.

**Action :** ajouter ces tests avant de considérer l’outbox comme terminée.

### P2-3 — Le fichier de migration et l’outbox sont encore non commités

`git status` montre actuellement :

- `backend/prisma/schema.prisma` modifié ;
- `backend/src/modules/realtime/realtime.module.ts` modifié ;
- `backend/src/modules/realtime/realtime.service.ts` modifié ;
- `backend/src/modules/realtime/outbox.service.ts` non suivi ;
- migration `backend/prisma/migrations/20261027_outbox_temps_reel/` non suivie.

**Impact :** Railway/GitHub ne déploieront pas ces corrections tant qu’elles ne sont pas commit/push. Le dépôt local et le dépôt distant ne représentent pas le même système.

### P2-4 — `/ready` existe mais Railway surveille toujours `/health`

`/ready` vérifie PostgreSQL et les migrations, mais `railway.json` utilise encore :

```
healthcheckPath: "/health"
```

Cela signifie que Railway peut garder un conteneur liveness-OK mais pas réellement prêt à prendre une commande.

**Action :** décider explicitement si Railway doit utiliser `/ready`, ou mettre en place une stratégie séparant correctement liveness et readiness.

### P2-5 — Aucun test de charge réel n’est présent

Le dépôt contient des tests unitaires et d’intégration, mais pas de scénario démontrant :

- 10 000 connexions simultanées ;
- 20, 30 ou 50 lieux actifs ;
- commandes simultanées ;
- plusieurs opérateurs par buvette ;
- paiements/rejouements Stripe ;
- perte et reconnexion Redis ;
- reconnexions WebSocket massives ;
- saturation PostgreSQL ;
- profondeur d’outbox ;
- temps de réponse p95/p99.

**Conclusion :** personne ne peut garantir à partir des tests actuels que 10 000 utilisateurs simultanés fonctionneront.

## Points corrigés et vérifiés dans cette reprise

- Build complet admin/backoffice/operator/backend/mobile : **vert**.
- Fallback API localhost bloqué dans les builds Vercel.
- Fallback Redis en mémoire implémenté et testé.
- `/ready` implémenté avec contrôle DB/migrations.
- Limitation du nombre de rooms WebSocket par socket.
- Super-admin autorisé sur les rooms de buvette.
- Test d’intégration ardoise mis à jour avec `FeatureFlagsService`.
- Typecheck des fichiers `backend/test` ajouté à la CI : très bonne correction, car il a justement détecté les tests WebSocket obsolètes.
- Prisma schema validé.

## Ce qui reste à faire avant de parler de disponibilité

1. Corriger les six constructions de `RealtimeService` dans les tests.
2. Refaire passer 100 % des tests backend.
3. Repenser l’insertion de l’outbox pour qu’elle soit dans la transaction métier.
4. Ajouter un verrouillage multi-instance du worker outbox.
5. Gérer l’invalidation des rooms après révocation d’un accès.
6. Revoir la limite de 600/minute/IP pour les lieux avec NAT partagé.
7. Commit/push de la migration et du code outbox.
8. Relancer l’intégration PostgreSQL 18 + Redis 7 dans Docker ou GitHub Actions.
9. Réaliser un test de charge progressif : 1 000, 5 000 puis 10 000 utilisateurs.
10. Mesurer p50/p95/p99, taux de 429, taux d’erreur, connexions DB, mémoire, CPU, Redis et taille de l’outbox.

## Conclusion

La nouvelle série de corrections est utile, mais elle a introduit une refonte temps réel qui n’est pas encore finalisée. Le build est vert, mais la qualité de livraison reste rouge à cause du typecheck et des tests backend.

Pour votre scénario de 10 000 utilisateurs sur 20 à 50 lieux, les deux risques les plus sérieux sont :

- la limite de 600 requêtes/minute par IP, potentiellement incompatible avec un Wi‑Fi/NAT de lieu ;
- l’outbox non atomique et non verrouillée entre plusieurs instances.

Tant que ces points ne sont pas corrigés et validés par un test de charge, il ne faut pas promettre une absence de bug en production.

