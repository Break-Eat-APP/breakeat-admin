# Reverification chirurgicale — Break Eat

**Date :** 27 octobre 2026  
**Commit local vérifié :** `0379b88` — `feat(temps-reel): l'outbox — plus rien ne se perd pour l'operateur`  
**Base distante vérifiée :** `origin/main` pointe encore sur `85a964a`; le commit `0379b88` est en avance d’un commit et n’est pas présent sur la branche distante au moment de la vérification.  
**Périmètre :** vérification des constats de l’audit V2, avec contrôles TypeScript, tests, lint, build et migrations et intégration PostgreSQL 18 + Redis 7.  
**Aucun code applicatif n’a été modifié pendant cette vérification.**

## Verdict

Plusieurs régressions signalées dans l’audit précédent sont bien corrigées : les anciennes erreurs TypeScript des tests ont disparu, les tests backend passent, les migrations passent sur PostgreSQL 18, et les tests réels Redis multi-instance et de limitation partagée passent.

L’outbox reste toutefois **incomplète pour garantir qu’une commande validée ne perde jamais son événement** : elle est écrite après la transaction métier et son ouvrier ne réserve pas les lignes avant de les rejouer. D’autres risques antérieurs restent également ouverts : le quota global de 600 requêtes par IP, l’accès WebSocket conservé jusqu’à reconnexion et l’absence de charge réelle à 10 000 utilisateurs simultanés.

Le commit vérifié n’est pas encore dans `origin/main`. Les contrôles ci-dessous portent sur le code local `0379b88`; GitHub Actions et Railway ne l’utilisent pas tant qu’il n’est pas poussé et déployé.

## Contrôles exécutés

| Contrôle | Résultat |
|---|---|
| `pnpm turbo typecheck --concurrency=1` | **Réussi** — 5 tâches |
| `pnpm --dir backend exec jest --runInBand` | **Réussi** — 69 suites, 920 tests |
| Tests ciblés temps réel / sécurité | **Réussi** — 5 suites, 42 tests |
| Migrations sur PostgreSQL 18 | **Réussi** — 49 migrations, dont `20261027_outbox_temps_reel` |
| `pnpm --dir backend test:integration` avec PostgreSQL 18 et Redis 7 | **Réussi** — 16 suites, 138 tests |
| `pnpm turbo lint --concurrency=1` | **Réussi** — 5 tâches |
| `pnpm turbo build --concurrency=1` | **Réussi** — 5 tâches |

Le test réel de campagne a traité 25 000 destinataires et les tests Redis multi-instance ont passé. Cela valide des opérations de masse en base et le transport Socket.IO/limitation partagé entre deux instances; cela ne simule pas 10 000 utilisateurs qui se connectent, consultent et commandent en même temps.

Une première exécution simultanée des commandes globales de tests et de typecheck a été interrompue par un manque de mémoire de l’environnement local. Les vérifications isolées ci-dessus ont ensuite abouti. Ce premier arrêt mémoire n’est pas compté comme un échec applicatif.

## Constats précédents : statut vérifié

### Corrigés

1. **Les six erreurs TS2554 dans les tests WebSocket** — corrigées. Les instanciations de `RealtimeService` ont été mises à jour; le typecheck backend et l’ensemble du typecheck Turbo passent.
2. **Les suites backend qui échouaient à cause de ces constructions obsolètes** — corrigées. Toute la suite backend passe : 69/69 suites et 920/920 tests.
3. **Tests unitaires de base de l’outbox** — ajoutés et réussis : dépôt, rejeu, échec d’émission, marquage et purge. Ils ne couvrent cependant pas encore les garanties transactionnelles ni la concurrence multi-instance (voir les points ouverts).
4. **Migration de l’outbox** — appliquée avec succès après les 48 migrations précédentes sur PostgreSQL 18. Le test d’intégration Redis réel multi-instance passe également.
5. **Lint et builds** — verts sur le commit local vérifié.

### Toujours ouverts — priorité P1

#### P1 — L’écriture d’outbox n’est pas dans la transaction de commande

`OutboxService.deposer()` accepte un client transactionnel, mais le chemin réel ne lui passe pas celui de la commande. Les services de commande valident d’abord leur transaction puis appellent `emitNewOrder()` ou `emitOrderUpdated()`. `RealtimeService` démarre ensuite un traitement asynchrone et écrit avec `this.prisma`.

**Scénario restant :** transaction métier validée, processus arrêté avant l’écriture asynchrone de l’outbox : la commande existe, mais aucune ligne ne permettra de la rejouer.

**Références :** `backend/src/modules/orders/orders.service.ts` autour des lignes 356, 605 et 802; `backend/src/modules/realtime/realtime.service.ts` autour des lignes 100–124; dépôt transactionnel défini dans `backend/src/modules/realtime/outbox.service.ts` autour des lignes 72–90.

**À corriger :** créer l’événement outbox au sein de la même transaction que chaque création ou transition métier, puis publier après commit à partir de la ligne déjà persistée.

#### P1 — Le rejeu de l’outbox n’a pas de réservation atomique des lignes

Chaque réplique exécute le cron et fait `findMany()` des mêmes lignes en attente, puis les émet avant de les marquer. Aucun claim, verrou PostgreSQL ou `SKIP LOCKED` ne distingue le travail de deux répliques.

**Risque restant :** deux instances peuvent publier le même événement simultanément. `eventId` aide un consommateur qui déduplique correctement, mais la déduplication de tous les consommateurs et effets sonores n’est pas démontrée.

**Référence :** `backend/src/modules/realtime/outbox.service.ts` autour des lignes 121–157.

**À corriger :** réserver atomiquement les événements avec un bail/état de traitement ou un claim SQL, puis ajouter un test d’intégration avec deux ouvriers concurrents.

#### P1 — Le plafond global de 600 requêtes par minute et par IP reste incompatible avec un NAT de lieu

Le garde est global à toutes les routes qui ne sont pas explicitement exemptées. Une foule derrière le Wi-Fi, un proxy ou un NAT partage le même compteur. Avec 10 000 clients qui font chacun une requête dans la même fenêtre et partagent une IP, le plafond autorise au plus 600 requêtes; environ 9 400 sont refusées.

**Références :** `backend/src/common/securite/limitation.ts` lignes 54–59; activation globale dans `backend/src/app.module.ts` lignes 111–115.

**À corriger :** garder un seuil IP adapté aux abus, isoler les limites d’authentification par compte/adresse, et mesurer les limites des routes publiques et de commande derrière une IP partagée.

#### P1 — Une révocation d’accès WebSocket n’est appliquée qu’à la reconnexion

Le code garde les salons autorisés dans `client.data`. Son commentaire précise qu’un rôle ou rattachement retiré prend effet à la reconnexion; aucune révocation immédiate des sockets n’a été ajoutée.

**Risque restant :** un opérateur retiré d’une buvette peut continuer à recevoir ses événements jusqu’à la déconnexion ou expiration de sa socket.

**Référence :** `backend/src/modules/realtime/realtime.gateway.ts` lignes 169–212.

**À corriger :** invalider les sockets et les rooms lors de la modification d’un rôle/rattachement, ou vérifier une version d’autorisation périodiquement. Ajouter le test « accès accordé → accès retiré → aucune donnée reçue ».

### Toujours ouverts — priorité P2

#### P2 — La borne à 30 salons WebSocket peut être dépassée par des demandes concurrentes

La taille du `Set` est vérifiée avant `await this.peutRejoindre(...)`, et le salon n’est ajouté qu’après cette attente. Plusieurs demandes distinctes lancées ensemble peuvent toutes lire une taille inférieure à 30, attendre la base puis s’ajouter : la borne n’est donc pas atomique.

**Référence :** `backend/src/modules/realtime/realtime.gateway.ts` lignes 190–203.

**À corriger :** réserver le slot avant l’attente asynchrone et le libérer en cas de refus, ou sérialiser les demandes par socket; ajouter un test concurrent qui envoie plus de 30 demandes valides simultanément.

#### P2 — Rattrapage limité à 200 événements par minute

L’ouvrier lit au plus 200 lignes par passage et passe toutes les minutes. Pour une file de 10 000 événements, le rattrapage prendrait au minimum environ 50 minutes avec un seul ouvrier, hors échecs. Les répliques ne constituent pas une capacité parallèle sûre tant qu’elles peuvent prendre les mêmes lignes.

**Référence :** `backend/src/modules/realtime/outbox.service.ts` lignes 39–47 et 121–134.

**À traiter :** mesurer le débit en situation, dimensionner les lots avec backpressure et superviser l’âge et la profondeur de l’outbox.

#### P2 — « Livré » signifie ici « émis par Socket.IO », pas reçu par un client

`server.to(room).emit(...)` ne confirme pas la réception par les navigateurs. Une ligne peut être marquée livrée alors qu’aucun opérateur n’est connecté. La relecture REST du tableau de bord peut corriger une partie des écarts après reconnexion, mais l’outbox seule ne garantit pas la livraison différée à chaque consommateur.

**À clarifier :** soit documenter cette garantie comme une émission best-effort avec réconciliation REST, soit ajouter accusés de réception et conservation/relecture par consommateur si la réception effective est une exigence.

#### P2 — Railway surveille `/health`, pas `/ready`

`/ready` existe, mais `railway.json` configure toujours `healthcheckPath: "/health"`. Le contrôle Railway ne vérifie donc pas les conditions de préparation PostgreSQL/migrations de `/ready`.

**Référence :** `railway.json` ligne 18.

**À décider :** choisir explicitement le comportement de déploiement attendu et configurer Railway en conséquence.

#### P2 — Les tests d’intégration ne testent pas l’outbox sur une vraie base

Les nouveaux tests de l’outbox sont des tests unitaires. Les 16 suites d’intégration réelles ne contiennent pas de scénario d’insertion transactionnelle d’outbox ni de concurrence entre workers. L’application de la migration est vérifiée, mais pas encore le cycle complet commande → outbox → rejeu avec PostgreSQL et Redis.

**À ajouter :** rollback métier et outbox ensemble; crash après commit; deux ouvriers; Redis indisponible; émission sans client connecté; reprise après reconnexion.

#### P2 — La charge de 25 000 destinataires ne valide pas 10 000 utilisateurs actifs

`campagne-de-masse.int-spec.ts` valide l’écriture d’un lot de notifications pour 25 000 destinataires. Ce test est réussi, mais il ne mesure pas 10 000 connexions simultanées, les commandes et paiements concurrents, les reconnexions Socket.IO, ni les p95/p99 sur 20 à 50 lieux.

**À ajouter avant toute affirmation de capacité :** scénario progressif à 1 000, 5 000 puis 10 000 clients, plusieurs lieux/buvettes, commandes simultanées, mêmes plages de charge, erreurs 429, latence p95/p99, connexions PostgreSQL et Redis, et retard de l’outbox.

## Liste de reprise conseillée pour Claude Code

1. Rendre l’écriture outbox atomique avec chaque mutation de commande et de statut.
2. Ajouter un claim multi-instance atomique et tester deux workers réels.
3. Revoir le plafond IP partagé avec le scénario 10 000 clients/NAT.
4. Invalider les rooms immédiatement après révocation et rendre atomique la limite des 30 rooms.
5. Définir si l’outbox garantit une émission vers Socket.IO ou la réception par les clients.
6. Ajouter les scénarios d’intégration outbox manquants et une campagne de charge utilisateur réelle.
7. Pousser le commit local `0379b88`; relancer GitHub Actions sur la révision distante, puis contrôler Railway après déploiement.

## Conclusion

Les réparations ont effectivement résolu les erreurs de typecheck et les échecs backend de l’audit précédent; les contrôles locaux complets et les migrations et intégrations réelles passent. Cela ne valide pas encore l’absence de perte d’événement lors d’un crash, le fonctionnement sans doublon de plusieurs workers, le quota client derrière un NAT ni 10 000 utilisateurs simultanés.

Ce document remplace le statut du rapport V2 du 26 octobre pour les points revérifiés sur `0379b88`.

