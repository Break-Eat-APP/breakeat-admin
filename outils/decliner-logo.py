# -*- coding: utf-8 -*-
"""
LE LOGO OFFICIEL v2 — décliné pour toutes les surfaces.

La source est un PNG blanc opaque (export Canva). Les interfaces, elles, ont
besoin de l'inverse : un logo DÉTOURÉ, parce qu'il se pose tantôt sur du blanc
(les consoles), tantôt sur l'orange de la marque (le bandeau de l'app).

Quatre déclinaisons, et une seule source :

  · `logo-full`        — l'ensemble, orange sur fond transparent ;
  · `logo-mark`        — le B seul, pour les petites tailles ;
  · `logo-full-white`  — l'ensemble en BLANC, pour le bandeau orange ;
  · les marques MOBILES — le B seul, posé sur un CARRÉ (voir plus bas).

Pourquoi le blanc se fabrique ici plutôt que de se demander au graphiste : il
se déduit exactement du détourage (on garde la silhouette, on remplace la
couleur). Une version blanche dessinée à part finirait par diverger de l'autre
au premier ajustement.
"""
import pathlib
from collections import deque
from PIL import Image

RACINE = pathlib.Path("C:/Users/notta/OneDrive/Bureau/Break Eat APP")
SOURCE = RACINE / "logo" / "logo officiel break eat v2.pdf (31).png"

# Largeur de la bande, près du blanc, où l'opacité monte de 0 à 255. Étroite
# à dessein : au-delà, on commence à ronger la couleur de la marque.
BANDE_BORD = 40

# Le côté des marques mobiles, et la part du carré que le B occupe.
#
# CARRÉ OBLIGATOIRE : ces fichiers ne servent pas qu'à l'écran. `app.config.js`
# les donne comme icône iOS, comme `adaptiveIcon` Android et comme image de
# démarrage — trois endroits qui exigent une image carrée. Un fichier détouré
# au plus juste y serait déformé ou recadré.
#
# 0.72 reprend le poids visuel de la v1 (le B y remplissait ~70 % du carré) et
# laisse la marge dont iOS a besoin pour ses coins arrondis.
COTE_MOBILE = 480
REMPLISSAGE = 0.72


def detoure(im: Image.Image) -> Image.Image:
    """
    Blanc → transparent, SANS délaver la couleur.

    Première version : l'opacité se déduisait de la CLARTÉ moyenne du pixel.
    Erreur — l'orange de la marque est clair (253, 64, 0 : moyenne 105), et se
    retrouvait à moitié transparent. Le logo sortait saumon.

    On regarde donc le canal le PLUS SOMBRE : il vaut 255 sur du blanc pur et
    s'effondre dès qu'il y a de la couleur. Un pixel coloré est alors
    pleinement opaque, quelle que soit sa clarté, et seule une bande étroite
    près du blanc reçoit une transparence partielle — juste ce qu'il faut pour
    garder des bords doux.
    """
    im = im.convert("RGBA")
    px = im.load()
    largeur, hauteur = im.size
    for y in range(hauteur):
        for x in range(largeur):
            r, v, b, _ = px[x, y]
            minc = min(r, v, b)
            opacite = max(0, min(255, round(255 * (255 - minc) / BANDE_BORD)))
            px[x, y] = (r, v, b, opacite)
    return im


def en_blanc(im: Image.Image) -> Image.Image:
    """Même silhouette, peinte en blanc — pour le bandeau orange."""
    im = im.convert("RGBA")
    px = im.load()
    largeur, hauteur = im.size
    for y in range(hauteur):
        for x in range(largeur):
            _, _, _, a = px[x, y]
            px[x, y] = (255, 255, 255, a)
    return im


def sur_carre(im: Image.Image, cote: int = COTE_MOBILE) -> Image.Image:
    """Le B centré sur un carré transparent — le format qu'exige une icône."""
    im = im.crop(im.getbbox())
    cible = round(cote * REMPLISSAGE)
    ratio = cible / max(im.width, im.height)
    im = im.resize((max(1, round(im.width * ratio)), max(1, round(im.height * ratio))), Image.LANCZOS)
    fond = Image.new("RGBA", (cote, cote), (0, 0, 0, 0))
    fond.paste(im, ((cote - im.width) // 2, (cote - im.height) // 2), im)
    return fond


def ecrire(im: Image.Image, chemins, hauteur_max=None):
    if hauteur_max and im.height > hauteur_max:
        ratio = hauteur_max / im.height
        im = im.resize((max(1, round(im.width * ratio)), hauteur_max), Image.LANCZOS)
    for c in chemins:
        p = RACINE / c
        p.parent.mkdir(parents=True, exist_ok=True)
        im.save(p, "PNG", optimize=True)
        print(f"   {c}  ({im.width}x{im.height})")


print("-- Detourage de la source --")
source = Image.open(SOURCE)
complet = detoure(source)
complet = complet.crop(complet.getbbox())
print(f"   lockup detoure : {complet.width}x{complet.height}")

# Le B seul : les FORMES QUI MONTENT SUR TOUTE LA HAUTEUR.
#
# Deux approches ont echoue avant celle-ci, et pour la meme raison :
#
#  . couper a la colonne la PLUS VIDE entre 35 % et 65 % : elle tombait au
#    milieu du mot ;
#  . couper a la PREMIERE colonne entierement vide : il n'y en a pas entre la
#    marque et le mot. Le lobe inferieur du B deborde SOUS le << B >> de
#    BREAKEAT, les deux se chevauchent horizontalement, et la premiere vraie
#    colonne vide arrive donc apres la premiere lettre. C'est ainsi qu'elle
#    s'est retrouvee collee a la marque.
#
# Ce qui les separe n'est pas leur position, c'est leur TAILLE. La marque
# occupe toute la hauteur ; les lettres tiennent dans une bande etroite,
# centree (61 px sur 600). On isole donc les composantes connexes et on ne
# garde que les HAUTES.
#
# La marque en compte TROIS, pas une : l'eclair evide la traverse de part en
# part et la coupe en trois morceaux. Prendre << la plus grande composante >>
# n'en ramenerait qu'un tiers.
#
# Le seuil se lit dans les mesures, il n'est pas choisi au jugé. Sur cet
# export : les huit lettres font 10 % de la hauteur, les trois morceaux du B
# font 48 %, 51 % et 74 %. Un quart tombe franchement entre les deux familles.
#
# Pourquoi pas la moitie, qui parait plus naturelle : le morceau du HAUT du B
# ne mesure que 48,5 % -- il passait juste en dessous, et la marque sortait
# decapitee. L'ecart a trouver est celui qui separe les deux groupes, pas une
# fraction ronde.
HAUTES = 0.25


def marque_seule(im: Image.Image) -> Image.Image:
    """
    Le B, isole du mot par la hauteur de ses formes.

    On ne recadre PAS un rectangle : on efface les pixels des formes ecartees,
    puis on recadre ce qu'il reste. Un simple rectangle laissait une echarde
    orange sur le bord droit -- le flanc gauche du << B >> de BREAKEAT, qui
    tombe a l'interieur du cadre de la marque puisque les deux se chevauchent.
    """
    largeur, hauteur = im.size
    alpha = im.split()[3].load()
    vus = bytearray(largeur * hauteur)
    garde = bytearray(largeur * hauteur)
    for y0 in range(hauteur):
        for x0 in range(largeur):
            if alpha[x0, y0] < 60 or vus[y0 * largeur + x0]:
                continue
            file = deque([(x0, y0)])
            vus[y0 * largeur + x0] = 1
            forme = [(x0, y0)]
            y1 = y2 = y0
            while file:
                x, y = file.popleft()
                if y < y1: y1 = y
                if y > y2: y2 = y
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if (0 <= nx < largeur and 0 <= ny < hauteur
                            and not vus[ny * largeur + nx] and alpha[nx, ny] >= 60):
                        vus[ny * largeur + nx] = 1
                        file.append((nx, ny))
                        forme.append((nx, ny))
            if (y2 - y1 + 1) < hauteur * HAUTES:
                continue  # une lettre du mot
            for x, y in forme:
                garde[y * largeur + x] = 1

    assert any(garde), "aucune forme pleine hauteur : la marque est introuvable"

    # AUCUNE dilatation ici, et c'est deliberé : le flanc gauche du << B >>
    # de BREAKEAT passe a DEUX pixels du lobe de la marque. Rattraper les
    # bords adoucis en gardant le voisinage ramenait l'echarde qu'on venait
    # d'effacer. Le seuil du remplissage (alpha 60) ne coupe qu'un lisere
    # sous-pixel, invisible aux tailles d'affichage.
    sortie = im.copy()
    px = sortie.load()
    for y in range(hauteur):
        for x in range(largeur):
            if not garde[y * largeur + x]:
                r, v, b, _ = px[x, y]
                px[x, y] = (r, v, b, 0)
    return sortie.crop(sortie.getbbox())


marque = marque_seule(complet)
print(f"   marque isolee : {marque.width}x{marque.height}")

print("\n-- Consoles (orange sur transparent) --")
ecrire(complet, [
    "apps/admin/public/logo-full.png",
    "apps/backoffice/public/logo-full.png",
    "apps/operator/public/logo-full.png",
], hauteur_max=600)
ecrire(marque, [
    "apps/admin/public/logo-mark.png",
    "apps/backoffice/public/logo-mark.png",
    "apps/operator/public/logo-mark.png",
], hauteur_max=1202)

print("\n-- Onglet du navigateur (Next sert src/app/icon.png tout seul) --")
ecrire(sur_carre(marque.copy(), 256), [
    "apps/admin/src/app/icon.png",
    "apps/backoffice/src/app/icon.png",
    "apps/operator/src/app/icon.png",
])

print("\n-- Application mobile --")
ecrire(en_blanc(complet.copy()), ["apps/mobile/assets/logo-full-white.png"], hauteur_max=212)
ecrire(sur_carre(en_blanc(marque.copy())), ["apps/mobile/assets/logo-mark.png"])
ecrire(sur_carre(marque.copy()), ["apps/mobile/assets/logo-mark-orange.png"])

print("\nTermine.")
