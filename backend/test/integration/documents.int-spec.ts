/**
 * Les documents d'un club — contrat signé et pièces associées.
 *
 * Deux propriétés décident si cette fonctionnalité est acceptable : le contenu
 * doit revenir EXACTEMENT tel qu'il est entré (un contrat abîmé ne vaut rien),
 * et un club ne doit jamais atteindre le document d'un autre. Ni l'une ni
 * l'autre ne se vérifie avec une doublure — l'une tient au stockage binaire
 * de PostgreSQL, l'autre au filtre réellement appliqué.
 */
import { DocumentsService } from '../../src/modules/documents/documents.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

/** Un PDF minimal mais VALIDE : il commence par la signature attendue. */
function pdf(texte = 'contrat'): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${texte}\n%%EOF\n`, 'latin1');
}

function fichier(nom: string, contenu: Buffer) {
  return { originalname: nom, mimetype: 'application/pdf', size: contenu.length, buffer: contenu };
}

decrire('documents d’un club (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  const documents = url ? new DocumentsService(s.prisma) : (null as never);

  let sa: string;
  beforeAll(async () => {
    sa = (
      await s.prisma.user.create({
        data: {
          email: `${unique('sa')}@test.fr`,
          passwordHash: 'x',
          displayName: 'SA',
          globalRole: 'SUPER_ADMIN',
        },
      })
    ).id;
  });
  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  it('rend le contenu OCTET POUR OCTET', async () => {
    // Un contrat qui revient abîmé ne vaut rien. Le contenu traverse Prisma et
    // le type `bytea` de PostgreSQL : c'est là que ça se vérifie.
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    const original = pdf('clauses et signatures');

    const depose = await documents.deposer(o.org.id, sa, fichier('Contrat.pdf', original));
    const relu = await documents.contenu(o.org.id, sa, depose.id);

    expect(Buffer.from(relu.content).equals(original)).toBe(true);
    expect(relu.mimeType).toBe('application/pdf');
  });

  it('refuse un fichier qui n’est PAS un PDF, même bien déguisé', async () => {
    // Le type annoncé par le navigateur se change en une ligne. Un vrai PDF,
    // lui, commence toujours par `%PDF-`.
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    const deguise = Buffer.from('<?php system($_GET["c"]); ?>', 'latin1');

    await expect(
      documents.deposer(o.org.id, sa, fichier('contrat.pdf', deguise)),
    ).rejects.toThrow(/PDF/i);

    expect(await s.prisma.document.count({ where: { organizationId: o.org.id } })).toBe(0);
  });

  it('refuse un fichier vide', async () => {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    await expect(
      documents.deposer(o.org.id, sa, fichier('vide.pdf', Buffer.alloc(0))),
    ).rejects.toThrow(/vide/i);
  });

  it('nettoie le nom sans le rendre méconnaissable', async () => {
    // Le nom vient de l'utilisateur et sera réaffiché : on retire les chemins,
    // on garde ce qui se lit.
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    const depose = await documents.deposer(
      o.org.id,
      sa,
      fichier('../../Contrat signé 2026.pdf', pdf()),
    );
    expect(depose.name).not.toContain('/');
    expect(depose.name).toContain('Contrat signé 2026.pdf');
  });

  it('un club n’atteint JAMAIS le document d’un autre', async () => {
    // Le filtre porte sur le document ET sur le club : connaître un identifiant
    // ne suffit pas.
    const mien = await creerOrganisationComplete(s.prisma, unique('mien'), sa);
    const autre = await creerOrganisationComplete(s.prisma, unique('autre'), sa);
    const chezAutre = await documents.deposer(autre.org.id, sa, fichier('Secret.pdf', pdf()));

    await expect(documents.contenu(mien.org.id, sa, chezAutre.id)).rejects.toThrow(/introuvable/i);
    await expect(documents.supprimer(mien.org.id, sa, chezAutre.id)).rejects.toThrow(/introuvable/i);

    // Et il est toujours là : la tentative n'a rien cassé.
    expect(await s.prisma.document.count({ where: { id: chezAutre.id } })).toBe(1);
  });

  it('liste sans le contenu, du plus récent au plus ancien', async () => {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    await documents.deposer(o.org.id, sa, fichier('Ancien.pdf', pdf('a')));
    await documents.deposer(o.org.id, sa, fichier('Récent.pdf', pdf('b')));

    const liste = await documents.lister(o.org.id, sa);

    expect(liste.map((d) => d.name)).toEqual(['Récent.pdf', 'Ancien.pdf']);
    // Les octets ne doivent pas voyager pour afficher deux lignes.
    expect(Object.keys(liste[0])).not.toContain('content');
    expect(liste[0].deposePar).toBe('SA');
  });

  it('supprime, et une seconde fois refuse', async () => {
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    const depose = await documents.deposer(o.org.id, sa, fichier('Contrat.pdf', pdf()));

    await expect(documents.supprimer(o.org.id, sa, depose.id)).resolves.toEqual({ supprime: true });
    await expect(documents.supprimer(o.org.id, sa, depose.id)).rejects.toThrow(/introuvable/i);
  });

  it('la base elle-même refuse un document trop lourd', async () => {
    // La contrainte existe EN BASE, pas seulement dans le service : le jour où
    // une route oublierait de vérifier, elle refuserait quand même.
    const o = await creerOrganisationComplete(s.prisma, unique('club'), sa);
    await expect(
      s.prisma.document.create({
        data: {
          organizationId: o.org.id,
          name: 'Trop gros.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 11 * 1024 * 1024,
          content: new Uint8Array(pdf()),
        },
      }),
    ).rejects.toThrow();
  });
});
