# Réponse à l'audit Codex « notifications, campagnes et « commande prête » Flaix » — 21/11/2026

- **Audit :** `brain/audits/AUDIT_CODEX_NOTIFICATIONS_2026-11-21.md` (révision `89904ef`)
- **Réponse :** Claude Code, session locale, le 21/11 vers minuit, veille du match du 22/11
- **Méthode :** chaque constat relu dans le code. **Rien n'est corrigé ce soir** :
  aucun changement serveur la veille d'un match sans nécessité ; les
  corrections sont proposées à Rémi pour après le match.

| # | Constat | Verdict | Suite |
|---|---|---|---|
| P1 | Une adresse usurpée reçoit aussi la notification « prête » | **Confirmé** : c'est le même défaut que BUG-2026-039 | Accepté provisoirement par Rémi (ADR-0015). La vraie parade reste `[#breakeatId]` (E1). Une connexion Apple/Google ne vaut preuve que si `email_verified` est gardé et contrôlé |
| P2 | « Prête » Flaix perdue ou en double (mémoire, pas de reprise) | **Confirmé.** Pour les doublons, c'est conditionnel : `railway.json` ne demande pas plusieurs instances, il y en a donc sans doute une seule (le tableau Railway n'a pas été relu) | **BUG-2026-044.** Proposé après le match : ne marquer « annoncée » qu'après un envoi réussi (`sent > 0`), sinon retenter au tour suivant, 3 fois au plus. Solution définitive : webhook E1 et réservation en base |
| P2 | Déconnexion hors ligne : le jeton reste lié à l'ancien compte | **Confirmé** (`oublierPush` efface la référence locale même si le retrait a échoué). La fenêtre se ferme quand un autre compte se connecte sur l'appareil (le jeton est réassocié) | **BUG-2026-045.** Proposé : garder le retrait en attente et le rejouer au démarrage suivant. Côté app, donc mise à jour à distance |
| P2 | Favoris utilisés pour cibler les campagnes, sans mention dans la politique de confidentialité | **Confirmé.** C'était déjà noté dans REPRISE (« confidentialité des favoris, à voir plus tard »), et la mise à jour du 21/11 a activé l'envoi des favoris | **BUG-2026-046.** À trancher par Rémi : le favori est-il un accord pour recevoir des campagnes ? Ensuite, deux phrases dans la politique et les déclarations des stores |
| P2 | L'envoi immédiat n'est pas archivé dans la cloche, contrairement au programmé | **Confirmé** (`backoffice.service.ts`, `sendNotification` : pas d'appel à `UserNotificationsService`) | **BUG-2026-047.** Décision produit à prendre ; si les deux doivent être identiques, archiver avant l'envoi immédiat |
| P3 | Pas d'écoute du renouvellement du jeton push | **Confirmé** (aucun `addPushTokenListener`) | **BUG-2026-048.** Proposé : écouter le renouvellement et réenregistrer le jeton. Côté app |

## État de mise en service (complété)

- **Android :** la build code 8 (Firebase présent, contrôlé dans l'`.aab`) est
  envoyée en production pour examen, en publication gérée. Elle sera publiée
  sur le clic de Rémi. Pas encore d'essai réel.
- **iOS :** clé APNs `9Y4LK32W23` importée dans Expo le 21/11. Pas encore de
  notification constatée sur un iPhone.
- **Essai prévu le 22/11** (commande au Stade Marie-Marvingt, puis au Palais
  Omnisports) : la commande apparaît, l'état change, la notification arrive.
