# BRAT EAT — Product Validation Contract

> Version: V1 source of truth
> Date d'entrée en vigueur : 28/05/2026
> Statut : **MANDATORY**

Ce document définit le **contrat de validation produit** que tout développement BRAT EAT doit respecter, à partir de Phase 6 incluse. Les phases précédentes (1-5) sont validées sur leur livraison technique ; les phases suivantes doivent en plus livrer une expérience visuelle, testable et démontrable.

---

## 🎯 Objectif fondamental

> Le product owner doit pouvoir **tester, valider et visualiser l'application en continu** pendant le développement — comme une vraie application en production.

Aucune fonctionnalité majeure n'est considérée comme **terminée** sans :

- ✅ Validation visuelle (capture d'écran ou preview)
- ✅ Validation mobile (preview build installable)
- ✅ Validation UX (états chargement / vide / erreur)
- ✅ Validation realtime (quand applicable)
- ✅ Approbation explicite du product owner

---

## 1. Visual Validation Rules

### Tout livrable frontend doit fournir
- Screenshots des écrans principaux
- Visual previews (Storybook ou équivalent)
- Mobile preview build (.ipa / .apk) installable
- État **loading**
- État **empty** (aucune donnée)
- État **error**
- Compatibilité **dark mode** et **light mode**

### Workflow imposé
1. Implémentation du code
2. Génération des previews (screenshots automatisés ou manuels)
3. Build preview mobile (iOS + Android)
4. Validation visuelle par le product owner
5. Documentation des limites connues
6. **Seulement ensuite** : merge / Order to next bloc

---

## 2. Storybook (Component Sandbox)

### Mandatory dès Phase 8
- Chaque composant UI réutilisable doit avoir une story isolée
- Preview indépendant (sans dépendance backend)
- Test visuel des multiples états
- Compatible dark/light + responsive

### Composants minimums attendus
- `ProductCard`
- `Checkout`
- `Cart`
- `SlotSelector`
- `DashboardCard`
- `NotificationPopup`
- `Timeline`
- `PublicScreenCard`

### Chaque composant doit exposer
- État `default`
- État `loading`
- État `error`
- État `empty`
- Variant `responsive` (mobile / tablette / desktop si applicable)
- Variant `dark` / `light`

---

## 3. Preview Builds (Mobile)

### Après chaque implémentation majeure frontend
- Build iOS (`.ipa`) distribué via TestFlight ou EAS internal
- Build Android (`.apk`) distribué via Play internal track ou EAS internal
- **QR code généré** pour installation rapide sur device du product owner

### Le product owner doit pouvoir
- Scanner un QR code → installer le preview en < 30s
- Naviguer l'app comme un utilisateur final
- Tester le realtime
- Tester un flux de commande complet
- Valider UX + animations
- Valider le comportement des dashboards

---

## 4. Staging Environment

### 3 environnements obligatoires

| Env | Usage | Données |
|---|---|---|
| **DEV** | Développement local du dev | Données vides ou seed manuelle |
| **STAGING** | Validation produit + démos | Données fake riches + simulateur |
| **PRODUCTION** | Vraie production | Données réelles |

### Staging doit simuler
- Realtime orders (création, transitions)
- Rush conditions (charge élevée, 100+ orders/min)
- Notifications push
- Slot allocation
- Dashboards opérateurs
- Public screens
- Synchronisation Flaix

### Accès staging
- URL publique stable (staging.brateat.com ou équivalent)
- Auth basique HTTP ou login dédié pour limiter l'accès
- Dashboards live accessibles par URL directe

---

## 5. Fake Data & Event Simulator

### Module obligatoire (à coder Phase 6 ou Phase 8)
Un **simulateur d'événement** doit permettre de générer à la demande :
- Fake rush periods (1000 orders sur 10 min)
- Fake orders (avec données réalistes : noms, montants, items)
- Fake suppliers
- Fake slots
- Fake realtime traffic
- Fake dashboard activity

### Objectif
- Tester l'app dans des **conditions stade réelles** avant production
- Démontrer la résilience aux investisseurs / clubs
- Onboarding facile des opérateurs (training mode)

### Endpoints attendus (staging only)
- `POST /admin/simulator/start-rush` — lance une simulation
- `POST /admin/simulator/seed-event/:type` — peuple un event type (stadium, hockey, festival, corporate)
- `POST /admin/simulator/reset` — wipe + reseed
- Protégé par `STAGING_ONLY_TOKEN`

---

## 6. Feature Review System

### Chaque feature review livrée doit inclure

- 📸 Screenshots (3+ par feature)
- 🎥 Court mobile video (15-30 secondes) — optionnel mais recommandé
- 📝 Explication technique (architecture, choix)
- 🎨 Explication UX (parcours, microcopy)
- ⚠️ Limites connues (ce qui ne marche pas encore)
- 🎯 Next improvements (ce qui est prévu)

---

## 7. Design Review Rules

### Chaque feature frontend doit livrer

- iPhone preview (screenshot ou build)
- Android preview (screenshot ou build)
- Loading state preview
- Empty state preview
- Error state preview

### Règle d'or
**Aucune implémentation frontend ne doit être validée à l'aveugle.**

Si une feature est mergée sans review visuelle = violation du contrat.

---

## 8. Demo Mode

### Mode démo intégré à l'app (toggle env)
Activé via env `DEMO_MODE=true`, il doit fournir :
- Fake ordering (clic = commande créée sans paiement réel)
- Fake dashboards (rafraîchis avec données simulées)
- Fake realtime (WebSocket émet des events scriptés)
- Fake events (Stadium, Hockey, Festival, Corporate)
- Fake slots
- Fake products

### Usages prioritaires
1. **Demos investisseurs** — l'app marche en autonomie sans backend prod
2. **Demos clubs / stades** — pour signer des contrats
3. **Validation UX en interne**
4. **Présentations sales**

---

## 9. Live Preview Access — QR Codes

### Après chaque major implementation
L'assistant doit fournir au product owner :
- 🔲 QR code iOS preview (TestFlight link ou direct .ipa)
- 🔲 QR code Android preview (.apk direct ou Play internal)
- 🌐 URL staging dashboard (operator, public ready screen, director, analytics)
- 📚 URL Storybook live (Chromatic, Vercel, ou hosting équivalent)

### Format de livraison
```
## Phase X — Visual Previews

📱 iOS preview     → [QR code image]  → https://testflight.apple.com/...
📱 Android preview → [QR code image]  → https://expo.dev/...
🌐 Operator dash   → https://operator.staging.brateat.com
🌐 Public screen   → https://screen.staging.brateat.com
📚 Storybook       → https://storybook.brateat.com
```

---

## 10. Demo Environments

### 4 démos à maintenir en staging
| Demo type | URL pattern | Données simulées |
|---|---|---|
| **Stadium** | `/demo/stadium` | Match foot 50 000 spectateurs, 30 suppliers, rush mi-temps |
| **Hockey** | `/demo/hockey` | Match hockey 15 000 spectateurs, 8 suppliers, breaks réguliers |
| **Corporate** | `/demo/corporate` | Séminaire 300 personnes, 3 suppliers, lunch concentré |
| **Festival** | `/demo/festival` | Festival 20 000 personnes, 25 suppliers, multi-day |

### Chaque demo doit
- Pre-seed la DB avec données réalistes
- Démarrer un simulateur de trafic adapté
- Être réinitialisable en 1 clic (`POST /demo/:type/reset`)

---

## 11. Product Approval Flow

### Avant qu'un bloc / phase soit déclaré terminé
- ✅ Code livré + typecheck + lint + tests
- ✅ Validation visuelle (screenshots, previews)
- ✅ Validation UX (états loading/empty/error)
- ✅ Validation realtime (si applicable)
- ✅ **Approbation explicite du product owner**

Sans ces 5 ✅, **le bloc reste ouvert**.

---

## 12. Final Objective

Le product owner doit, en permanence, se sentir :

- 🎮 **En contrôle** du produit (peut tester quand il veut)
- ⚡ **Instantané** (preview accessible en < 30s)
- 👀 **Validé visuellement** (rien n'avance à l'aveugle)
- 🚀 **Comme en production** (BRAT EAT doit ressembler à une vraie app dès le développement)

---

## Application aux phases en cours

### Phase 5 (Cart + Stripe Connect)
- ⏳ Pas de visuel — purement backend
- ✅ Validé sur livraison technique (89 tests, 0 erreur)
- 📝 Note : la migration de validation visuelle commence à partir de **Phase 6**

### Phase 6 (Orders + Realtime + Outbox)
À ce stade :
- Setup Storybook (web + RN si décision Expo)
- Setup environnement staging (déploiement backend + admin + operator)
- Setup pipeline preview builds mobile (EAS Build ou App Center)
- Premier QR code mobile livré à la fin de Phase 6

### Phases suivantes
Toutes les phases 7-10 sont assujetties à ce contrat.

---

## Modifications de ce contrat

Toute modification de ce document doit :
1. Être discutée explicitement avec le product owner
2. Être loggée dans `TASK_SUMMARY.md` et `CHANGELOG.md`
3. Indiquer la version (semver) du contrat

**Version actuelle : 1.0.0** (28/05/2026)
