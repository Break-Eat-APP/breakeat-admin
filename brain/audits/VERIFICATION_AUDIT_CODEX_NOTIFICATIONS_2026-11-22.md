# Vérification des corrections de Claude — notifications et Flaix — 22/11/2026

- **Dépôt :** `C:\dev\breakeat-admin`
- **Révision vérifiée :** `16ab2df` (`main`), réponse de Claude aux constats du 21/11.
- **Référence :** `brain/audits/AUDIT_CODEX_NOTIFICATIONS_2026-11-21.md` et `brain/audits/REPONSE_AUDIT_CODEX_NOTIFICATIONS_2026-11-21.md`.
- **Méthode :** revue des changements, lecture des tests concernés et exécution des tests ciblés. Aucun service externe ni appareil réel n’a été contrôlé.
- **Modifications faites pendant cette vérification :** aucun code modifié ; seul ce compte rendu est ajouté.

## Résumé

Claude a corrigé plusieurs défauts constatés : les campagnes immédiates sont maintenant archivées dans la cloche, le jeton push peut être retiré après une déconnexion hors ligne, son renouvellement est écouté, et une annonce Flaix peut être retentée après un échec d’envoi.

La correction Flaix est partielle : le suivi demeure en mémoire du processus, et trois échecs consécutifs conduisent à abandonner l’annonce. Le retrait hors ligne est également exposé à une course rare entre la suppression anonyme et une réinscription du même jeton. Le défaut de vérification de l’adresse e-mail et le choix d’utiliser les favoris pour cibler des campagnes restent ouverts.

## Résultats par constat

### P1 — Compte avec e-mail non vérifié associé aux commandes Flaix

**Non corrigé — risque toujours présent.** La réponse de Claude reconnaît que le défaut d’identité est accepté temporairement, en attente du mécanisme E1 / `[#breakeatId]`. La correction des notifications n’apporte pas de preuve de possession de l’adresse avant l’accès aux commandes. Le risque d’exposition des informations de commande via l’écran ou le push « prête » demeure donc, conformément au constat initial.

### P2 — Notification Flaix « prête » perdue ou dupliquée

**Partiellement corrigé.** `surveillance-commandes-flaix.service.ts` conserve la commande suivie et son état `prete` après un échec. Il retente alors l’envoi sans refaire la lecture Flaix, jusqu’à trois essais. Les tests couvrent l’échec suivi d’un succès, l’abandon après trois échecs et l’absence de jeton.

**Limites résiduelles :**

- le suivi et le compteur d’essais restent dans des `Map` en mémoire : redémarrer le processus efface le suivi ;
- la logique est locale au processus : plusieurs instances peuvent chacune suivre et annoncer la même commande ;
- après le troisième échec, le suivi est supprimé et l’annonce est considérée terminée ; il n’y a ni reprise durable ni alerte opérationnelle permettant de garantir la livraison ;
- sans jeton enregistré, l’annonce est clôturée sans nouvel essai. La cloche n’est pas alimentée par ce chemin de notification Flaix.

La reprise réduit donc les pertes temporaires d’envoi mais ne rend pas la livraison garantie. Une persistance/idempotence en base ou le webhook Flaix prévu reste nécessaire pour une garantie robuste.

### P2 — Déconnexion sans réseau laissant le jeton lié à l’ancien compte

**Corrigé avec une réserve de concurrence.** L’app garde le jeton dans AsyncStorage quand le retrait authentifié échoue, puis le rejoue via `POST /push-tokens/retrait` lors d’un démarrage sans session. Le serveur supprime le jeton sans authentification, après validation de son format, et la limitation globale reste active. Les tests couvrent l’échec hors ligne, la reprise, la conservation en cas de nouvel échec et la réinscription par un nouveau compte.

**Risque résiduel :** le retrait public supprime par valeur de jeton. Si une reprise asynchrone a déjà lu le jeton en attente, qu’un nouveau compte réenregistre le même jeton, puis que la suppression retardée arrive après cette réinscription, elle peut supprimer l’association du nouveau compte. Le code efface bien l’attente après réinscription quand les opérations s’enchaînent normalement, mais les tests ne couvrent pas cet ordre concurrent. La suppression est limitée à la connaissance du jeton Expo, sans renvoyer de donnée de compte ; la route est toutefois volontairement non authentifiée.

### P2 — Favoris employés pour cibler les campagnes sans explication correspondante

**Non corrigé — choix reporté.** La réponse documente le report de BUG-2026-046. Le ciblage par lieux suivis demeure dans `ScheduledPushService`, tandis que la question d’information et de choix utilisateur reste à trancher. Le dépôt ne démontre donc pas que la documentation de confidentialité et le comportement produit ont été alignés.

### P2 — Envoi immédiat absent de la cloche

**Corrigé pour le chemin d’envoi immédiat.** `BackofficeService.sendNotification` récupère les destinataires et archive le message avant l’envoi push, y compris lorsque certains clients n’ont pas de jeton. Le test de service back-office passe.

**Écart résiduel possible pour un broadcast plateforme :** l’envoi immédiat sans `orgId` archive à tous les comptes actifs, alors que `ScheduledPushService.destinataires(null, …)` ne connaît et n’archive que les utilisateurs ayant un jeton enregistré. Les campagnes immédiates et programmées ne couvrent donc pas exactement le même public dans ce cas, malgré le rapprochement effectué pour les campagnes de club.

### P3 — Renouvellement du jeton push non écouté

**Corrigé dans le code.** `ecouterRenouvellementJeton()` installe `Notifications.addPushTokenListener`, relance l’enregistrement du jeton courant et retourne une fonction de nettoyage de l’abonnement. Le test simule un nouveau jeton et vérifie son enregistrement ainsi que le retrait de l’écouteur. Aucun renouvellement réel sur téléphone n’a été testé.

## Vérifications exécutées

- Backend : `pnpm exec jest --runInBand src/modules/flaix/surveillance-commandes-flaix.service.spec.ts src/modules/backoffice/backoffice.service.spec.ts src/modules/notifications/push-tokens.service.spec.ts` — **3 suites, 56 tests réussis**.
- Mobile : `pnpm exec jest --runInBand src/lib/__tests__/jeton-push.test.ts src/lib/__tests__/ouvertures-notification.test.ts` — **2 suites, 11 tests réussis**.
- Les avertissements `hors ligne` et `après 3 essais` dans la sortie backend/mobile sont générés intentionnellement par les tests de scénarios d’échec ; ils n’ont pas fait échouer les suites.
- Aucun test multi-processus, test d’intégration sur appareil, envoi réel Expo/Flaix, contrôle de déploiement Railway ou état des stores n’a été réalisé.

## Conclusion

Les corrections annoncées de Claude sont bien présentes dans le dépôt et leurs tests ciblés passent. La correction de l’archivage immédiat est la plus complète. Les changements de jeton couvrent le scénario nominal hors ligne et la rotation, avec une course asynchrone non couverte à garder en tête. La notification Flaix reste une meilleure stratégie de reprise à court terme, pas une garantie de livraison. Les risques d’adresse e-mail non vérifiée et de ciblage des favoris sont toujours ouverts.
