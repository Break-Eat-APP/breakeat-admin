# Audit chirurgical — une saison entière du relais Flaix

**Date :** 16 octobre 2026
**Révision auditée :** `585dd0c`
**Question posée :** vingt lieux qui tournent en même temps, vingt événements
chacun configurés à la date sur six mois de saison — est-ce que tout s'ouvre
correctement, et est-ce qu'on ne peut plus commander une fois le match terminé ?

---

## Le verdict en trois lignes

**Aucun écart de comportement sur 15 380 vérifications.** Les quatre règles de
sécurité tiennent : terminé, suspendu, annulé, pas encore ouvert.

**Un défaut de PERFORMANCE trouvé et corrigé** : la règle d'ouverture coûtait
100 ms de calcul pur pour une saison, 716 ms à cinquante lieux sur trois
saisons. Elle en coûte respectivement 3,7 ms et 44 ms.

**Une remarque de structure** reste ouverte, sans urgence : la recherche charge
TOUS les événements de chaque lieu, y compris ceux d'il y a trois ans.

---

## 1. La scène, et pourquoi celle-là

| | |
|---|---|
| Lieux | 20, tous en Flaix, fuseau `Europe/Paris`, lien ouvert à 08:00 |
| Événements | 400 — vingt par lieu, un tous les neuf jours |
| Saison | 17/10/2026 → 15/04/2027, **six mois** |
| Horaires de coup d'envoi | 20h30, 14h00, 18h45, **00h30**, **07h00** |
| Contrôles négatifs | 60 événements en brouillon / annulé / suspendu, **avec un lien posé** |

Trois choix comptent :

- **tous les lieux jouent les mêmes jours.** C'est le samedi de championnat, et
  c'est lui qui met vingt relais en service à la même minute ;
- **deux horaires tombent AVANT 8 h** (00h30 et 07h00). Ce sont les seuls cas
  où le garde-fou « jamais après le coup d'envoi » se déclenche ;
- **la saison traverse les DEUX changements d'heure** — 25/10/2026 et
  28/03/2027. Un calcul qui coderait « +2 h » une fois pour toutes passerait
  l'automne et casserait en novembre.

Les 60 événements non ouvrables portent un lien **exprès** : un lien qui traîne
sur un brouillon est la situation réelle (on colle la saison à l'avance), et
c'est celle qui doit ne rien ouvrir.

## 2. La méthode : des propriétés, pas une seconde opinion

Recalculer le résultat attendu avec le même raisonnement que le code testé ne
prouve rien — cela confirme ses erreurs. L'audit vérifie donc des **propriétés
qui doivent tenir quoi qu'il arrive** :

| | Propriété |
|---|---|
| P1 | un lien rendu appartient à un événement **ACTIF**, et porte une adresse |
| P2 | l'instant est dans `[ouverture, fin]` de cet événement |
| P3 | aucun événement **terminé** ne rend jamais de lien |
| P4 | parmi les ouverts, c'est celui qui a **commencé le premier** qui gagne |
| P5 | si rien n'est ouvert, l'heure annoncée est 8 h locales le jour de CE match (ou son coup d'envoi), et le match annoncé n'est pas déjà fini |
| P6 | un lieu ne rend **jamais** l'adresse d'un autre lieu |

**769 instants × 20 lieux = 15 380 vérifications.** Les instants : un balayage
de toute la saison toutes les six heures, plus les minutes qui comptent (7h59,
8h00 pile, 8h01, et 8 h les deux jours de changement d'heure).

## 3. Résultat : aucun écart

```
ouvert : 564 · bientôt : 13 352 · aucun : 1 464
AUCUN ÉCART sur 15380 vérifications.
```

Les instants remarquables, lus en clair :

| Instant | Attendu | Obtenu |
|---|---|---|
| 17/10 **07:59** | pas encore | *ouvre à 17/10 08:00* |
| 17/10 **08:00** pile | ouvert | **OUVERT** → `l1-j1` |
| 17/10 08:01 | ouvert | **OUVERT** → `l1-j1` |
| 25/10 08:00 (passage à l'heure d'hiver) | pas de match ce jour-là | *ouvre à 26/10 08:00* |
| 28/03 08:00 (passage à l'heure d'été) | ouvert | **OUVERT** → `l1-j19` |

**Le samedi de championnat, à midi** : 12 lieux ouverts simultanément, **12
adresses distinctes**. Les 8 autres avaient joué le matin (00h30 et 07h00) et
étaient déjà fermés — ce qui démontre P3 au passage.

**Vingt jours après le dernier match** : 0 lieu encore ouvert.

## 4. Les quatre règles de sécurité, éprouvées sur l'API RÉELLE

Pas en simulation : requêtes HTTP sur le serveur, avec le vrai lien Flaix.

| Scénario | Réponse de l'API |
|---|---|
| Match en cours | `https://commande.flaix.bo.synertic.net/o/n-n` |
| Match **terminé il y a une minute** | **fermé** |
| Match **suspendu** par le club en plein service | **fermé** |
| Match **annulé** | **fermé** |
| Retour en ACTIF | le lien revient |

C'est la ceinture côté Break Eat. Flaix a la sienne — les deux doivent exister :
une page dont le lien aurait fuité resterait refusée par Flaix, et un lien qui
traîne dans l'app ne doit pas y mener non plus.

## 5. LE DÉFAUT TROUVÉ : la règle coûtait cher

La fonction appelle `Intl.DateTimeFormat` pour lire le jour du match dans le
fuseau du lieu — c'est le seul outil du runtime qui connaisse les changements
d'heure. Mais elle en **construisait un neuf à chaque appel**, soit quatre par
événement.

Mesuré :

| | Avant | Après |
|---|---|---|
| 20 lieux × 20 événements (une saison) | **100,7 ms** | **3,7 ms** |
| 20 lieux × 60 événements (trois saisons) | 284,1 ms | 17,9 ms |
| 50 lieux × 60 événements | **716,3 ms** | **44,2 ms** |
| *L'API complète, 20 lieux* | *117–210 ms* | **27–29 ms** |

Deux corrections, aucune ne change le comportement (les 22 tests de la règle
passent à l'identique) :

1. **le formateur est gardé par fuseau.** Mesuré isolément : réutiliser un
   `Intl.DateTimeFormat` est **16,5 fois** plus rapide que le reconstruire. Le
   cache est minuscule — un objet par fuseau, et un club n'en a qu'un — et ne
   périme jamais : le fuseau d'un lieu ne change pas ;
2. **le test le moins cher d'abord.** On vérifiait l'heure d'ouverture (cher)
   avant la date de fin (gratuit). Au bout de trois saisons, l'immense majorité
   des événements d'un lieu sont terminés : on payait le prix fort pour une
   réponse connue d'avance.

Vérifié après correction, à 1 200 événements : **41 ms**.

> Ce défaut n'aurait cassé aucun test. Il se serait vu un samedi de
> championnat, en accueil, sur vingt lieux à la fois — c'est-à-dire au pire
> moment et sans explication.

## 6. Ce qui reste, et qui n'est pas urgent

**La recherche charge tous les événements de chaque lieu, depuis toujours.**
`public-venues.controller.ts` ne filtre pas sur la date : trois saisons, c'est
1 200 lignes transférées à chaque recherche ; dix saisons, 4 000.

Ce n'est pas un bug, et le coût de calcul est désormais maîtrisé (41 ms à
1 200). Mais la croissance est linéaire et sans borne.

⚠️ **Et ce n'est pas un filtre anodin à poser.** La confidentialité des lieux
privés (phase 16.1) se décide sur l'ENSEMBLE des événements : un lieu dont
aucun événement n'est accessible est masqué, sans révéler son existence.
Filtrer sur « à venir » changerait cette règle — un lieu privé dont le seul
événement est passé redeviendrait visible. La correction demande donc deux
lectures, ou un compte séparé. À faire avec ce garde-fou en tête, pas en
passant.

## 7. Ce que l'audit N'A PAS couvert

Honnêteté sur le périmètre :

- **la charge réseau simultanée** (mille clients qui ouvrent l'app à 20h29) n'a
  pas été éprouvée. Ce qui est mesuré ici est le coût d'UNE requête ;
- **la WebView sur un vrai téléphone** : vérifiée sur l'export web (iframe) et
  par lecture du code natif, pas sur un appareil — la build n'est pas encore
  partie ;
- **le retour de commande de Flaix** : inexistant à ce jour. Tant qu'il manque,
  l'app ne sait pas qu'une commande a eu lieu, donc ni notification, ni Live
  Activity, ni décompte ;
- **le verrou serveur** : un lieu basculé en Flaix refuse le parcours Break Eat
  dans l'ÉCRAN, pas encore dans l'API. Signalé par l'audit des flags du 15/10,
  toujours ouvert.

## 8. Reproduire

```bash
node scripts/audit-saison.cjs      # depuis backend/, après `nest build`
```

Le script recrée les 20 lieux et 400 événements dans la base d'essai
(organisation `99999999-…`, jetable), puis rejoue les 15 380 vérifications. Il
sort en code 1 au moindre écart.
