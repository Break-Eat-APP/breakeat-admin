import io
import os
import re
import markdown

RACINE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')).replace(os.sep, '/') + '/'
src = io.open(RACINE + 'brain/FLAIX_FLUX_EVENEMENTS_CAHIER_DES_CHARGES.md', encoding='utf-8').read().replace('\r\n', '\n')


def section(debut, fin):
    """Le texte entre deux titres (le titre de début exclu)."""
    i = src.index(debut)
    i = src.index('\n', i) + 1
    j = src.index(fin, i)
    return src[i:j].strip('\n -')


A = section('### A — le lien principal', '### B — le flux de données')
B = section('### B — le flux de données', '### C — le fichier iCal')
C = section('### C — le fichier iCal', '### D — la passerelle')
E1 = section('#### E1 — Les commandes Flaix', '#### E2 — ')

# Les sous-titres d'origine (####) deviennent des ### dans le dossier.
B = re.sub(r'^#### ', '### ', B, flags=re.M)
E1 = E1.replace(' (`FLAIX_CONTRACT.md`)', '')
E1 = E1.replace('(même clé que D)', '(avec une clé d’API fournie par Flaix)')
E1 = E1.replace('(même clé\nque D)', '(avec une clé\nd’API fournie par Flaix)')
E1 = E1.replace("C'est le point le plus important de tout ce document.", "C'est la partie la plus importante.")
for reste in ('que D', 'section D', ' E2', ' E3'):
    assert reste not in E1, reste


md = f"""# Flaix ↔ BreakEat — les matchs, les commandes et la Live Activity

<p class="meta">À l'attention du développeur Flaix · BreakEat · 11 novembre 2026 · version 1</p>

**Le but.** Flaix devient **la seule saisie**. Les matchs créés dans Flaix
apparaissent tout seuls dans l'app BreakEat, et les commandes passées dans
Flaix y remontent avec tout ce que l'app sait déjà faire : « Mes commandes »,
la Live Activity sur l'écran verrouillé, la notification « ta commande est
prête », le reçu avec la TVA, la note et la fidélité.

| | Ce qu'on te demande | Pourquoi | Priorité |
|---|---|---|---|
| **1** | **Le lien calendrier** de chaque lieu | Le client ouvre ta page depuis l'app | Tout de suite |
| **2** | **Le flux des matchs** (JSON) | Plus de double saisie : les matchs arrivent tout seuls | Haute |
| **3** | **Les événements de commande** (webhook signé) | « Mes commandes », Live Activity, « prête », reçu, note, fidélité, campagnes | **La plus haute** |
| — | Le fichier iCal | Les supporters ajoutent les matchs à leur agenda | Facultatif |

Rien n'est encore développé, ni chez toi ni chez nous. Ce dossier fixe le
format pour que chacun avance de son côté. **BreakEat reçoit déjà des
événements signés de Flaix pour la Live Activity** : la partie 3 prolonge ce
qui existe au lieu de le remplacer.

## 1. Le lien calendrier de chaque lieu

{A}

**En plus :** le lien doit accepter nos **étiquettes d'identité**, que
BreakEat remplace par les coordonnées du client connecté avant d'ouvrir ta
page — `[#firstname]`, `[#lastname]`, `[#mail]`, `[#Votre portable]` — et une
**nouvelle** : `[#breakeatId]`, l'identifiant du client chez BreakEat. Garde-la
avec la commande : c'est elle qui permet de la rattacher au bon client
(partie 3).

## 2. Le flux des matchs

{B}

### En option : le fichier iCal

{C}

## 3. Les commandes et la Live Activity

{E1}

## 4. Sécurité

- **Deux secrets, jamais dans une app ni dans un navigateur** : le secret de
  signature des événements (partie 3), et, si tu l'utilises, la clé de l'API
  de relecture. Seuls les deux serveurs les connaissent.
- Ils s'échangent **par un canal sûr** (gestionnaire de mots de passe partagé,
  message chiffré) — **jamais par e-mail en clair**.
- **Révocables et remplaçables sans coupure** : deux secrets valides pendant
  le changement.
- Le flux des matchs (partie 2) est **public et en lecture seule** : il ne
  contient **aucune donnée client**.
- Une panne d'un côté **n'arrête jamais l'autre** : BreakEat garde les
  derniers matchs connus, Flaix réessaie ses envois.

## 5. Ce qu'on attend de toi

1. **Faisable, et pour quand ?** Partie par partie (1, 2, 3).
2. **L'étiquette `[#breakeatId]`** dans le lien de commande : acceptée ?
3. **La TVA par ligne** dans les événements de commande : disponible ? Et
   émets-tu déjà ton propre reçu (`lienRecu`) ?
4. **« Je suis arrivé »** : peux-tu l'afficher au comptoir ?
5. **Un environnement de test** : l'adresse du flux des matchs, l'adresse de
   relecture d'une commande, **un lieu de test** avec un match et des
   produits, et le **secret de signature** (par canal sûr).
6. Le **domaine** de la page de commande et celui du **paiement** (pour
   l'affichage dans l'app).

## 6. Ce que BreakEat fait de son côté

Pour information — rien à faire chez toi.

- **Les matchs** : un import automatique toutes les quelques minutes, qui
  crée ou met à jour les matchs par leur `id` Flaix et retire les matchs
  annulés. **1 à 2 jours** une fois une adresse de test disponible.
- **Les commandes** : la réception de `ORDER_CREATED` et des événements
  suivants, le rattachement au client par `[#breakeatId]`, puis « Mes
  commandes », la Live Activity, la notification « prête », le reçu, les
  bandeaux « produit manquant » et « remboursement », la note et la fidélité
  — **avec le design actuel de l'app**. **1 à 2 jours** une fois des
  événements de test reçus.
- **L'étiquette `[#breakeatId]`** dans les liens de commande, et l'envoi de
  « Je suis arrivé ».

**Plus tard, si besoin** (non demandé aujourd'hui) : ouvrir le tableau de bord
Flaix depuis BreakEat sans se reconnecter (lien d'accès signé), et afficher
dans le tableau de bord Flaix les chiffres de l'app (fréquentation, favoris,
notifications) ou lancer une notification depuis Flaix. Ces sujets ont leur
propre cahier des charges, disponible sur demande.
"""

# Python-Markdown veut 4 espaces pour une sous-liste ; le cahier en met 3.
md = re.sub(r'^   - ', '    - ', md, flags=re.M)
corps = markdown.markdown(md, extensions=['tables', 'fenced_code'])

html = f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Flaix ↔ BreakEat — matchs, commandes, Live Activity</title>
<style>
  @page {{ size: A4; margin: 18mm 16mm 18mm 16mm; }}
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #1c1917; font-size: 10.5pt; line-height: 1.5; }}
  h1 {{ color: #FD4000; font-size: 21pt; line-height: 1.2; margin: 0 0 4px; }}
  .meta {{ color: #78716c; font-size: 9.5pt; margin: 0 0 18px; border-bottom: 2px solid #FD4000; padding-bottom: 10px; }}
  h2 {{ color: #FD4000; font-size: 15pt; margin: 26px 0 8px; page-break-after: avoid; }}
  h3 {{ font-size: 12pt; margin: 18px 0 6px; page-break-after: avoid; }}
  table {{ border-collapse: collapse; width: 100%; margin: 10px 0 14px; font-size: 9.5pt; }}
  tr {{ page-break-inside: avoid; }}
  th, td {{ border: 1px solid #e7e0da; padding: 6px 8px; text-align: left; vertical-align: top; }}
  th {{ background: #FFF1EA; }}
  code {{ font-family: Consolas, monospace; font-size: 9pt; background: #f5f2ef; padding: 1px 4px; border-radius: 3px; }}
  pre {{ background: #1c1917; color: #f5f2ef; padding: 10px 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-word; font-size: 8.6pt; line-height: 1.4; page-break-inside: avoid; }}
  pre code {{ background: none; color: inherit; padding: 0; font-size: inherit; }}
  ul, ol {{ padding-left: 20px; }}
  li {{ margin: 3px 0; }}
  strong {{ color: #111; }}
</style></head><body>
{corps}
</body></html>"""

io.open(RACINE + 'brain/livrables/flaix-dossier-developpeur.html', 'w', encoding='utf-8').write(html)
io.open(RACINE + 'brain/livrables/flaix-dossier-developpeur.md', 'w', encoding='utf-8').write(md)
print('ok', len(html))
