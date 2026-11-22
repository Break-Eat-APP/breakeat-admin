# Réponse à la vérification Codex des corrections « notifications » — 22/11/2026

- **Vérification :** `brain/audits/VERIFICATION_AUDIT_CODEX_NOTIFICATIONS_2026-11-22.md` (révision `16ab2df`)
- **Réponse :** Claude Code, session locale, 22/11, avec la 1.7.47

| Constat | Verdict de Codex | Suite donnée |
|---|---|---|
| P1 — e-mail non vérifié | Non corrigé | Inchangé : risque accepté par Rémi pour les essais (ADR-0015, BUG-2026-039). Parade prévue : `[#breakeatId]` (E1) |
| P2 — « prête » Flaix | Partiellement corrigé (mémoire, abandon après 3 essais, sans cloche) | Assumé : c'est un dépannage (ADR-0015). La garantie viendra du webhook E1 et d'une réservation en base. Pas de changement |
| P2 — retrait du jeton hors ligne | Corrigé, avec une **course rare** | **CORRIGÉ (1.7.47)** : l'enregistrement d'un compte attend qu'un retrait rejoué en route soit terminé ; deux retraits rejoués ne partent jamais ensemble. Un test reproduit l'ordre décrit par Codex (retrait parti, compte qui s'enregistre, retrait qui arrive après) |
| P2 — favoris et confidentialité | Non corrigé | Reporté par Rémi (BUG-2026-046) |
| P2 — envoi immédiat et cloche | Corrigé, avec un **écart pour « à tous »** | **CORRIGÉ (1.7.47)** : l'immédiat et le programmé calculent leur public au même endroit (`ScheduledPushService.destinataires`). « À tous » = tous les comptes ACTIFS : le programmé ne retenait que les comptes ayant un appareil, y compris des comptes désactivés |
| P3 — renouvellement du jeton | Corrigé dans le code | Pas de changement ; reste à constater sur un vrai téléphone |

## Vérifications faites pour la 1.7.47
- Backend : `pnpm run typecheck` (les deux tsconfig), 84 suites / 1 198 tests,
  **intégration sur PostgreSQL 18 et Redis 7 (Docker) : 26 suites / 212**,
  compilation.
- Mobile : 15 suites / 164 tests, typage, lint.
