# Audit final — derniers développements BreakEat, notifications et commandes

- **Date :** 26 novembre 2026
- **Dépôt :** `C:\dev\breakeat-admin`
- **Révision examinée :** `a3fe555` (HEAD, `main` / `origin/main`)
- **Versions déclarées :** app 1.7.71 ; build native 1.1.5
- **Commits audités depuis le dernier audit :** `1015bb1` (1.7.69, reprise des annonces BreakEat), `fd44c66` (1.7.70, catégorie Android « Commandes »), `a3fe555` (1.7.71, tri commun des commandes).
- **État Git :** propre avant et après l’audit. Aucun code modifié.
- **Portée :** corrections des bugs signalés, canaux et enregistrement push, son/notification « prête », arrivée des événements Flaix/BreakEat dans l’application, tri de « Mes commandes ».
- **Méthode :** inspection des diffs, des appels et tests concernés ; tests unitaires et vérifications TypeScript. Aucun appel réel à APNs/Expo, aucun appareil physique, aucune console de déploiement/base de production consultés.

## Conclusion

Les deux défauts relevés dans l’audit précédent sont **corrigés dans le code** :

1. Une réponse Expo normale avec `sent: 0` n’est plus considérée comme une annonce BreakEat faite ; la reprise planifiée peut retenter l’envoi.
2. Android crée une catégorie de notification « Commandes » avec son par défaut et importance haute. Le serveur n’envoie le `channelId` correspondant qu’aux appareils qui déclarent l’avoir créée.

Le nouveau tri mêlant les commandes BreakEat et Flaix par date est également cohérent et couvert par des tests.

**Je n’ai pas trouvé de nouveau défaut de code bloquant dans ces trois commits.** Cela ne prouve pas encore que tous les utilisateurs ont la correction ni qu’un téléphone sonne : l’application doit exécuter la version OTA qui crée le canal, la migration doit être présente sur le serveur, et le résultat sonore doit être vérifié sur appareils réels. Les notes de reprise du dépôt signalent que la publication OTA de 1.7.71 reste à faire.

## 1. Bug 1.7.69 — reprise d’une annonce « prête » BreakEat

**Verdict : corrigé, test ajouté.**

Dans `backend/src/modules/live-activity/live-activity.service.ts`, lorsque des jetons sont présents mais qu’aucun envoi Expo n’aboutit, la méthode ne renseigne pas `readyAnnouncedAt`. L’échéance/bail permet au rattrapage planifié de reprendre l’annonce, dans la limite des cinq essais configurés.

Le chemin APNs conserve son fonctionnement : si APNs accepte l’alerte de la Live Activity, le push Expo n’est pas envoyé en double. Si aucune activité n’est atteinte, le serveur essaie l’envoi Expo. Le texte et le son par défaut sont présents sur les deux voies. Les appels vers Flaix restent sur leur service distinct, qui vérifiait déjà `sent > 0` avant de considérer l’annonce réussie.

**Limite produit :** « accepté par APNs/Expo » n’est pas la preuve que le téléphone l’a reçu ou que l’utilisateur l’a entendu. Quand APNs accepte une alerte Live Activity, le serveur ne peut pas savoir si iOS l’a rendue audible ; il n’envoie donc pas un second push qui pourrait faire doublon.

## 2. Bug 1.7.70 — catégorie Android « Commandes »

**Verdict : cohérent dans le code, efficacité dépendante du déploiement et des réglages locaux.**

- Au moment de l’inscription du jeton, l’app Android crée `commandes` avec importance haute, son `default`, vibration et visibilité écran verrouillé.
- Le jeton n’est déclaré côté serveur avec `canalCommandes: true` qu’après succès de cette création.
- Les envois opérationnels concernés — commande prête BreakEat, commande prête Flaix, relance de note Flaix et produit manquant — ajoutent `channelId: 'commandes'` seulement aux jetons qui ont déclaré le canal.
- Les campagnes restent sur leur canal normal.
- L’enregistrement ancien qui n’envoie pas le booléen ne l’efface pas sur une ligne existante ; cela préserve la compatibilité des anciennes versions.
- La migration `20261126c_canal_commandes` ajoute un booléen avec valeur par défaut `false` ; les jetons déjà présents ne sont donc pas considérés à tort comme équipés.

Ce garde-fou évite le défaut le plus grave : envoyer un canal inconnu à un téléphone, ce qui ferait perdre sa notification. Les anciens clients qui n’ont pas exécuté le nouveau code restent sur le canal Android par défaut et n’ont pas la garantie de son/bannière apportée par cette nouveauté. Le téléphone doit ouvrir l’application après la mise à jour pour créer et déclarer le canal. Android et l’utilisateur peuvent ensuite modifier ou couper le son du canal dans les réglages système.

## 3. Bug 1.7.71 — ordre de « Mes commandes »

**Verdict : corrigé, aucun défaut relevé dans le tri.**

Les listes actives et terminées combinent maintenant commandes BreakEat (`createdAt`) et Flaix (`passeeLe`), puis sont triées ensemble de la date la plus récente à la plus ancienne. Les égalités conservent l’ordre d’entrée ; les dates absentes ou illisibles passent à la fin. La fonction de tri ne modifie pas la liste reçue.

Les tests couvrent l’ordre entre les deux sources, les fuseaux horaires, les dates illisibles, les égalités et l’absence de mutation.

## 4. Notifications et événements précédents toujours en place

Les modifications 1.7.67 restent dans le chemin courant : l’état affiché distingue permission et appareil relié ; le badge relit le serveur ; la cloche n’est marquée lue qu’après chargement réussi ; une campagne touchée ouvre la cloche ; `order_ready` ouvre « Mes commandes ». Les progressions ordinaires restent silencieuses ; « prête » est l’événement de progression qui déclenche le son.

Les corrections d’événements Flaix et de reprise Live Activity consignées dans les audits antérieurs restent hors de la zone des diffs 1.7.69–1.7.71. Les tests actuels de lecture Flaix et de mise à jour APNs réussissent, mais ce contrôle local ne remplace pas un essai Flaix en production.

## Vérifications exécutées

- **Backend :** 5 suites, **77 tests réussis** — Live Activity, payload APNs, envoi Expo, gestion des jetons et lecture des commandes Flaix.
- **Application :** 5 suites, **22 tests réussis** — canal Android, tri, inscription push, permission et ouverture des notifications.
- **TypeScript :** vérification backend et app réussie, y compris les types des tests backend.
- Certains tests produisent des journaux d’erreur ou d’avertissement attendus pour leurs scénarios simulés ; les suites concernées passent.
- `DATABASE_URL_TEST` est absent : je n’ai pas exécuté de tests d’intégration sur PostgreSQL ni vérifié l’application réelle de la migration.
- Aucun test réel sur Android/iPhone, aucun accusé de livraison Expo/APNs et aucun statut de publication de store vérifiés.

## Actions de clôture à distinguer des bugs de code

1. **Publier l’OTA 1.7.71** : `REPRISE.md` indique que cette mise à jour de tri est encore à publier.
2. **Confirmer la migration serveur** `20261126c_canal_commandes` sur l’environnement déployé.
3. **Faire un test téléphone** après OTA : vérifier l’inscription du jeton Android avec `canalCommandes=true), puis une commande prête BreakEat et une Flaix, app en premier plan/arrière-plan et écran verrouillé.
4. Vérifier aussi une commande BreakEat sans Live Activity active, afin d’exercer le fallback Expo et sa reprise si le service répond `sent: 0`.

Ces quatre points sont des vérifications de livraison et de comportement sur téléphone ; ils ne remettent pas en cause la correction constatée dans le code.

## Verdict final

**Code des trois derniers développements : conforme aux objectifs audités ; aucun nouveau bug bloquant détecté.** Les deux bugs précédemment relevés sont corrigés et testés. La confirmation de bout en bout reste conditionnée à l’OTA 1.7.71, à la migration serveur et aux essais physiques de son sur Android/iOS.

