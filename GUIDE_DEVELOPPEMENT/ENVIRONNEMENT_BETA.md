# Environnement Beta — mise en place

Objectif : faire tester la nouvelle application à un groupe restreint **sans
jamais toucher aux données, commandes ou paiements réels**.

## Le principe qui garantit l'isolation

L'adresse du backend est **compilée dans chaque build**. Ce ne sont pas deux
modes d'un même programme, ce sont deux binaires distincts :

```
App publiée (store)   →  backend production  →  base production  →  Stripe live
App Beta (TestFlight) →  backend staging     →  base staging     →  Stripe test
```

Une build Beta est **physiquement incapable** d'écrire dans la production : elle
ne connaît pas son adresse.

Deux protections complètent ce cloisonnement :

- `env.ts` **refuse de démarrer** une build empaquetée sans `EXPO_PUBLIC_API_URL`
  explicite. Une erreur de configuration se voit au premier écran, au lieu de
  produire un test « réussi » qui écrivait dans les vraies commandes.
- Chaque profil EAS porte son adresse **en toutes lettres** dans `eas.json`.
  Aucune valeur par défaut partagée : confondre les deux demande un geste
  délibéré, pas un oubli.

## 1 — Créer le service staging sur Railway

À faire dans la console Railway, une seule fois.

1. **Nouveau projet** (ou nouvel environnement) nommé `breakeat-staging`.
2. **Add → Database → PostgreSQL.** C'est la base de test, vide au départ.
3. **Add → GitHub Repo →** le dépôt `breakeat-admin`, dossier racine `backend`.
4. Dans **Variables** du service, poser les valeurs listées dans
   `backend/.env.example`. Points de vigilance :

   | Variable | Valeur en staging | Pourquoi |
   |---|---|---|
   | `DATABASE_URL` | la base créée à l'étape 2 | **Jamais** celle de production |
   | `APP_ENV` | `staging` | Distingue la Beta partout où c'est utile |
   | `STRIPE_SECRET_KEY` | `sk_test_…` | Aucun euro réel ne circule |
   | `STRIPE_WEBHOOK_SECRET` | celui de l'endpoint **test** | Chaque endpoint a le sien |
   | `JWT_SECRET` | **différent** de la production | Un jeton Beta ne doit pas ouvrir la production |
   | `DEMO_MODE` | `true` en staging | Permet de commander sans payer tant que Stripe n'est pas branché |
   | `ADMIN_BOOTSTRAP_SECRET` | vide | À n'ouvrir que ponctuellement |

5. Appliquer le schéma sur la base neuve :
   `pnpm --filter backend exec prisma migrate deploy`
6. Noter l'adresse publique du service. Elle se termine par `/api/v1`.

## 2 — Brancher la Beta dessus

Dans `apps/mobile/eas.json`, profil `beta`, remplacer :

```json
"EXPO_PUBLIC_API_URL": "FILL_IN_STAGING_API_URL"
```

par l'adresse relevée à l'étape précédente.

Puis ajouter cette même adresse à `CORS_ORIGINS` du backend staging si un
dashboard doit l'appeler.

## 3 — Générer la build Beta

```bash
eas build --profile beta --platform ios
```

```bash
eas build --profile beta --platform android
```

Distribution : **TestFlight** (iOS) et **canal de test fermé** (Google Play).
Ni l'une ni l'autre n'atteint le public.

> ⚠️ **Numéros de version.** `autoIncrement` est activé sur les profils `beta`
> et `production` : EAS pose le numéro suivant à chaque build. Mais il part de
> ce que déclare `app.config.js`, aujourd'hui `version: 1.0.0`,
> `buildNumber: 1`, `versionCode: 1`.
>
> L'application publiée est en production depuis janvier 2026 : ses numéros sont
> **forcément plus élevés**. Une build qui repartirait de 1 serait refusée par
> les deux stores.
>
> Avant la première soumission, relever les valeurs réelles et les reporter dans
> `app.config.js` :
>
> - **Android** — Play Console → *Production* → dernière version → code de version
> - **iOS** — App Store Connect → l'app → *Versions* → numéro de version et de build

## Les trois profils

| Profil | `APP_ENV` | Backend | Distribution |
|---|---|---|---|
| `development` | `development` | IP locale du poste | Client de développement |
| `beta` | `staging` | staging | TestFlight / test fermé |
| `preview` | `staging` | staging | Interne (APK / Ad Hoc), hérite de `beta` |
| `production` | `production` | production | Stores |

## Avant le test réel sur événement

La phase « Beta sur événement réel » vise la **production** avec Stripe live.
Elle ne s'active jamais par accident — il faut changer explicitement
`EXPO_PUBLIC_API_URL` du profil `beta`, et régénérer une build.

Trois vérifications préalables, sans exception :

1. `DEMO_MODE` **retiré** du backend production. Il expose un endpoint qui crée
   une commande sans paiement.
2. Le webhook Stripe **live** est déclaré et sa signature vérifiée.
3. Un remboursement a été testé de bout en bout.

## Ce qui reste à faire

- **PaymentSheet côté mobile** — `@stripe/stripe-react-native` n'est pas
  installé. Le serveur, lui, est prêt : Connect en destination charges,
  webhook signé, idempotence par panier.
- **`charge.refunded`** — un remboursement fait dans Stripe ne redescend pas
  encore dans Break Eat.
- **Clé de signature Android** — pour mettre à jour l'app existante, Google Play
  exige la clé d'origine. Vérifier dans Play Console → *Test et versions* →
  *Intégrité de l'app*. Si « Signature d'application Play » est activée, Google
  détient la clé et une clé d'upload perdue se réinitialise sur demande. Sinon,
  il faut récupérer la clé auprès de Shapper.
- **Capacités de l'App ID iOS** — l'identifiant `com.shapper.breakeat` doit
  porter *Push Notifications* dans le portail Apple Developer, sans quoi la
  Live Activity ne pourra pas être signée.
- **`APNS_BUNDLE_ID`** sur Railway doit valoir `com.shapper.breakeat`. Le topic
  APNs de la Live Activity en dépend directement.

## Identifiants de l'application

Alignés sur l'application publiée, pour que la nouvelle version parte en **mise
à jour** et non en app séparée :

| | Valeur |
|---|---|
| Bundle ID iOS | `com.shapper.breakeat` |
| Package Android | `com.shapper.breakeat` |
| Identifiant Apple (soumission) | `6496204412` |
| Extension Live Activity | `com.shapper.breakeat.LiveActivity` |
