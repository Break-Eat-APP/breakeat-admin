# Réponse à l'audit Codex « commandes Flaix dans Mes commandes » — 21/11/2026

- **Audit :** `brain/audits/AUDIT_CODEX_COMMANDES_FLAIX_2026-11-21.md` (révision `3d07b5d`, 1.7.44)
- **Réponse :** Claude Code, session locale, le 21/11 au soir, avec la 1.7.45
- **Méthode :** chaque constat relu dans le code avant d'être corrigé ou rangé

| # | Constat | Verdict | Suite |
|---|---|---|---|
| P1 | E-mail non vérifié : on peut lire les commandes Flaix d'un tiers | **Confirmé**, déjà connu (BUG-2026-039) | **Accepté provisoirement par Rémi** pour les essais du 22/11 (ADR-0015). À corriger avant l'ouverture au public. L'audit précise qu'une connexion Apple/Google ne suffit que si le serveur garde et contrôle la preuve `email_verified`. Retenu : l'étiquette `[#breakeatId]` (E1) reste la vraie parade |
| P2 | L'origine Flaix pouvait être en `http://` | **Confirmé** | **CORRIGÉ (1.7.45)** : seule une origine `https://` sans identifiants est acceptée, sinon la fonction s'éteint et le journal le dit (`origineSure`). Une adresse avec un chemin est ramenée à son origine. 4 tests |
| P2 | Une panne Flaix s'affiche comme « aucune commande » | **Confirmé** | **EN PARTIE (1.7.45)** : le serveur renvoie `indisponible: true` quand Flaix ne répond pas. L'app ne le lit pas encore : le bandeau « commandes Flaix momentanément indisponibles » demande une mise à jour à distance (BUG-2026-041) |
| P2 | Aucune borne sur la liste ni sur les lectures d'état | **Confirmé** | **CORRIGÉ (1.7.45)** : 50 commandes au plus (les plus récentes), 5 lectures d'état en direct au plus par liste. 1 test. La surveillance « prête » lit, elle, par paquets de 10 toutes les 15 s |
| P3 | Les états terminaux Flaix ne sont pas un contrat vérifié | **Confirmé** | Ouvert : la liste des états est demandée au développeur Flaix (cahier des charges, E1). Effet borné : 12 h au plus en « en cours » |

## Ce que l'audit ne couvrait pas

La 1.7.45 ajoute la **surveillance « Ta commande est prête »**
(`surveillance-commandes-flaix.service.ts`), écrite après la révision
auditée. Elle garde ses commandes en mémoire, ce qui va à l'encontre de la
règle 3 de `CLAUDE.md`. Ce choix est assumé et écrit dans ADR-0015 ; il reste
à relire lors d'un prochain audit.
