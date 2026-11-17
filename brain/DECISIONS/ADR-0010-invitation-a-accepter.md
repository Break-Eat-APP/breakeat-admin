# ADR-0010 — Un compte existant rejoint un club seulement s'il accepte l'invitation

- **Date :** 16/11/2026
- **Statut :** ACCEPTÉE
- **Décidée par :** Rémi (« ok fais l'invitation à accepter »), instruite par Claude
- **Liée à :** BUG-2026-017 ; CHANGELOG 1.7.26 et 1.7.27 ;
  `brain/taches/2026-11-16-test-croise-organisations.md` ; migration
  `20261116_invitation_a_accepter`

## Contexte
Le test croisé entre organisations (16/11) a montré qu'un responsable de club
pouvait inviter par e-mail **n'importe quel compte existant** (client,
responsable d'un autre club, compte de la plateforme) : le compte devenait
membre **immédiatement**, sans rien voir. Combiné à « redéfinir le mot de
passe d'un membre », c'était une prise de compte (SEV-1). Le second volet
(`assertCompteDuClubSeulement`) a fermé la prise de compte ; restait qu'un
club pouvait encore faire entrer quelqu'un chez lui sans son accord.

## Options étudiées
1. Interdire d'inviter un compte existant : bloquant pour un équipier qui a
   déjà un compte client BreakEat.
2. Garder l'ajout immédiat, mais prévenir par notification : la personne
   serait membre avant d'avoir dit oui.
3. **Une invitation en attente, que la personne accepte ou refuse.**

## Décision
- **Compte existant** invité par un club : une `OrganizationInvitation` est
  créée (rôle, buvette éventuelle, inviteur), **valable 14 jours**. Rien ne
  change pour le compte tant qu'il n'a pas accepté. Il voit l'invitation à sa
  prochaine connexion (console du lieu : page `/invitations` ; poste
  opérateur : page d'accueil), et **accepte** ou **refuse**.
- **Adresse sans compte** : le club crée le compte avec un mot de passe
  provisoire, membre tout de suite (le compte n'a de vie que dans ce club).
- Réinviter la même personne **remplace** l'invitation en attente (une seule
  par compte et par club) et repousse l'échéance.
- Seul un **administrateur du club** invite et annule ; le **super admin**
  ajoute directement (rôle relu en base).
- Une invitation expirée est supprimée quand on tente de l'accepter ; la
  suppression d'un compte supprime ses invitations.

## Pourquoi
Aucune organisation ne doit pouvoir agir sur un compte qui ne lui appartient
pas (règle absolue n° 5 de `CLAUDE.md`). Le consentement de la personne est
le seul contrôle qui ne dépend pas de la bonne foi du club.

## Ce que ça coûte
Une étape de plus pour l'équipier qui a déjà un compte ; l'administrateur
doit le prévenir qu'il a une invitation à accepter. La liste « Invitations
en attente » de la page Équipe le lui rappelle.

## Ce qui la remettrait en cause
Un parcours d'équipe géré entièrement par Flaix (le responsable de lieu
travaillant dans Flaix seulement — REPRISE, plan des API) : la question des
membres se reposerait alors côté Flaix.

## Où elle vit dans le code
- `backend/src/modules/organizations/organizations.service.ts` :
  `inviteByEmail`, `inviterCompteExistant`, `accepterInvitation`,
  `refuserInvitation`, `invitationsDuClub`, `annulerInvitation`,
  `assertCompteDuClubSeulement`.
- `backend/src/modules/organizations/organizations.controller.ts` :
  `POST organizations/invitations/:id/accepter|refuser`,
  `GET` et `DELETE organizations/:id/invitations`.
- `backend/prisma/schema.prisma` : `OrganizationInvitation` (clés UUID, unique
  `userId + organizationId`).
- `apps/admin/src/app/invitations/page.tsx`, `apps/admin/src/app/(admin)/team/page.tsx`,
  `apps/operator/src/app/page.tsx`.
