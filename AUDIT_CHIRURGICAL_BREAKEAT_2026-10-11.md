# Audit chirurgicale Break Eat — 11 octobre 2026

**Révision auditée :** `0835c20`  
**Révisions précédentes contrôlées :** `86231ee`, `22e02a4`  
**Périmètre :** backend, mobile, admin, back-office, operator, CI/CD, tests et documentation.  
**Modification du code pendant l’audit :** aucune.

## Verdict

Les corrections réalisées après l’audit du 10 octobre sont effectivement présentes et validées par des exécutions locales.

Le projet est maintenant dans un état nettement plus fiable : les tests operator existent, l’export web mobile est intégré à la CI, les garde-fous Flaix sont renforcés, l’action « Mes commandes » fonctionne, le statut Flaix ne peut plus annoncer une commande prête avant le comptoir, et le script PostgreSQL local utilise la bonne configuration.

**Conclusion :** le code est globalement validé pour une phase de recette finale. Il reste un point de conformité bloquant avant publication et quelques réserves de qualité/configuration.

## Preuves d’exécution

| Contrôle | Résultat |
|---|---|
| Tests backend | 54 suites, 690 tests réussis |
| Tests mobile | 12 tests réussis |
| Tests admin | 10 tests réussis |
| Tests back-office | 12 tests réussis |
| Tests operator | 12 tests réussis |
| Total tests unitaires | **736 tests réussis** |
| Tests d’intégration PostgreSQL | **12 suites, 117 tests réussis** |
| Migrations PostgreSQL | 43 migrations, aucune en attente |
| Typecheck | Réussi sur les packages concernés |
| Lint | Réussi sans erreur ni avertissement ESLint remonté par les packages |
| Builds production séquentiels | Réussis pour backend, mobile, admin, operator et back-office |
| Export Expo web | Réussi, `apps/mobile/dist/index.html` produit |

Le build global lancé en parallèle a rencontré un verrou Windows `EBUSY` sur un fichier `.next` d’admin dans OneDrive. Le même build exécuté séquentiellement passe complètement. Ce point relève de l’environnement local et de la concurrence d’écriture, pas d’une erreur applicative détectée.

## Corrections précédentes confirmées

### Flaix — activation partielle mieux protégée

`venue-discovery.screen.tsx` ne navigue vers Flaix que si `flaixEnabled` et `flaixVenueId` sont tous les deux renseignés. Le réglage `flaixTakeover` dans l’admin est désarmé tant que le relais réel n’est pas livré. L’écran Flaix offre maintenant un retour et ne prétend plus que la commande est disponible.

### Flaix — statut « prêt » protégé

`live-activity.service.ts` empêche Flaix d’annoncer un état plus avancé que celui du comptoir. Les scénarios `PREPARING`/`READY`, retard, annulation et retard de Flaix sont couverts par des tests dédiés.

### White-label — « Mes commandes » branché

L’action `orders` navigue désormais vers l’écran de commandes au lieu de ne rien faire.

### Operator — couverture ajoutée

Le client operator dispose de 12 tests couvrant les transitions de commande, le numéro affiché, le renouvellement de session, les 401 simultanés et l’absence de boucle de rechargement.

### Export web — validation ajoutée

La CI contient maintenant un job d’export Expo web et vérifie explicitement la présence de `dist/index.html`. L’export local actuel passe et produit le livrable attendu.

### Configuration locale — port PostgreSQL corrigé

`backend/scripts/api-essai-local.js` utilise désormais `DATABASE_URL_TEST`, `DATABASE_URL` ou le port local `15432` par défaut.

## Points restant à corriger

### P1 — Mentions légales et confidentialité non accessibles

Dans `apps/mobile/src/screens/profile.screen.tsx`, les deux entrées suivantes affichent encore une alerte « Disponible prochainement » :

- Mentions légales ;
- Confidentialité.

Les CGU sont référencées dans le parcours de connexion, mais les mentions légales et la politique de confidentialité ne sont pas accessibles depuis le profil.

**Impact :** risque de refus de publication ou de non-conformité, notamment sur iOS, si les URLs légales ne sont pas accessibles au relecteur et à l’utilisateur.

**Action attendue :** fournir les deux URLs définitives, les brancher dans l’application et vérifier qu’elles répondent en HTTPS sans redirection cassée.

### P2 — État visuel incohérent pour un lieu Flaix mal configuré

Dans `apps/mobile/src/screens/venue-discovery.screen.tsx`, l’état de la carte utilise encore :

```ts
const open = v.flaixEnabled || v.currentEventId != null;
```

Mais l’ouverture réelle exige `v.flaixEnabled && v.flaixVenueId`. Ainsi, un lieu avec `flaixEnabled: true` mais sans identifiant Flaix peut être affiché comme « Ouvert », alors que le clic retombe sur l’événement actif ou sur une alerte « Bientôt ».

**Action attendue :** utiliser exactement la même condition dans l’affichage :

```ts
const flaixReady = v.flaixEnabled && Boolean(v.flaixVenueId);
const open = flaixReady || v.currentEventId != null;
```

Ajouter un test du cas `flaixEnabled: true` avec `flaixVenueId: null`.

### P2 — Avertissements Sentry sur l’application operator

Le build operator passe, mais signale :

- absence de hook `onRequestError` ;
- absence de fichier global d’erreur avec instrumentation Sentry ;
- fichier `sentry.client.config.ts` appelé à être remplacé par `instrumentation-client.ts` avec Turbopack.

**Impact :** les erreurs de rendu ou certaines erreurs serveur peuvent ne pas remonter correctement dans Sentry après une évolution de Next.js.

**Action attendue :** suivre la configuration Sentry Next.js actuelle et ajouter un test ou une vérification de présence de l’instrumentation attendue.

### P2 — Configuration ESLint Next.js incomplète

Les builds admin, back-office et operator signalent que le plugin Next.js n’est pas détecté dans la configuration ESLint.

**Impact :** le lint général passe, mais certaines règles spécifiques Next.js peuvent ne pas être appliquées.

**Action attendue :** intégrer le plugin Next.js dans les configurations ESLint des trois applications et conserver le lint comme contrôle obligatoire.

### P3 — Build parallèle fragile dans OneDrive

Le script racine lancé avec plusieurs builds Next simultanés a rencontré `EBUSY` sur `apps/admin/.next`. Le build séquentiel passe.

**Impact :** validation locale instable si le dépôt reste dans un dossier synchronisé OneDrive et si plusieurs processus écrivent les mêmes fichiers de build.

**Action attendue :** privilégier la CI Linux pour la validation de release, ou documenter une commande locale séquentielle et recommander un dossier de travail non synchronisé pour les builds.

## Fonctionnalités encore explicitement incomplètes

Ces éléments sont visibles dans le code mais ne constituent pas des régressions des corrections récentes :

- réinitialisation du mot de passe mobile annoncée comme à venir ;
- persistance backend des favoris annoncée comme à venir ;
- upload d’image produit encore présenté comme à venir ;
- contrat d’intégration Flaix réel non finalisé, le service de décision restant un stub documenté.

Ils doivent être classés comme « hors périmètre de la version publiée » ou être retirés des interfaces si la version est annoncée comme complète.

## Recommandation de clôture

1. Fournir et brancher les URLs légales et confidentialité.
2. Corriger l’état visuel du lieu Flaix sans identifiant.
3. Corriger l’instrumentation Sentry operator.
4. Activer les règles ESLint Next.js.
5. Faire une recette manuelle finale sur iOS, Android, web et les trois interfaces web.
6. Vérifier la CI sur une branche propre et conserver l’artefact `export-web-mobile`.

## Conclusion transmissible

Les bugs signalés lors de l’audit précédent ont été traités de façon sérieuse et sont couverts par des tests. Les 736 tests de packages, les 117 tests d’intégration PostgreSQL, le typage, le lint, les builds séquentiels et l’export web passent.

Break Eat peut entrer en recette finale. La seule réserve réellement bloquante avant publication est l’accessibilité des mentions légales et de la politique de confidentialité. Les autres points sont des corrections de qualité, d’observabilité ou de cohérence d’interface à fermer avant de déclarer le projet totalement terminé.
