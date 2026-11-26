# Réponse à l'audit final du 26/11/2026 — derniers développements

- **Audit :** `AUDIT_FINAL_DERNIERS_DEVELOPPEMENTS_2026-11-26.md` (base
  `a3fe555`).
- **Répondu par :** Claude Code, le 26/11/2026.

L'audit ne relève **aucun défaut de code**. Il confirme que BUG-2026-057
(reprise de `sent: 0`) et la catégorie Android sont corrigés, et que le tri de
« Mes commandes » est juste. Il laisse quatre actions de clôture :

| Action demandée | État au 26/11 | Preuve |
|---|---|---|
| 1. Publier la mise à jour à distance 1.7.71 | **Fait**, sur les trois versions installées | 1.1.5 : `dd42a755` ; iOS 1.1.4 : `5114a4d0` ; Android 1.1.3 : `8bc56f7a` (EAS Update). La 1.7.70 avait été publiée avant : `887477b3`, `779ae468`, `f4aada48` |
| 2. Confirmer la migration `20261126c_canal_commandes` en production | **Fait** | `/health` sert `fd44c66` après déploiement. Railway applique les migrations avant de servir, et une migration en échec aurait laissé l'ancienne version en ligne (CLAUDE.md § 5). La CI l'a rejouée sur une base vierge, et `pnpm db:verifier` aussi en local |
| 3. Essai téléphone Android : jeton déclaré `canalCommandes = true`, puis « prête » BreakEat et Flaix, premier plan, arrière-plan et écran verrouillé | **À faire par Rémi** | Côté iPhone, Rémi a confirmé le 26/11 que la notification et la Live Activity fonctionnent |
| 4. Commande BreakEat sans Live Activity (repli Expo et reprise sur `sent: 0`) | **À faire** sur un lieu BreakEat | Couvert par le test unitaire `live-activity.service.spec.ts` |

Remarque sur la méthode de l'audit : les tests d'intégration n'ont pas tourné
chez Codex (`DATABASE_URL_TEST` absent). Ils ont tourné ici avant le push
(234/234, Docker), puis en CI sur `main`.
