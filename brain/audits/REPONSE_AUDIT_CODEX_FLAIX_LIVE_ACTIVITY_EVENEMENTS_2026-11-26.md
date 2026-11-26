# Réponse à l'audit Codex du 26/11/2026 — Flaix, événements, Live Activity

- **Audit :** `AUDIT_CODEX_FLAIX_LIVE_ACTIVITY_EVENEMENTS_2026-11-26.md` (base `a061673`, plus le travail non commité de la note Flaix, depuis livré en `912170a`).
- **Répondu par :** l'agent, le 26/11/2026. Décisions à prendre par Rémi marquées comme telles.

| Constat | Verdict | Suite |
|---|---|---|
| **P2 — erreur APNs transitoire = Live Activity figée** ; et course : l'état avance avant l'enregistrement du jeton, l'activité reste sur son état de départ | **Juste.** Le serveur ne pousse que sur un CHANGEMENT d'état Flaix ; un envoi raté, ou une activité enregistrée après le changement, n'est jamais rattrapé. | Proposé : retenir par activité l'état réellement envoyé (`etatEnvoye`), repousser à chaque tour tant qu'il diffère de l'état courant, et pousser l'état courant dès l'enregistrement du jeton. Migration (colonne nullable). |
| **P2 — le relais marque le jeton « suivi » avant le démarrage réel** | **Juste.** Un échec (API, iOS) n'est jamais retenté pendant la vie de la page. | Proposé : `suivreCommandeFlaixDansLApp` rend un résultat ; le jeton n'est retenu qu'en cas de succès (ou d'appareil sans Live Activity). |
| **P1 — identité par e-mail non vérifié** | **Juste, et déjà connu** (BUG-2026-039). Risque **accepté par Rémi** (21/11), vérification d'e-mail écartée (23/11) ; la réponse prévue est l'étiquette `[#breakeatId]` côté Flaix (demandée au développeur). | Rappelé à Rémi ; reste ouvert. |
| **P2 conditionnel — plusieurs instances** | **Juste en théorie.** Le dépôt ne règle aucun réplica (`railway.*` sans `numReplicas`) : une instance par défaut. Non vérifié dans la console Railway. | Proposé, peu coûteux : réserver chaque ligne avant de la traiter (mise à jour conditionnelle de `prochaine_lecture`). |
| **Événements importés en `DRAFT`, invisibles au client ?** | **Inexact.** Pour un lieu Flaix, `DRAFT` est commandable (`fenetre-commande.ts`, « Pourquoi DRAFT passe ici ») et la saison n'écarte que `CANCELLED` (`saison-du-lieu.ts`). Constaté en vrai le 25/11 : « Lemans Fc Vs Lyon », importé, apparaît au calendrier de l'app. | Aucune. |
| **Tests d'intégration ignorés** | Vrai dans l'environnement de l'audit (pas de `DATABASE_URL_TEST`). Ils ont tourné ici sur PostgreSQL réel avant chaque envoi (231/231 pour `912170a`), et la CI les rejoue. | Aucune. |
| **Relance « Note ta commande » marquée avant l'envoi** | Voulu (« une seule relance », jamais deux) ; contrepartie assumée : un échec Expo n'est pas retenté. | Aucune, sauf demande de Rémi. |
