# Audit chirurgicale — Break Eat, multi-lieux et charge

**Date :** 10 novembre 2026  
**Révision examinée :** `ef4c9c65ddeeb271469f23f85df7c5a37b4b5b59` (`main`, `origin/main`)  
**État du dépôt :** propre au début de l’audit.  
**Périmètre :** parcours mobile et web, API NestJS, découverte des lieux, relais Flaix, inscriptions, commandes/paiements, stock/créneaux, flags, temps réel, Railway, CI et bancs de charge.  
**But :** déterminer ce que les preuves actuelles permettent d’affirmer pour 10 000 utilisateurs, 50 lieux et des commandes simultanées.

## Verdict exécutif

**La structure multi-lieux est cohérente, mais je ne certifie pas une capacité de 10 000 utilisateurs simultanés ni des milliers de commandes Break Eat simultanées.** La dernière CI GitHub consultée sur `ef4c9c6` est verte pour ses six contrôles, et des améliorations ciblées ont été faites depuis l’audit précédent : cache court de la découverte, réponses de découverte moins coûteuses, historique des commandes borné, délai sur les lectures mobiles, meilleure gestion des relais Flaix.

Ces éléments démontrent que les vérifications automatisées passent; ils ne démontrent pas que la base, le pool Railway, Redis, Stripe, les créations de commandes et les workers tiennent une pointe nationale. Le banc existant mesure surtout la découverte, l’inscription et le lien Flaix sur une seule instance de développement. Le parcours de commande Break Eat complet n’a pas de résultat de charge documenté.

**Décision recommandée :** déploiement progressif possible après vérification des réglages Railway et pilote contrôlé. Je déconseille une ouverture nationale annoncée à 10 000 utilisateurs et des milliers de commandes simultanées tant qu’un banc de charge de préproduction ne mesure pas le paiement et le traitement de commande sur l’infrastructure réellement dimensionnée.

## État des contrôles

| Vérification | Résultat |
|---|---|
| CI GitHub de `ef4c9c6` | 6 contrôles terminés avec succès : Build, intégration PostgreSQL/Redis, Lint, Tests, TypeScript, export web mobile. [Run GitHub](https://github.com/Break-Eat-APP/breakeat-admin/actions/runs/42710163715) |
| Audit local de ce tour | Pas de nouvelle modification du code applicatif. Le dépôt était propre au début. |
| Banc de charge existant | Mesures locales sur une instance; pas de mesure d’un cluster Railway, de 10 000 connexions, ni de milliers de commandes/paiements. |
| État opérationnel Railway | Le nombre d’instances, les limites de pool, la présence de Redis, la valeur de `LIMITE_IP_PAR_MINUTE` et le dimensionnement réel n’ont pas été lus dans la console Railway. |

## Ce qui est correctement engagé

1. **Isolation multi-lieux.** Le modèle et les routes relient lieux, événements, organisations et points de retrait. Les chemins Flaix contrôlent le lieu et l’événement avant de produire une destination. Les tests d’isolation temps réel couvrent des salons distincts.
2. **Découverte plus efficace.** Un cache court de 15 secondes déduplique les lectures simultanées; les données spécifiques au client sont recalculées après lecture et ne sont pas partagées. La clé `CACHE_LIEUX_MS` permet de désactiver ce cache.
3. **Flux Flaix distinct du paiement Break Eat.** Sur un lieu Flaix, l’application résout une destination et ouvre le relais; le paiement et la commande se passent chez le fournisseur. Les mesures de ce flux ne doivent pas être extrapolées aux commandes Break Eat.
4. **Commandes et historique.** La liste client est bornée aux 50 commandes les plus récentes. Les écritures mobiles ne sont pas interrompues par le nouveau délai réseau destiné aux lectures.
5. **CI.** Les tests d’intégration s’exécutent avec PostgreSQL et Redis réels dans GitHub Actions. Cela valide les scénarios codés, pas la capacité de production.

## Risques ouverts qui changent le verdict de lancement

### P1 — La charge des commandes Break Eat n’est pas mesurée

Le banc documente les routes de découverte, d’inscription et de relais Flaix. Il ne simule pas un parcours réel composé du panier, de la réservation de stock et de créneau, de la création Stripe, du webhook, de la création de commande et des notifications. Il n’existe donc pas de débit mesuré ni de taux d’erreur à comparer au scénario de plusieurs milliers de commandes.

**Impact possible :** saturation de la base ou du pool, temps d’attente et erreurs au paiement, commandes payées mais retardées dans leur traitement. Le code ne permet pas de transformer une estimation de débit de découverte en promesse de commandes/seconde.

**À obtenir avant la montée en charge :** un banc de préproduction avec vraies migrations, Redis, même nombre d’instances et mêmes limites Railway; scénarios de paiement réussis, refusés, webhook rejoué, abandon de paiement et rafale sur un même créneau/stock; mesure p50/p95/p99, erreurs, connexions DB, CPU/mémoire et temps de drain des files.

### P1 — La capacité dépend d’informations d’exploitation non vérifiées

Le rapport de charge indique un pool PostgreSQL de 10 connexions par instance et que les compteurs de limitation deviennent locaux quand Redis est absent. Le total de connexions DB augmente donc avec le nombre d’instances; ajouter des instances augmente le débit applicatif mais ne multiplie pas la capacité de la base. Le nombre réel d’instances et la présence de `REDIS_URL` sur Railway ne sont pas vérifiés dans ce dépôt.

**Impact possible :** hausse du nombre d’instances qui épuise la limite de connexions PostgreSQL; ou limites de requêtes qui changent par instance en l’absence de Redis. Le résultat peut être des erreurs de connexion ou une protection anti-abus moins cohérente.

**À vérifier dans Railway :** plafond et usage des connexions PostgreSQL, nombre/minimum/maximum d’instances, `REDIS_URL`, `LIMITE_IP_PAR_MINUTE`, CPU/RAM, métriques et alertes. Établir une limite de scaling compatible avec la base.

### P1 — Les pointes d’inscription par e-mail sont limitées par Argon2

Le banc local mesure environ **14,5 inscriptions par seconde et par instance**; à 50 clients concurrents, la latence p95 mesurée est de 3,6 secondes. Argon2 est volontairement coûteux et protège les mots de passe. Le résultat varie avec le CPU alloué et ne doit pas être extrapolé linéairement sans mesure Railway.

**Scénarios indicatifs issus de ce seul banc :**

| Arrivées | Débit moyen à traiter | Lecture prudente |
|---|---:|---|
| 10 000 connexions déjà inscrites sur 10 minutes | environ 17 requêtes/s si une seule requête d’authentification par personne | Le banc d’inscription n’est pas un banc de connexion; la charge de hachage au login doit être mesurée séparément. |
| 10 000 nouvelles inscriptions sur 30 minutes | 5,6 inscriptions/s | Sous le débit moyen local d’une instance, mais les rafales et la concurrence restent à valider. |
| 10 000 nouvelles inscriptions en 10 minutes | 16,7 inscriptions/s | Dépasse le débit local mesuré d’une instance; prévoir un palier ou une file, et tester le scaling réel. |

Ne pas présenter ces calculs comme une garantie de capacité : ils utilisent une moyenne et ne prennent pas en compte la base, Redis, le réseau, les autres routes ni les variations CPU.

### P1 — Les tests ne couvrent pas la charge réelle

Les tests d’intégration vérifient la cohérence fonctionnelle sur PostgreSQL/Redis et les tests unitaires couvrent plusieurs courses logiques. Ils ne maintiennent pas 10 000 sessions actives ni des milliers de paiements concurrents. Les assertions de performance du cache (par exemple 100 lectures simultanées mutualisées) prouvent le comportement du helper, pas le débit du système complet.

**Action :** garder un test de charge isolé de la production et rendre le résultat répétable à chaque changement du chemin panier/paiement.

## Scénarios demandés

### A. 10 000 utilisateurs ouvrent l’application, 50 lieux référencés

Si les utilisateurs sont déjà inscrits et arrivent progressivement, le cache de découverte devrait réduire la répétition des lectures identiques. Il faut cependant compter plusieurs appels par ouverture (lieux, commandes, notifications, favoris selon l’écran) et mesurer le cache froid, l’expiration après 15 secondes, le cache chaud et l’utilisation mémoire. Les anciens chiffres avant cache atteignaient 43–46 req/s sur les réponses lourdes de 50 lieux, avec une latence p50 d’environ 4 secondes; **le chiffre après cache n’a pas été mesuré** dans le rapport de charge.

**Conclusion : capacité non certifiée.** Le comportement du cache est prometteur, mais le banc après cache et sur Railway est le point manquant.

### B. 10 000 personnes se connectent dans la même minute

La connexion par e-mail sollicite le hachage et les lectures de comptes/tokens. Les limites de débit, le pool DB et la configuration Redis entrent aussi en jeu. Le banc fourni mesure les inscriptions, pas cette route de connexion à cette simultanéité.

**Conclusion : non démontré.** Il faut un test de connexion concurrent qui reproduit la distribution réaliste des comptes et des jetons, avec une limite d’arrivée définie et un objectif de latence.

### C. Plusieurs milliers de commandes sur plusieurs stades

Pour les lieux reliés à Flaix, Break Eat ne traite pas les commandes : ce test porte sur la découverte et l’ouverture du relais; le volume de commandes est alors à mesurer chez Flaix. Pour les lieux en mode commande native Break Eat, chaque commande sollicite PostgreSQL, Stripe, stock, créneau, fidélité éventuelle, webhook et notifications.

**Conclusion : aucune preuve actuelle ne permet de garantir des milliers de commandes simultanées.** Les scénarios doivent distinguer les lieux Flaix des lieux où Break Eat gère réellement le panier et le paiement.

### D. Pic de trafic derrière le Wi-Fi d’un stade

Une limite d’API fondée sur l’adresse IP peut regrouper des milliers de personnes derrière la même sortie réseau. Le plafond par défaut a été remonté à 60 000 requêtes/minute et doit rester cohérent avec la valeur configurée sur Railway. Vérifier aussi que les routes coûteuses (authentification, création de commande, recherche) ont des limites adaptées par utilisateur, adresse, ou ressource; une limite IP unique ne suffit pas pour distinguer foule légitime et abus.

## Flags et mode Flaix

Les flags sont utiles pour activer une fonction par niveau global/organisation/événement lorsque le consommateur de cette fonction les consulte réellement. Ils ne constituent pas un coupe-circuit universel de l’application : l’audit des consommateurs doit rester lié à chaque feature. Le mode Flaix dispose de sa propre configuration de lieu. Avant ouverture, tester par API et interface : flag global coupé, lieu spécifique coupé, exception événement, changement propagé après cache, comportement du lien déjà ouvert et commandes en cours.

**Point de contrôle :** ne pas assimiler « flag affiché dans l’admin » à « toute route serveur est bloquée ». Le serveur doit refuser lui-même toute action désactivée, même si l’interface cache le bouton.

## Plan d’action priorisé

1. **Préproduction** : établir l’inventaire Railway (instances, limites DB, Redis, env vars, mémoire/CPU) et vérifier l’absence d’erreurs de pool aux limites de scaling.
2. **Banc de charge national** : ouvrir un test avec 50 lieux, cache froid puis chaud, 10 000 sessions HTTP réparties, et mesurer taux d’erreurs et p95/p99.
3. **Banc de paiement séparé** : simuler d’abord les appels Stripe en mode test/stub contrôlé, puis test Stripe contrôlé; inclure rafales par lieu, produits rares, créneaux pleins, rejeu webhook et abandon de paiement.
4. **Seuils de lancement** : fixer des objectifs chiffrés pour p95, taux d’erreur, connexions DB, file d’attente webhook et durée de récupération après surcharge.
5. **Ouverture graduelle** : lancer un lieu pilote, puis quelques lieux, avec un arrêt automatique du ramp-up si les seuils sont franchis.
6. **Dépôt public** : l’audit du 09/11 relève que GitHub est public. Aucun secret n’a été trouvé dans l’arbre/historique examiné par cet audit. Le code, les audits et les détails d’architecture restent visibles; rendre le dépôt privé est une décision de sécurité opérationnelle à traiter.

## Réponse directe

**50 lieux référencés :** le modèle applicatif est prévu pour cette organisation et ne montre pas de blocage structurel évident à ce nombre.  
**10 000 utilisateurs connectés en même temps :** pas certifié; les performances d’authentification et le banc du cache après modification restent à mesurer sur l’infrastructure cible.  
**Des milliers de commandes simultanées :** pas certifié pour les commandes Break Eat; aucun test de charge complet panier → paiement → webhook → commande n’est fourni. Si ces lieux passent par Flaix, la charge de commande est chez Flaix, et Break Eat ne peut garantir cette partie.  
**Mise en production nationale demain :** je ne la recommande pas sans pilote et test de charge de préproduction. La CI verte est nécessaire, mais elle ne remplace pas cette preuve de capacité.

## Relecture directe du code — incohérences confirmées

La vérification ciblée du 10/11 a repéré deux risques concrets dans le cycle panier/paiement, indépendants du manque de banc de charge :

### P1 — Le créneau peut être changé après le début du paiement

`CartService.choisirCreneau()` vérifie la propriété du panier, mais ne vérifie pas que son statut est encore `OPEN`. En parallèle, `checkout()` accepte aussi `CHECKOUT_PENDING`. Le client peut donc modifier le créneau alors que le paiement est engagé. Le code libère l’ancien créneau et écrit le nouveau sans réserver sa capacité; le traitement du paiement peut ensuite lire ce nouvel état. Cela rend la place promise et la place réellement tenue incohérentes.

**Correction attendue :** interdire toute modification du panier après passage en `CHECKOUT_PENDING`, ou déplacer la mutation et ses réservations dans une transaction/verrouillage qui garantit le même créneau jusqu’à la commande. Ajouter un test de course « paiement en cours + changement de créneau ».

### P1 — Deux appels simultanés au checkout peuvent retenir deux fois le stock ou le créneau

`checkout()` lit `stockReservedAt` et `slotReservedAt` depuis l’objet panier chargé au début de la requête, puis décide hors verrou si une retenue existe. Deux requêtes concurrentes peuvent toutes deux observer `null` et exécuter chacune la transaction de réservation avant de demander la même clé d’idempotence Stripe. L’idempotence Stripe empêche un deuxième paiement, mais ne rend pas les transactions de stock/créneau idempotentes.

**Correction attendue :** sérialiser le checkout par panier (verrou de ligne ou transition atomique conditionnelle d’état), enregistrer un identifiant de réservation par panier et rendre le renouvellement/libération idempotent. Ajouter un test concurrent sur le même panier, distinct du test de deux paniers rivaux.

Ces constats confirment des défauts de cohérence métier dans le code, et pas seulement une absence de preuve de performance. Ils doivent être corrigés avant de considérer le paiement Break Eat fiable sous rafale.

## Références du dépôt

- Audit des changements fonctionnels du 09/11 : `brain/audits/AUDIT_2026-11-09_dernieres-modifications.md`.
- Audit charge et Flaix du 09/11 : `brain/audits/AUDIT_2026-11-09_chirurgical-charge-flaix.md`.
- Banc de charge : `backend/scripts/banc-de-charge/LISEZ-MOI.md`.
- Pool PostgreSQL : `backend/src/database/pool.ts`.
- Limitation : `backend/src/common/securite/limitation.ts`.
- Cache découverte : `backend/src/common/helpers/cache-court.ts`.
- Commande et paiement : `backend/src/modules/cart/cart.service.ts`, `backend/src/modules/orders/orders.service.ts`, `backend/src/modules/webhooks/stripe-webhooks.service.ts`.
- Déploiement Railway : `railway.json`.

---

## Réponse de Claude (10/11/2026)

**D'accord avec le verdict.** La CI verte ne prouve pas la capacité : aucun
banc ne mesure le parcours panier → Stripe → webhook → commande, ni le cache
de la découverte après sa mise en place, ni l'infrastructure Railway réelle.
La recommandation — pilote sur un lieu, puis montée graduelle — est la bonne
pour le 22/11.

**Une nuance qui compte pour le 22/11 :** les trois lieux en production sont
en **Flaix**. Sur ces lieux, BreakEat ne prend ni panier, ni paiement, ni
commande : la charge de BreakEat se limite à la découverte (en cache), au
compte et aux notifications. Les deux défauts ci-dessous et le P1 « charge
des commandes » ne concernent que les lieux en commande BreakEat.

**Les deux défauts de code sont confirmés et corrigés** :

| Constat | Correction | Preuve |
|---|---|---|
| Créneau modifiable pendant `CHECKOUT_PENDING` | `choisirCreneau` exige `OPEN` (`requireEditable`), puis décide **sous verrou de ligne** (`SELECT … FOR UPDATE`) sur le panier **relu** : un paiement qui vient de prendre la place est vu, et la place est rendue au lieu d'être perdue | 3 tests unitaires (refus, refus quand le paiement démarre entre lecture et verrou, place rendue vue seulement sous verrou) ; 1 test en base réelle |
| Deux `checkout` simultanés retiennent deux fois | La marque (`stockReservedAt`, `slotReservedAt`) est posée **en premier, sous condition** (`updateMany … where …ReservedAt: null`) dans la même transaction que la retenue. La seconde requête attend le verrou, ne trouve plus de panier sans marque, ne retient rien. Si la retenue échoue, la transaction annule la marque | 2 tests en base réelle : cinq paiements simultanés du même panier → une seule retenue de stock, une seule place |

Les points de fidélité avaient déjà cette protection (`CourseSurLePanier`).

**Reste ouvert (inchangé)** : banc de charge de préproduction (découverte
après cache, connexion, paiement) ; inventaire Railway (instances, `REDIS_URL`,
`LIMITE_IP_PAR_MINUTE`, plafond de connexions PostgreSQL) ; dépôt public.
