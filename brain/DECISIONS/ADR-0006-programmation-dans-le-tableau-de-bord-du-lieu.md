# ADR-0006 — Le super admin crée les lieux ; toute la programmation se fait dans le tableau de bord du lieu

- **Date :** 10/11/2026
- **Statut :** ACCEPTÉE
- **Décidée par :** Rémi
- **Liée à :** CHANGELOG du 10/11, REPRISE (« Pièges du moment »)

## Contexte
Le back-office (super admin) et le tableau de bord du lieu proposaient les
mêmes écrans (profil, lieu, liens de commande Flaix) : deux endroits pour la
même chose, qui divergeaient.

## Décision
- Le **back-office** crée un lieu et l'accès de son responsable en un écran
  (« + Nouveau lieu »), puis renvoie vers le tableau de bord du lieu
  (« Programmer ce lieu → »).
- **Toute la programmation** (événements, liens Flaix, adversaires, photo,
  fidélité…) se fait dans le **tableau de bord du lieu** (`apps/admin`).
- Le **super admin** y entre sur tous les lieux sans en être membre, avec un
  sélecteur ; le rôle est **relu en base** côté serveur.

## Pourquoi
Une seule source pour chaque réglage ; le super admin voit exactement ce que
voit le responsable.

## Ce que ça coûte
Le back-office ne montre plus qu'un résumé du lieu.

## Où elle vit dans le code
`apps/backoffice/src/app/(backoffice)/organizations/`,
`apps/admin/src/app/(admin)/layout.tsx` (sélecteur super admin),
`apps/admin/src/components/liens-commande-flaix.tsx` (seule copie).
