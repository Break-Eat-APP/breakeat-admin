# Audit des flags Break Eat / relais Flex

**Date :** 15 octobre 2026  
**Objet :** vérifier si les mécanismes permettant de désactiver des modules sont réellement opérationnels et déterminer quoi conserver avec Flex comme moteur principal de commande.  
**Modification du code pendant l’audit :** aucune.

## Conclusion courte

Il ne faut pas supprimer tout le code maintenant.

Le dépôt contient plusieurs mécanismes différents qui sont souvent appelés « flags », mais ils n’ont pas le même niveau de maturité :

| Mécanisme | État réel | Recommandation |
|---|---|---|
| `flaixEnabled` + `flaixVenueId` sur un lieu | Réellement utilisé par l’API et le mobile | Conserver, puis renommer progressivement en fournisseur externe/Flex |
| `loyaltyEnabled` sur un lieu | Réellement utilisé par le backend et le mobile | Conserver |
| `GROUP_SPLIT_ENABLED` | Réellement utilisé, mais uniquement par variable d’environnement | Conserver si global, migrer vers un flag scopé si besoin par club/événement |
| `FeatureFlag` générique | API et base présentes, mais presque aucun consommateur | Ne pas le considérer comme un système de désactivation fonctionnel tant qu’il n’est pas branché |
| `activeFeatureFlags` dans l’événement | Stocké mais jamais consommé | Déprécier puis supprimer ou brancher explicitement |
| `flaixTakeover` dans l’apparence | Désactivé dans l’admin et ignoré par le mobile | Conserver temporairement comme champ neutralisé, puis supprimer après migration |
| `useFeatureFlag` | Hook présent uniquement dans operator, sans appel réel trouvé | Conserver seulement si un vrai module l’utilise rapidement, sinon supprimer |

## Ce qui est bien construit

### Moteur générique de Feature Flags

`backend/src/modules/feature-flags/feature-flags.service.ts` possède une structure saine :

- portée `EVENT > ORGANIZATION > GLOBAL` ;
- valeur par défaut `false` si aucun flag n’existe ;
- validation des combinaisons `GLOBAL/scopeId` et `ORGANIZATION|EVENT/scopeId` ;
- contrôle d’accès par organisation et événement ;
- protection de la lecture cross-organisation ;
- suppression avec `NotFoundException` propre ;
- 16 tests unitaires ciblés réussis.

Le système est donc techniquement correct comme infrastructure. Le problème n’est pas principalement sa logique interne, mais son raccordement aux fonctionnalités.

### Flags réellement branchés

`loyaltyEnabled` est un vrai flag métier : le backend renvoie le programme désactivé si le lieu ne l’autorise pas, et le mobile n’affiche/utilise pas la remise fidélité lorsque `enabled` est faux.

`GROUP_SPLIT_ENABLED` est aussi un vrai interrupteur : il bloque les routes de partage d’addition lorsque la configuration est désactivée. En revanche, il est global au processus backend et nécessite un redémarrage/déploiement pour changer.

Le relais de lieu est piloté par `flaixEnabled` et `flaixVenueId`. Le mobile utilise maintenant une règle commune (`cheminDeCommande` / `ouvertALaCommande`) et les tests couvrent les cas incomplets : drapeau sans identifiant, identifiant vide, événement de secours et relais complet.

## Problème principal : les Feature Flags génériques ne désactivent pas réellement les modules

Le backend expose quatre routes :

```text
GET    /feature-flags
GET    /feature-flags/resolve
POST   /feature-flags
DELETE /feature-flags/:id
```

Mais l’audit trouve les limites suivantes :

1. Aucun écran `apps/admin/src/app/(admin)/feature-flags/page.tsx` n’existe actuellement, malgré les anciennes références dans le manuel et le changelog.
2. Les fonctions `apiGetFeatureFlags`, `apiSetFeatureFlag` et `apiDeleteFeatureFlag` existent dans le client admin mais ne sont appelées par aucune page actuelle.
3. `useFeatureFlag` n’est présent que dans `apps/operator` et aucun appel réel à ce hook n’a été trouvé.
4. Le mobile ne résout pas les Feature Flags génériques.
5. `Event.activeFeatureFlags` est écrit par les DTO/services d’événement mais n’est jamais lu pour modifier un comportement.

**Conséquence :** créer ou désactiver un `FeatureFlag` générique dans la base ne désactive pas automatiquement un module de l’app. Ce serait dangereux de croire le contraire en production.

Le flag ne devient effectif que lorsqu’un module fait explicitement quelque chose comme :

```ts
const { enabled } = useFeatureFlag('nom_du_module', context);
if (!enabled) return null;
```

ou lorsque le backend appelle `FeatureFlagsService.resolve()` avant d’autoriser une opération. Aujourd’hui, la majorité des modules ne font ni l’un ni l’autre.

## Avec Flex comme moteur principal

Le code source utilise actuellement le nom **Flaix**, alors que le logiciel externe est décrit ici comme **Flex**. Il faut décider si Flaix était l’ancien nom de Flex ou un autre service.

Il ne faut pas faire un remplacement global immédiat : le nom est présent dans des colonnes Prisma, routes, commentaires, tests, URLs et documents. La bonne évolution est de créer une frontière neutre :

```text
orderingMode: NATIVE | EXTERNAL
externalProvider: FLEX
externalVenueId: string
externalUrl: https://...
```

Puis de migrer progressivement les champs historiques `flaixEnabled` / `flaixVenueId`.

### Règle de sécurité recommandée

Le relais externe ne doit être actif que si sa configuration est complète :

```text
orderingMode = EXTERNAL
AND externalProvider = FLEX
AND externalVenueId présent
AND externalUrl HTTPS autorisée
```

Si une condition manque, l’app doit :

- soit revenir au parcours Break Eat natif si un événement natif est ouvert ;
- soit afficher « bientôt disponible » ;
- ne jamais afficher « Ouvert » sans parcours fonctionnel ;
- ne jamais ouvrir une URL arbitraire fournie par un client.

Le backend doit appliquer la même règle que le mobile. Un flag côté mobile seul ne constitue pas une protection : un appel direct à l’API native resterait possible si les routes backend ne vérifient pas le mode du lieu.

## Le code mort est-il grave ?

Du code mort ne provoque pas automatiquement un bug à l’exécution s’il n’est ni importé ni appelé. En revanche, il crée quatre risques réels :

- un futur développeur peut croire qu’un flag protège une fonctionnalité alors qu’il ne la protège pas ;
- une ancienne valeur stockée en base peut réactiver un parcours incomplet ;
- les modèles, API et documents deviennent contradictoires ;
- le bundle et la surface de maintenance grossissent inutilement.

Ce n’est donc pas une urgence de supprimer chaque fichier inutilisé, mais c’est dangereux de laisser des interrupteurs visibles qui promettent une désactivation inexistante.

## Recommandation concrète

### À conserver

- la logique de sélection du mode de commande par lieu ;
- `loyaltyEnabled`, car c’est un flag métier actuellement consommé ;
- `GROUP_SPLIT_ENABLED`, si le partage doit rester un réglage global ;
- le moteur générique `FeatureFlagsService` uniquement si vous voulez réellement piloter des modules sans redéploiement.

### À neutraliser immédiatement

- toute activation `flaixTakeover` qui masque l’interface sans URL Flex fonctionnelle ;
- tout flag générique qui n’est pas relié à un consommateur vérifié ;
- toute configuration Flex/Flaix incomplète présentée comme « Ouverte ».

### À supprimer plus tard, après migration

- `activeFeatureFlags` si aucun comportement ne doit finalement l’utiliser ;
- `flaixTakeover` après confirmation qu’aucune donnée de production ne dépend de cette clé ;
- `useFeatureFlag` et les fonctions admin CRUD si le projet choisit de ne pas utiliser le moteur générique ;
- les anciennes colonnes Flaix après migration vers le modèle neutre Flex/externe.

## Plan minimal avant bascule Flex

1. Décider le nom et le contrat : Flaix ou Flex, URL et identifiant de lieu.
2. Créer un seul résolveur de mode de commande partagé conceptuellement par backend et mobile.
3. Retourner à l’app un état explicite `NATIVE`, `EXTERNAL_READY` ou `UNAVAILABLE`.
4. Faire respecter ce mode côté backend, pas seulement dans l’interface mobile.
5. Ajouter une allowlist stricte des domaines HTTPS Flex/webview.
6. Tester les six cas : natif actif, externe complet, flag externe sans ID, ID sans flag, URL invalide, aucun parcours disponible.
7. Décider si les Feature Flags génériques seront réellement utilisés. Si oui, ajouter l’écran admin et brancher chaque flag à un module précis. Si non, les retirer proprement après inventaire.
8. Documenter dans `REPRISE.md` les flags encore actifs, leur portée, leur valeur par défaut et leur propriétaire.

## Verdict final

Le code de résolution des flags est correctement structuré, mais le système générique n’est pas encore un mécanisme opérationnel de désactivation des modules : il est surtout une infrastructure partiellement non utilisée.

Pour Flex, je recommande de **conserver le code natif Break Eat derrière un mode de commande désactivable**, de **neutraliser strictement les anciens parcours Flaix/Flex incomplets**, et de **ne supprimer le code qu’après avoir migré les données et vérifié les consommateurs**. Il ne faut pas supprimer en bloc maintenant ; il faut supprimer les interrupteurs trompeurs et rendre le mode externe explicite et fail-closed.
