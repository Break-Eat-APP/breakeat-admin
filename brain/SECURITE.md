# Sécurité — ce qui est en place, vérifié dans le code, et ce qui reste

> Ouvert le 11/11/2026 (gouvernance, étape 4). Chaque contrôle « en place » a
> été **vérifié dans le code** à cette date, avec le fichier qui l'applique.
> Un contrôle qu'on ne peut pas constater depuis le dépôt est marqué
> **À VÉRIFIER**. L'historique des chantiers sécurité : `REPRISE.md`
> (« SÉCURITÉ — fait le 18/09 »), `brain/ENGINEERING_MANUAL.md` (phase 42),
> les audits de `brain/audits/`.

## Les règles

- **Aucun secret** dans le code, Git, l'app, les journaux, une conversation.
  Variables d'environnement seulement ; chacune documentée **sans valeur**
  dans un `.env.example` (`.env.example`, `backend/.env.example`,
  `apps/mobile/.env.example`). Un secret exposé se **remplace** aussitôt.
- **Le dépôt est public** (décision de le passer en privé reportée le 11/11,
  REPRISE point 4) : raison de plus pour qu'aucun document ne contienne
  d'identifiant, de mot de passe, de clé — y compris de développement.
- **Les droits se vérifient côté serveur.** Masquer un bouton ne protège rien.
- Une **clé d'échange avec Flaix** passe par un canal sûr, jamais par e-mail
  en clair (cahier des charges Flaix, sections D et E).

## En place

| Contrôle | Comment | Où |
|---|---|---|
| Mots de passe | **argon2** | `modules/auth`, `modules/organizations`, `modules/bootstrap` |
| Sessions | Jeton d'accès court + **jeton de renouvellement haché en base, avec rotation** (un jeton déjà utilisé est refusé) | `modules/auth/auth.service.ts`, modèle `RefreshToken` |
| Connexion Apple / Google | Jetons d'identité vérifiés par les clés publiques du fournisseur | `modules/auth/social-identity.service.ts` |
| Rôles | Rôles d'organisation (`OrganizationMember`) ; le **super admin** relu **en base** à chaque contrôle, jamais pris du seul jeton | `common/guards/roles.guard.ts`, contrôleurs `orders`, `flaix`, `backoffice` |
| Isolation du temps réel | Un client ne rejoint que les salons de son organisation / événement / buvette | `modules/realtime/` (`acces-salons.spec.ts`, `isolation-buvettes.spec.ts`) |
| Entrées | Validation stricte : propriétés inconnues **refusées** (`whitelist`, `forbidNonWhitelisted`) | `backend/src/main.ts` |
| Limitation de débit | Deux compteurs : large **par IP** (un stade partage une IP, réglable sans redéployer par `LIMITE_IP_PAR_MINUTE`) ; serré **par adresse e-mail** sur l'authentification (8 essais / 15 min). Partagés par Redis si `REDIS_URL` est posée, sinon en mémoire, resserrés | `common/securite/limitation.ts`, `limitation-redis.ts` |
| En-têtes | `helmet`, politique de contenu écrite à la main ; `trust proxy` | `common/securite/entetes.ts` |
| CORS | Liste fermée d'origines, la même pour l'API et le WebSocket | `common/helpers/origines-cors.ts` |
| Webhooks Stripe | Signature vérifiée (`constructEvent`) | `modules/payments/stripe.service.ts` |
| Webhooks Flaix | HMAC-SHA256 du corps brut, comparaison à temps constant, anti-rejeu (5 min), idempotence par `eventId`, journal | `modules/live-activity/flaix-webhook.service.ts` |
| Liens Flaix | Seuls les domaines Flaix autorisés, en HTTPS, sans identifiants dans l'adresse | `modules/events/lien-flaix.ts` |
| Reçu partagé | Lien signé, à durée limitée (15 min), qui n'ouvre que ce reçu | `modules/orders/orders.controller.ts` (`recu/lien`) |
| Erreurs | Muettes en production, avec une référence à retrouver dans les journaux | filtre d'exceptions du backend |
| Documents des clubs | PDF seulement, **10 Mo** au plus, borne posée dans l'intercepteur | `modules/documents/` |
| Traçabilité | Chaque transition de commande dans `OrderAuditTrail` | `modules/orders/orders.service.ts` |
| Dépendances | Versions verrouillées (`pnpm-lock.yaml`), installation `--frozen-lockfile` en CI | `.github/workflows/ci.yml` |

## À faire

| Quoi | Pourquoi | Priorité |
|---|---|---|
| **Confirmation d'adresse e-mail** | N'importe qui peut créer un compte avec l'adresse d'un autre ; la réinscription après archivage repose sur l'adresse | P2 (demandé le 18/09) |
| **Verrouillage temporaire après échecs de connexion**, avec un message clair | La limitation freine déjà (8 / 15 min) ; un verrouillage explicite va plus loin | P3 (demandé le 18/09) |
| **Mot de passe oublié** | Code prêt, **masqué** tant que l'envoi de courriels (Brevo) n'est pas configuré | P2 — dépend de Brevo |
| **Analyse des dépendances** (Dependabot, alertes seules) | Une faille connue ne serait signalée par rien | P2 |
| **Dépôt privé** | Code et documents internes lisibles par tous | Décision de Rémi, reportée (voir REPRISE) |
| **Isolation entre organisations — test croisé systématique** (le lieu A tente de lire le lieu B, route par route) | Les contrôles existent et ont des tests, mais pas de balayage complet | P2 |

## À VÉRIFIER (hors du dépôt)

- **Sentry** est-il configuré en production (`SENTRY_DSN_BACKEND`,
  `SENTRY_DSN_MOBILE`) ? Railway → Variables ; Expo → Secrets.
- **Redis** en production (`REDIS_URL`) : sans lui, la limitation est par
  instance et le temps réel ne traverse pas plusieurs instances.
- Les **anciens secrets GitHub** Vercel (`VERCEL_TOKEN`…) ne servent plus
  depuis le 26/10 : à retirer.

## Si un secret fuit

1. Le **remplacer** aussitôt chez le fournisseur (Stripe, Railway, Apple,
   Google, Expo, Flaix) et dans les variables d'environnement.
2. Redéployer ce qui l'utilise ; vérifier `/health`.
3. Une ligne `INC-…` dans `brain/BUGS_ET_INCIDENTS.md`.
4. Ne pas réécrire l'historique Git pour l'effacer : il a déjà pu être lu.
   C'est le remplacement qui protège.
