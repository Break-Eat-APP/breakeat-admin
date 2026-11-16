# Compte rendu — Test croisé entre organisations

- **Date :** 16/11/2026
- **Agent / développeur :** Claude (Claude Code), à la demande de Rémi
- **Commit(s) :** voir `git log` du 16/11 (« fix(securite): … »)
- **Bug / décision liés :** BUG-2026-017, BUG-2026-018 ; `brain/SECURITE.md`
  (« Isolation entre organisations — test croisé systématique », P2)
- **Statut :** TERMINÉ pour la revue et les deux correctifs. Deux points
  restent ouverts (voir « Suite »).

## Objectif

Vérifier, route par route, qu'un membre du club A ne peut ni lire ni modifier
les données du club B. C'est le risque principal d'une app où plusieurs clubs
partagent le même serveur.

## Méthode

1. **Inventaire** : 38 contrôleurs, environ 220 routes (`backend/src`).
2. **Contrôle d'appartenance** : les droits se vérifient dans les services, par
   `requireOrgAccess` (membre de l'organisation, rôle, super admin relu en
   base). Repérage automatique des méthodes qui ne l'appellent pas (186), puis
   lecture à la main de chacune qu'une route expose. La plupart sont internes
   (paiement, temps réel, notifications) ou propres au client lui-même (son
   panier, ses commandes, vérifiés par `userId`).
3. **Ressource d'un autre club** : repérage des lectures et écritures « par
   identifiant » (environ 90) dans les services protégés, puis lecture du
   contexte. Une route qui vérifie l'organisation de l'URL doit aussi vérifier
   que la ressource visée lui appartient.

## Ce qui est sain

Le code est rigoureux dans l'ensemble. Chaque ressource est relue **avec**
l'organisation (`findFirst({ id, organizationId })`) ou rattachée par son parent
(`requireSupplierInOrg`, buvette du créneau type vérifiée contre le club du
lieu, point de retrait contre l'événement, catégorie contre la buvette, stock
par `supplier.organizationId`, documents, groupes, pushs programmés, réglages
et options par `requireScopedAccess`). Les routes du back-office portent
`@Roles(SUPER_ADMIN)` sur tout le contrôleur. Le rôle global est relu en base
par `JwtStrategy.validate`.

## Défauts trouvés et corrigés

### BUG-2026-017 — Prise de compte par réinitialisation de mot de passe (SEV-1)

- **Avant :** un responsable (ORG_ADMIN) du club A pouvait inviter par e-mail
  **n'importe quel compte existant** comme opérateur — le responsable du club
  B, un client de l'app, la plateforme elle-même — puis **redéfinir son mot de
  passe** (`PATCH …/members/:id/password`). Le contrôle ne regardait que le rôle
  dans le club A. Le compte entier changeait de main, avec ses droits ailleurs.
- **Cause :** confirmée par lecture du code
  (`organizations.service.ts`, `inviteByEmail` puis `resetMemberPassword`).
  Aucune exploitation constatée — non vérifiable depuis le dépôt (journaux
  Railway : chercher « Mot de passe redefini pour le membre »).
- **Correctif :** `assertCompteDuClubSeulement`. Un club ne redéfinit que les
  comptes qui n'ont **aucune vie hors de lui** : rôle global le plus faible,
  aucune autre organisation, jamais créé par la personne dans l'app (CGU
  acceptées), pas relié à Apple ou Google, aucune commande. Sinon, seule la
  plateforme peut le faire. Message clair au responsable.

### BUG-2026-018 — Créneau d'un autre club au comptoir (SEV-3)

- **Avant :** `PATCH /orders/:id/assign-slot` vérifiait que l'opérateur tenait
  la commande, pas le **créneau** envoyé avec elle. Un opérateur du club A
  pouvait consommer une place dans un créneau du club B (jusqu'à le marquer
  complet).
- **Correctif :** `assertCreneauCompatible` (déjà utilisé par le panier) :
  même événement, même buvette.

## Fichiers

- Modifiés : `backend/src/modules/organizations/organizations.service.ts`
  (+ spec), `backend/src/modules/orders/orders.service.ts` (+ spec)

## Base de données

Aucune migration.

## Tests

| Quoi | Commande | Résultat |
|---|---|---|
| Organisations (dont 6 nouveaux cas de refus) | `npx jest -i src/modules/organizations/organizations.service.spec.ts` | 31 / 31 |
| Commandes (dont 2 nouveaux cas) | `npx jest -i src/modules/orders/orders.service.spec.ts` | 61 / 61 |
| Typage serveur | `tsc --noEmit` | OK |
| Lint des fichiers touchés | `eslint` | OK |

La suite complète et les tests d'intégration tournent en CI.

## Risques restants

- **L'invitation rattache un compte existant sans son accord.** Le correctif
  ferme la prise de compte ; le rattachement reste possible (un responsable
  peut faire apparaître le compte de quelqu'un dans son club). À terme : une
  invitation à **accepter** par l'invité.
- **Un opérateur épinglé à une buvette** voit les commandes en cours de toutes
  les buvettes de l'événement par `GET /orders/event/:id/active` (le tableau
  `dashboard`, lui, applique l'épinglage). Interne au club, faible enjeu.
- **Réaffecter une commande à un autre créneau** ne rend pas la place du
  premier (interne au club).

## Déploiement

Railway redéploie `main` automatiquement. Vérifier `/health` → `commit`.

## Retour arrière

`git revert` des commits du 16/11 ; aucune donnée écrite.

## Suite

1. Une invitation à accepter (P2).
2. L'épinglage sur `GET /orders/event/:id/active` (P3).
3. Un test d'intégration croisé sur base réelle (deux clubs, chaque route) en
   CI, pour que la règle ne se perde pas.
