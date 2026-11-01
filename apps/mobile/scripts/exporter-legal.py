# -*- coding: utf-8 -*-
"""
Sort un document legal de `textes-legaux.ts` en texte brut, pret a coller.

Le fichier TypeScript EST la version publiee : on lit la source plutot que
de retaper le texte a cote, sinon la page web et l'application divergeraient
au premier changement — et c'est exactement ce qu'on reproche a la fiche
App Store aujourd'hui.

Usage : exporter-legal.py <cle> <sortie.txt>
        cle = mentions | confidentialite | cgu | cgv
"""
import io
import re
import sys

SOURCE = 'apps/mobile/src/lib/textes-legaux.ts'

CONSTANTE = {
    'mentions': 'MENTIONS',
    'confidentialite': 'CONFIDENTIALITE',
    'cgu': 'CGU',
    'cgv': 'CGV',
}


def litteral(source, nom):
    """Le bloc `const <NOM>: DocumentLegal = { … };`, bornes comprises."""
    debut = source.index('const %s: DocumentLegal = {' % nom)
    # On s'arrete au `};` de premiere colonne qui suit : les accolades
    # internes sont toutes indentees.
    fin = source.index('\n};', debut)
    return source[debut:fin]


def chaines(fragment):
    """Les chaines simples quotees, `\\'` rendu a sa valeur."""
    return [m.group(1).replace("\\'", "'") for m in re.finditer(r"'((?:[^'\\]|\\.)*)'", fragment)]


def main():
    cle, sortie = sys.argv[1], sys.argv[2]
    source = io.open(SOURCE, encoding='utf-8').read()

    editeur = chaines(source[source.index('const EDITEUR = ['): source.index('];', source.index('const EDITEUR = ['))])
    version = chaines(source[source.index('VERSION_DOCUMENTS ='): source.index('\n', source.index('VERSION_DOCUMENTS ='))])[0]

    bloc = litteral(source, CONSTANTE[cle])

    titre = re.search(r"titre: '((?:[^'\\]|\\.)*)'", bloc).group(1).replace("\\'", "'")
    resume = re.search(r"resume: '((?:[^'\\]|\\.)*)'", bloc).group(1).replace("\\'", "'")

    lignes = [titre.upper(), '', version, '', resume, '']

    # Chaque section : un titre, puis ses paragraphes.
    for section in re.finditer(
        r"\{\s*titre: '((?:[^'\\]|\\.)*)',\s*paragraphes: \[(.*?)\],\s*\}", bloc, re.S
    ):
        lignes.append('')
        lignes.append(section.group(1).replace("\\'", "'"))
        lignes.append('')
        for p in chaines(section.group(2)):
            # Le fichier reference EDITEUR par etalement : on le deplie.
            lignes.append(p)
            lignes.append('')
        if '...EDITEUR' in section.group(2):
            for e in editeur:
                lignes.append(e)
                lignes.append('')

    texte = '\n'.join(lignes).replace('\n\n\n', '\n\n').strip() + '\n'
    io.open(sortie, 'w', encoding='utf-8', newline='\n').write(texte)
    print('%s  —  %d caracteres, %d lignes' % (sortie, len(texte), texte.count('\n')))


main()
