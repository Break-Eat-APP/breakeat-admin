# Réponse à l'audit Codex du 26/11/2026 — notifications, événements, annonce « prête »

- **Audit :** `AUDIT_CODEX_NOTIFICATIONS_EVENEMENTS_PRETE_2026-11-26.md` (base `b028f84`).
- **Répondu par :** l'agent, le 26/11/2026, à la demande de Rémi.

| Constat | Verdict | Suite |
|---|---|---|
| **P1 — commande BreakEat : un échec Expo rendu SANS exception (`sent: 0`) est marqué « annoncé »**, donc jamais repris | **Juste.** `ExpoPushService.send()` ne lève jamais : une panne revient en `sent: 0`. Le test existant simulait une exception, pas ce cas. Les commandes Flaix, elles, traitaient déjà `sent: 0` comme un échec. | **Corrigé (1.7.69)** : si des appareils existent et qu'aucun n'est atteint, l'annonce n'est pas marquée faite ; le bail court et le rattrapage reprend (au plus 5 essais). Test ajouté avec `sent: 0`. BUG-2026-057. |
| **Pas de canal Android dédié** : le son dépend du canal par défaut | **Juste** (déjà relevé le 25/11). | Proposé à Rémi : un canal « Commandes » en importance haute (son, bannière), par mise à jour à distance. |
| **Le son réel n'est pas prouvable par le code** (silencieux, Concentration, réglages) | Vrai. | Essai sur téléphones réels (iPhone, Android), commandes BreakEat et Flaix. |
| Le reste (campagnes → cloche, badge relu, cloche lue après chargement, état « non relié », étapes silencieuses, « prête » seule à sonner) | Constaté conforme par l'audit. | Aucune. |
