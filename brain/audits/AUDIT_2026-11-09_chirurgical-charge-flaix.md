# Audit chirurgical — tenue en charge, lien Flaix, affichage (09/11/2026, soir)

**Demande de Rémi** : un audit de tout ce qui a été développé, avant l'audit
technique de Codex, avec trois priorités — **Flaix s'intègre par le lien**,
**des milliers d'utilisateurs simultanés**, **une cinquantaine de lieux**.

## Périmètre et méthode — ce qui a été lu, et ce qui ne l'a pas été

L'audit a suivi le **chemin d'un client** plutôt que l'ordre des fichiers, en
commençant par ce qui est multiplié par des milliers :

1. ce que l'app appelle à l'ouverture, et à quel rythme elle rappelle ;
2. le coût en base de chacune de ces routes (`public-venues`,
   `public-events/a-venir`, `orders`, `notifications`), index compris ;
3. la limitation de débit face au NAT d'un stade (une seule adresse IP pour
   des milliers de téléphones) ;
4. le chemin du lien Flaix, du serveur (`destinationDeCommande`,
   `fenetre-commande`, `lien-flaix`) jusqu'à la page intégrée dans l'app
   (`relais-flaix.native.tsx`) ;
5. les résultats existants du banc de charge (`scripts/banc-de-charge/LISEZ-MOI.md`).

**Pas relus ligne à ligne dans cette passe** : le parcours de commande
BreakEat (panier, Stripe, stock, créneaux) — il ne sert pas sur un lieu Flaix
et a été audité trois fois en octobre (audits Codex et V3) —, les consoles
admin / back-office / opérateur, le temps réel (sockets des consoles). Codex
devrait y passer.

## État vérifié

| Contrôle | Résultat |
|---|---|
| Tests serveur | **1 080 / 1 080** (77 suites) |
| Tests app | **130 / 130** |
| Types et lint | verts (serveur et app) |
| CI GitHub | verte sur les 7 jobs, sauf la compilation de l'admin, intermittente — sa cause sera publiée en annotation au prochain échec (`ci.yml`) |
| Sauvegardes | une sauvegarde chiffrée réelle chaque nuit depuis le 25/10 (refus sous 1 Ko), gardée 90 jours |

## Corrigé dans cette passe

| # | Gravité | Constat | Correction | Preuve |
|---|---|---|---|---|
| 1 | **Élevée (Flaix)** | La page de commande Flaix, dans l'app, **refusait net toute navigation hors de `flaixlabs.com` / `synertic.net`**. Un paiement qui redirige vers son prestataire (page Stripe, page 3-D Secure de la banque) était bloqué **sans un mot** ; sur iPhone, la règle bloquait aussi les **cadres** (un champ de carte hébergé chez le prestataire). Le prestataire de Flaix n'est pas connu d'ici : le risque ne pouvait pas être écarté. | `lib/navigation-flaix.ts` : Flaix toujours ; hors Flaix, **HTTPS seulement** (ni clair, ni schéma d'app, ni `javascript:`) ; et un **bandeau « Paiement sur <domaine> » avec cadenas** dès que la page a quitté Flaix — la barre d'adresse qui manquait pour que ce soit sûr. | 5 tests (dont domaines piégés `synertic.net.pirate.fr`) |
| 2 | **Élevée (charge)** | La découverte (`/public/venues`, liste et fiche) **relisait en base tous les lieux et leurs matchs à chaque requête** : ~45 req/s par instance au banc de charge. Mille supporters ouvrant la même fiche = mille lectures identiques. | `common/helpers/cache-court.ts` : la **lecture brute** (lieux, matchs, comptages de confidentialité) est gardée **15 s** et **les requêtes simultanées attendent la même lecture** ; la personnalisation (groupes, identité dans le lien Flaix, distance, ouverture à la minute) est refaite à chaque requête, sur une **copie profonde**. Même chose pour `a-venir` sans accès privé. Réglable sans redéployer : `CACHE_LIEUX_MS` (`0` éteint). | 9 tests du cache (100 requêtes simultanées → 1 lecture) ; un test « cache chaud » : trois clients successifs, chacun reçoit SON identité, l'anonyme aucune, une seule lecture en base |
| 3 | **Moyenne (charge)** | Le coupe-circuit par IP (30 000/min) était justifié par « 1 requête à l'ouverture » — devenu faux : **3 à 4** (lieux, notifications, commandes, favoris). Dix mille téléphones derrière l'IP d'un stade, dans la même minute : au niveau du plafond, au coup d'envoi. | Plafond par défaut **60 000/min**, décompte réécrit. Toujours réglable par `LIMITE_IP_PAR_MINUTE`. | test mis à jour |
| 4 | Moyenne (charge) | `GET /orders` rendait **tout l'historique** du client, lignes comprises, et la pastille le rappelle toutes les 10 s pendant une commande en cours. | Borné aux **50 plus récentes** (`MES_COMMANDES_MAX`). | suite orders verte |
| 5 | Moyenne (affichage sous charge) | Aucun **délai** sur les requêtes de l'app : serveur saturé = écran qui tourne une minute sans rien dire. | `lib/api/delai-lecture.ts` : 15 s pour les **lectures seulement** — une écriture (commande, paiement) n'est jamais coupée, elle peut être en cours d'enregistrement. Message clair. | 5 tests (dont « une écriture n'est jamais coupée ») |
| 6 | Faible (charge) | « À ne pas manquer » était appelé **même sans favori**. | Pas d'appel sans favori : une requête de moins à chaque ouverture pour la plupart des clients. | types, lint |
| 7 | Faible | Un cœur touché pendant le premier chargement des favoris était écrasé (audit précédent, constat 4). | Fusion au lieu du remplacement. | types, lint |

## Relu, sans constat

- **Le chemin du lien Flaix côté serveur** (`destinationDeCommande`) : lieu actif
  et club en service, match rattaché AU lieu, accès privé vérifié, lieu passé à
  Flaix, fenêtre d'ouverture (`estCommandableMaintenant` exclut annulé et
  terminé), lien présent ; identité glissée seulement si le lien a des
  étiquettes. **Jamais mis en cache** : la commande se décide toujours à la
  seconde.
- **Les domaines Flaix** sont les mêmes côté serveur (`lien-flaix.ts`) et côté
  app (`navigation-flaix.ts`), comparés au nom d'hôte exact (pas de
  `contains`).
- **Index** présents sur les lectures chaudes : `Event(venueId, startAt)`,
  `Order(userId)`, `GroupMember(userId)`, `UserNotification(userId, readAt,
  createdAt)`.
- **Pas de connexion temps réel par téléphone** : les sockets ne servent qu'aux
  consoles. La pastille n'interroge le serveur que pendant une commande en
  cours — jamais sur un lieu Flaix.
- **Limitation par adresse e-mail** (8 essais / 15 min) indépendante de l'IP.

## Ouvert — à décider ou à vérifier

| # | Sujet | Pourquoi | Qui |
|---|---|---|---|
| A | **Refaire le banc de charge** avec le cache | L'effet attendu (une lecture en base toutes les 15 s par lieu au lieu d'une par requête) n'est **pas mesuré**. Le banc refuse la production par construction ; il faut une base de test ou un environnement de préproduction | Claude, sur demande |
| B | **Railway : nombre d'instances et `REDIS_URL`** | Sans Redis, les compteurs de limitation sont par instance ; le débit se multiplie par le nombre d'instances, la base non (pool : 10 connexions par instance) | Rémi (console Railway) |
| C | **`LIMITE_IP_PAR_MINUTE` sur Railway** | Si elle est posée, elle prime sur le nouveau défaut de 60 000 | Rémi |
| D | **Inscriptions par e-mail en masse** | `argon2` : ~14,5 inscriptions/s par instance (voulu : c'est ce qui protège les mots de passe). Apple et Google n'y passent pas. Un afflux d'inscriptions par e-mail au coup d'envoi demanderait des instances de plus | à surveiller le 22/11 |
| E | **Commandes Flaix non remontées** | Sur un lieu Flaix, « Mes commandes », la Live Activity et la note restent vides tant que le flux Flaix n'existe pas | développeur Flaix |
| F | **Payer réellement une commande Flaix dans l'app** avant le 22/11 | Confirme la nouvelle règle de navigation ; si un bandeau « Paiement sur … » apparaît, c'est que Flaix redirige — et que l'ancienne règle aurait bloqué le paiement | Rémi |
| G | **Délai d'affichage des changements de l'admin** | Avec le cache, un lien Flaix corrigé ou un club suspendu se voit dans la découverte après **au plus 15 s** (la commande, elle, est refusée tout de suite) | connu, réglable |
| H | **Dépôt GitHub public** | Aucun secret, mais tout le reste est lisible | Rémi |

## Pour l'audit de Codex — où regarder en premier

- Charge : `backend/src/common/helpers/cache-court.ts`,
  `backend/src/modules/venues/public-venues.controller.ts` (`lire`,
  `projeter`), `backend/src/common/securite/limitation.ts`,
  `backend/src/database/pool.ts`, `scripts/banc-de-charge/`.
- Flaix : `backend/src/modules/venues/public-venues.controller.ts`
  (`destinationDeCommande`), `backend/src/common/helpers/fenetre-commande.ts`,
  `backend/src/common/helpers/personnaliser-lien.ts`,
  `backend/src/modules/events/lien-flaix.ts`,
  `apps/mobile/src/lib/navigation-flaix.ts`,
  `apps/mobile/src/components/relais-flaix.native.tsx`.
- Mises à jour à distance : `apps/mobile/app.config.js` (`runtimeVersion`,
  `updates`) et la règle « tout changement natif → monter la version ».
