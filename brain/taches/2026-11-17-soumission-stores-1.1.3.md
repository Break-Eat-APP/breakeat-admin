# Compte rendu — Soumission de la version 1.1.3 sur l'App Store et Google Play

- **Date :** 16 et 17/11/2026
- **Agent / développeur :** Claude Code (Opus), guidage pas à pas ; Rémi a
  fait toutes les saisies dans les consoles (identifiants, contrats,
  déclarations, envois)
- **Commit(s) :** code de la 1.1.3 jusqu'à `1fbdf46` ; corrections du 17/11
  (CHANGELOG 1.7.39)
- **Bug / décision liés :** ADR-0012 ; BUG-2026-013 ; BUG-2026-027 ;
  BUG-2026-028
- **Statut :** PARTIEL — en examen chez Apple et Google ; publication
  manuelle après le passage de Stripe en production

## Objectif
Faire valider la 1.1.3 par Apple et Google, avec de nouveaux visuels, sans
rien publier tant que le paiement n'est pas en production.

## iOS — App Store
| Étape | État |
|---|---|
| Build 46 (1.1.3), `eas build` + `eas submit` | ✅ TestFlight (EAS `3c758722-…`) |
| Mise à jour à distance 1.1.3 (apporte « Au plus vite » et la pastille du lieu à la build 46) | ✅ publiée le 16/11 à 22 h 09 sur `1fbdf46` (workflow « Mise a jour a distance », vert) |
| Contrats Apple (licence du programme, annexe « Applications payantes ») | Acceptés par Rémi (bandeau disparu) |
| Version 1.1.0 « À finaliser » renommée **1.1.3**, build 46 jointe | ✅ |
| Captures : 6 visuels 1206 × 2622 (onglet « iPhone avec Dynamic Island, écran moyen ») | ✅ — les anciennes étaient héritées d'une autre taille ; les 1320 × 2868 y étaient refusées |
| Nouveautés (FR et EN), notes pour le vérificateur (Dôme → Moto Cross X → Commander → Au plus vite, carte de test) | ✅ |
| Envoi pour vérification | ✅ 16/11 à 14 h 56 (heure du Pacifique) |
| Vérification Apple | ✅ **validée le 17/11** — « Pending Developer Release » (attend le clic de Rémi) |
| Publication **manuelle** | ✅ confirmée par Rémi le 17/11 (ADR-0012) |

## Android — Google Play
| Étape | État |
|---|---|
| Clé d'importation (`F8:C8:BD:86:…:D0:08`) | ✅ **acceptée** : le certificat téléchargé de la Play Console porte cette empreinte, et l'`.aab` a été accepté au dépôt (BUG-2026-013 fermé) |
| Build Android 1.1.3, profil `beta` (`.aab`, EAS `e0805c7e-…`) | ✅ code de version **7**, SDK cible 36, API 24+ |
| Contrôle de l'`.aab` par Claude | ✅ 52 bibliothèques natives 64 bits **alignées 16 ko** ; **aucune** bibliothèque Google Play Billing ; **aucune** permission `AD_ID` ; pas de position en arrière-plan |
| Problèmes « règles » sur l'ancienne version (code 4, éditeur précédent) : Billing 8.0.0, pages mémoire de 16 ko | Réglés par le code 7 (BUG-2026-027) |
| Sécurité des données (e-mail, téléphone, ID d'appareil « non déclarés ») | ✅ déclaration refaite d'après le code, en examen (BUG-2026-028) |
| Fiche : icône 512 × 512, bannière 1024 × 500, 6 captures 1080 × 1920, textes | ✅ |
| Publication gérée | ✅ activée |
| Release production 1.1.3 (7), « déploiement complet » | ✅ en examen |

## Ce que la Sécurité des données déclare (vérifié dans le code)
Collectées, **non partagées** (Stripe, Sentry, l'hébergeur sont des
prestataires), chiffrées en transit (HTTPS seul ; le serveur redirige le HTTP) :
nom, e-mail (obligatoires) ; **téléphone** (facultatif : « Plus tard » toujours
offert) ; **position exacte** (facultative, traitée de façon éphémère pour la
recherche des lieux) ; informations de paiement (formulaire Stripe) et
historique des achats ; journaux de plantage et diagnostics (Sentry) ;
interactions avec l'app (mesure d'audience, clé d'installation tirée au sort) ;
identifiants d'appareil (jeton de notification, clé d'installation). Comptes :
e-mail + mot de passe, OAuth (Google, Apple). Suppression : depuis Profil ou
par e-mail (politique de confidentialité, § 14).

## Fichiers
- Visuels (hors dépôt, `.git/info/exclude`) : `brain/livrables/stores/final/`
  — `app-store/` (1320 × 2868), `app-store-6.3/` (1206 × 2622),
  `app-store-6.1/` (1179 × 2556), `google-play/` (captures, bannière,
  `icone-512.png`) ; textes : `brain/livrables/stores/fiche-stores.md`.

## Tests
| Quoi | Commande | Résultat |
|---|---|---|
| Contrôle de l'`.aab` | script Python (manifeste, dex, en-têtes ELF) | conforme (voir plus haut) |
| Empreinte du certificat d'importation | SHA-1 du `.der` téléchargé | `F8:C8:BD:86:29:3F:1C:1E:9F:AB:04:F0:E7:B3:3A:DB:33:77:D0:08` |

Non fait : essai de la build Android 7 sur un téléphone Android (test
interne proposé, Rémi est passé directement en production).

## Risques restants
- **Stripe en mode test en production** : ne rien publier avant le passage
  en production (ADR-0012).
- ✅ La buvette « Burger King » de Moto Cross X (nom de marque) a été
  supprimée par Rémi le 17/11.
- L'URL de la politique de confidentialité (lien de suppression du compte
  déclaré à Google) n'a pas pu être vérifiée depuis le poste (réponse 404 à
  un robot) : à ouvrir à la main.
- Textes de permission iOS (position) encore au vouvoiement : demandent une
  build native (version 1.1.4).

## Suite
1. Attendre les validations (Apple, Google : 1 à 7 jours).
2. Passer Stripe en production (plan dans REPRISE).
3. Rémi publie sur les deux stores.
