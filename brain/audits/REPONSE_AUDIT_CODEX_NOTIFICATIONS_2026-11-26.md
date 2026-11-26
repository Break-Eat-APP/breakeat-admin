# Réponse à l'audit Codex du 26/11/2026 — notifications

- **Audit :** `AUDIT_CODEX_NOTIFICATIONS_2026-11-26.md` (base `967ab2b`, 1.7.65).
- **Répondu par :** l'agent, le 26/11/2026. Corrections proposées à Rémi, en attente de son accord.

| Constat | Verdict | Correction proposée |
|---|---|---|
| **P2 — « Notifications activées » sans inscription réelle** (permission accordée, jeton jamais enregistré en base) ; sur le web, aucune push distante possible | **Juste.** C'est exactement le symptôme de BUG-2026-056 : la permission était accordée, l'appareil jamais inscrit, et rien ne le disait. | `enregistrerPush()` rend son issue ; le profil n'affiche « activées » que si le jeton est enregistré, sinon « pas encore relié — Réessayer ». Sur le web : « indisponible » (aucun Web Push côté serveur). |
| **P2 — le badge compte des push qui ne sont pas dans la cloche** (prête, produit manquant, note) | **Juste.** Tout push reçu app ouverte ajoute 1, alors que la cloche ne contient que les campagnes. | À la réception d'un push, relire le compteur du serveur au lieu d'ajouter 1. |
| **P2 — la cloche marque tout comme lu avant le chargement** | **Juste.** | Marquer comme lu seulement après un chargement réussi, et mettre la liste locale à jour. |
| **P3 — toucher une campagne n'ouvre pas la cloche** | **Juste** (pas de `type` dans les campagnes). | Le serveur ajoute `type: 'campagne'` aux campagnes immédiates et programmées ; l'app ouvre « Notifications ». |
| Points connus (push par étape retirées, favoris et consentement, relance unique, `sentCount` ≠ réception) | Déjà tranchés ou suivis. | Aucune. |
| **Aucun envoi réel vérifié après 1.7.65** | Vrai. | Essai de Rémi sur iPhone et Android : page Notifications, commande jusqu'à « prête », une campagne. |
