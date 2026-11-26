# Compte rendu — iOS 27 : la 1.1.3 plantait au lancement, build 1.1.4

- **Date :** 24/11/2026
- **Agent / développeur :** Claude Code (session locale), à la demande de Rémi
- **Commit(s) :** `04ee098` (correctif), `8ec367d` (documentation), puis
  `513e1ba`, `e383633`, `3bcea14` (build, essai, soumission)
- **Bug / décision liés :** BUG-2026-049, ADR-0005 (version = runtimeVersion)
- **Statut :** TERMINÉ. La 1.1.4 (build 47) a été publiée par Rémi.

## Objectif
Rendre l'app utilisable sous iOS 27. La 1.1.3, publique depuis le 23/11, se
fermait dès l'ouverture.

## Avant
Sur l'iPhone de Rémi (iOS 27.2.1), l'app s'ouvrait et se fermait aussitôt.
La 1.0.10 (outils plus anciens) et Android n'étaient pas touchés.

## Cause
**Confirmée par le journal de plantage** (`.ips` fourni par Rémi) :
`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`
(EXC_BREAKPOINT).

Compilée avec le SDK iOS 27 (image EAS « latest »), une app qui n'adopte pas
le cycle de vie par **scenes** (UIScene) est tuée par iOS 27 avant toute ligne
de JavaScript. Une mise à jour à distance ne pouvait rien y faire.

## Ce qui a été fait
- `apps/mobile/app.config.js` : `expo-build-properties` →
  `ios.enableSceneSupport: true` (SDK 57.0.23+). Cela ajoute un manifeste de
  scenes dans Info.plist et `EXExpoAppSceneDelegate`. Un commentaire dans le
  fichier dit « NE JAMAIS RETIRER ».
- `version` montée à 1.1.4 (changement natif, ADR-0005).
- Build iOS 47, vérifiée par Rémi sur TestFlight sous iOS 27 (« elle
  s'ouvre »), soumise avec une demande de vérification accélérée.

## Fichiers
- Modifiés : `apps/mobile/app.config.js`

## Base de données
Aucune.

## Tests
| Quoi | Commande | Résultat |
|---|---|---|
| Manifeste de scenes présent | `npx expo config --type introspect` | Présent |
| Lancement sous iOS 27 | TestFlight, iPhone de Rémi | S'ouvre |

Ce qui n'a pas pu être lancé : la compilation iOS en local (poste Windows).
Elle a été faite par EAS.

## Documentation mise à jour
CHANGELOG 1.7.52, BUGS_ET_INCIDENTS (049), REPRISE, DEPLOIEMENT (iOS 27),
ENGINEERING_MANUAL (blocs du 21 au 26/11).

## Risques restants
- Les Android sont restés en 1.1.3 : les mises à jour à distance doivent viser
  les deux versions (voir `brain/DEPLOIEMENT.md`).
- Une erreur du 24/11 à ne pas refaire : publier « 1.1.4 » pour Android.

## Déploiement
Build EAS, soumission App Store Connect, publication par Rémi (ADR-0012).

## Retour arrière
Aucun retour possible vers la 1.1.3 sous iOS 27. Ne jamais retirer
`enableSceneSupport`.

## Suite
Build 1.1.5 (26/11) : widget revu. Toujours avec `enableSceneSupport`.
