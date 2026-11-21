# Audit Codex — commandes Flaix dans « Mes commandes » — 21/11/2026

- **Périmètre :** lecture du flux de récupération des commandes Flaix et de leur affichage dans l'app.
- **Révision du code :** `3d07b5d` (`main`, 1.7.44).
- **Méthode :** revue statique des contrôleurs, service Flaix, authentification, schéma, écran mobile, tests existants et notes du dépôt. Aucun appel à la production ni à l'API Flaix pendant cet audit.
- **Modifications :** aucune modification du code. Ce rapport est le seul fichier créé pour cet audit.
- **Limite :** les tests présents dans le dépôt ont été lus mais pas exécutés.

## Verdict

Le flux est correctement placé côté serveur : l'app ne choisit pas l'adresse interrogée, la clé Flaix n'est pas envoyée au téléphone, et les liens retournés sont filtrés en HTTPS vers l'origine configurée. En revanche, l'adresse du compte n'étant pas vérifiée, l'identité utilisée pour récupérer les commandes n'est pas une preuve que la personne contrôle cette adresse. Le risque de divulgation des commandes est réel et le dépôt le documente déjà comme BUG-2026-039.

J'ai également relevé deux réserves de disponibilité/capacité et une validation HTTPS manquante sur l'URL d'API configurée. Les effets de charge et l'impact d'une mauvaise configuration sont déduits du code ; ils n'ont pas été reproduits en production.

## Constats

### P1 — L'adresse e-mail non vérifiée permet de consulter les commandes Flaix d'un tiers

- **Fichiers :** `backend/src/modules/flaix/flaix.controller.ts:39-50`, `backend/src/modules/auth/auth.service.ts:99-117`, `backend/prisma/schema.prisma:219-260`.
- **Vérifié dans le code :** `GET /flaix/mes-commandes` est protégé par `JwtAuthGuard`, relit l'e-mail de l'utilisateur connecté en base et transmet cette adresse au service Flaix. C'est mieux qu'une adresse libre fournie par le téléphone. Toutefois, l'inscription e-mail crée immédiatement l'utilisateur et retourne des jetons ; le modèle `User` n'a pas de champ de vérification d'adresse.
- **Scénario concret :** une personne qui connaît l'adresse utilisée pour une commande Flaix, et dont le titulaire n'a pas encore créé de compte BreakEat avec cette adresse, peut s'inscrire à cette adresse sans en prouver le contrôle. Le jeton obtenu ouvre alors « Mes commandes » et expose les commandes que Flaix associe à l'adresse : produits, montants, lieu/match, heure et point de retrait, ainsi que les liens de suivi et de reçu. L'unicité de l'adresse empêche de créer un second compte si le titulaire en a déjà un ; elle ne prouve pas que le premier inscrit en est le propriétaire.
- **Impact :** accès non autorisé à des données de commande et aux liens Flaix associés.
- **Décision déjà documentée :** `brain/BUGS_ET_INCIDENTS.md` identifie BUG-2026-039 (SEV-2) et l'ADR-0015 accepte provisoirement ce risque pour les essais du 22/11. La même note indique que la version 1.1.3 est publique sur Google Play depuis le 21/11 ; le risque n'est donc pas limité aux testeurs.
- **Correctif proposé :** avant l'ouverture au public, lier une commande à un identifiant BreakEat vérifié transmis à Flaix (par exemple l'étiquette `[#breakeatId]` prévue dans E1), ou exiger une preuve vérifiée du contrôle de l'adresse avant d'autoriser cette lecture. Une simple connexion Apple/Google n'est une parade que si le serveur vérifie et conserve la preuve `email_verified` et si la route la contrôle.
- **Statut :** vulnérabilité confirmée, déjà connue et temporairement assumée par décision produit ; elle reste à résoudre avant le public.

### P2 — L'origine Flaix peut être configurée en HTTP sans rejet

- **Fichier :** `backend/src/modules/flaix/commandes-client-flaix.service.ts:134-157`.
- **Vérifié dans le code :** l'origine vient de `FLAIX_COMMANDES_URL`, puis le service y envoie la clé `X-Api-Key` et l'adresse e-mail. Aucun contrôle du protocole n'est fait avant cet appel. Le contrôle HTTPS de `lienSur` (lignes 221-230) concerne uniquement les liens renvoyés à l'app, pas la connexion serveur-à-serveur.
- **Scénario concret :** si la variable Railway est saisie par erreur avec une origine `http://`, l'adresse e-mail et la clé d'API partent sans chiffrement vers cette destination.
- **Impact :** interception de données personnelles et de la clé d'intégration en cas de configuration HTTP ou de destination incorrecte.
- **Correctif proposé :** valider l'origine au démarrage et refuser toute valeur qui n'est pas une URL HTTPS sans identifiants ; conserver une liste d'hôtes Flaix autorisés si leurs domaines sont stables.
- **Statut :** garde absente dans le code. Je n'ai pas vérifié la valeur effective de Railway.

### P2 — Une panne Flaix est affichée comme une absence de commandes

- **Fichiers :** `backend/src/modules/flaix/commandes-client-flaix.service.ts:151-168`, `apps/mobile/src/screens/order-history.screen.tsx:235-240, 463-465`.
- **Vérifié dans le code :** une erreur réseau ou une réponse HTTP non réussie produit `{ active: true, commandes: [] }`. L'app ignore l'échec de sa requête Flaix et, si les autres commandes sont également absentes, affiche « Aucune commande pour le moment ».
- **Scénario concret :** Flaix est indisponible ou refuse la clé au moment du rafraîchissement ; le client vient de payer sur Flaix mais BreakEat lui montre une liste vide, sans signaler que la lecture a échoué.
- **Impact :** confusion avec une commande perdue, perte de confiance et risque que le client recommence son parcours de commande.
- **Correctif proposé :** distinguer « aucune commande » de « Flaix momentanément indisponible » dans la réponse et l'écran ; proposer une nouvelle tentative et, si disponible, garder visible le dernier résultat avec son heure de mise à jour.
- **Statut :** comportement vérifié et volontairement « sans erreur » côté serveur ; l'ambiguïté côté client reste un défaut d'information.

### P2 — Le nombre de lectures de statut n'est pas borné

- **Fichiers :** `backend/src/modules/flaix/commandes-client-flaix.service.ts:170-180`, `apps/mobile/src/screens/order-history.screen.tsx:273-318`.
- **Vérifié dans le code :** chaque réponse Flaix est convertie sans limite de taille visible dans ce service ; chaque commande considérée en cours déclenche ensuite un appel de statut dans un `Promise.all`. L'écran mobile relance le chargement toutes les 10 secondes tant qu'une commande est en cours. Le cache de 5 secondes est en mémoire par instance du backend.
- **Impact déduit :** un historique volumineux ou plusieurs commandes simultanément ouvertes multiplient les appels de statut. Plusieurs instances Railway ne partagent pas ce cache ; en période de forte affluence, cela peut charger l'API Flaix, ralentir l'écran ou faire apparaître les états comme indisponibles.
- **Correctif proposé :** confirmer avec Flaix les limites et la pagination de l'API, puis borner la liste et la concurrence des lectures de statut, ou récupérer l'état en lot si Flaix le permet. Un test de charge ciblé devra mesurer la charge générée avant d'augmenter le polling.
- **Statut :** absence de borne vérifiée dans ce service ; saturation non reproduite. La note de livraison 1.7.44 signale déjà que le polling convient aux essais, pas à une forte affluence.

### P3 — Les états terminaux Flaix ne sont pas couverts par un contrat vérifié

- **Fichier :** `backend/src/modules/flaix/commandes-client-flaix.service.ts:35-48, 184-218, 233-249`.
- **Vérifié dans le code et la documentation :** les états terminaux du suivi en direct sont une liste codée en anglais (`collected`, `picked_up`, `delivered`, etc.) ; le statut de la liste traite aussi des libellés français (`recuperee`, `annulee`). Le compte rendu de livraison indique que la liste complète des états Flaix n'est pas documentée.
- **Scénario conditionnel :** si le suivi public renvoie un état terminal non présent dans `ETATS_TERMINAUX`, le serveur le considère encore « en cours » et continue à rafraîchir la commande jusqu'à la limite de 12 heures.
- **Impact :** statut ou filtre « En cours » incorrect, appels supplémentaires à Flaix.
- **Correctif proposé :** obtenir de Flaix le contrat exhaustif des états et centraliser leur normalisation avant de classifier une commande.
- **Statut :** risque dépendant des valeurs réellement renvoyées ; non confirmé sans contrat ou capture d'une réponse réelle.

## Contrôles positifs vérifiés

- L'endpoint est authentifié par `JwtAuthGuard`.
- L'app ne peut pas fournir l'adresse interrogée : le serveur la relit depuis l'utilisateur lié au JWT.
- L'API key Flaix reste dans la configuration serveur `FLAIX_COMMANDES_API_KEY`, pas dans l'app.
- Les liens de suivi et de reçu sont limités à HTTPS et à la même origine que l'API Flaix configurée ; les jetons de commande hors format sont rejetés.
- Une panne de cette lecture ne transforme pas la réponse en erreur serveur et ne supprime pas les commandes BreakEat.

## Vérifications non effectuées

- Aucun test, lint, typage ou test de charge n'a été lancé pendant cette revue statique.
- Aucune requête réelle à Flaix, Railway, Google Play ou à une autre console n'a été faite.
- Je ne confirme ni les valeurs actuellement définies sur Railway, ni les limites/règles de l'API Flaix.

