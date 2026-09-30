/**
 * generer-phases-depuis-manuel.js
 *
 * Fabrique un document Word par phase (15 et au-delà) À PARTIR du manuel
 * d'ingénierie. Les quatorze premiers `.docx` de ce dossier, eux, ont été
 * écrits À LA MAIN avant construction : ils ne sont pas régénérés.
 *
 * Pourquoi générer plutôt qu'écrire : un Word recopié à la main ment dès le
 * commit suivant. Ici, la source reste `brain/ENGINEERING_MANUAL.md` — on
 * relance cette commande et tout est à jour.
 *
 *   node "phases de DEV/generer-phases-depuis-manuel.js"
 */

const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, WidthType, PageNumber, BorderStyle,
} = require(path.join(__dirname, 'node_modules', 'docx'));

const RACINE = path.join(__dirname, '..');
const MANUEL = path.join(RACINE, 'brain', 'ENGINEERING_MANUAL.md');
const SORTIE = path.join(__dirname, 'phases generees');
/** En deçà, les cahiers des charges d'origine font foi. */
const PREMIERE_PHASE = 15;

const ORANGE = 'FD4000';
const ANTHRACITE = '241F1D';

// ── Découpage du manuel ───────────────────────────────────────────────────────

/** « Phase 5 », « Phases 24-25 », « Phase mobile 16→18 », « Phase 11.4c ». */
const MOTIF_PHASE = /Phases?\s+(?:mobile\s+)?(\d+(?:\.\d+[a-z]?)?)\s*(?:[-–—→]\s*(\d+))?/;

function decouperEnSections(markdown) {
  const lignes = markdown.split('\n');
  const sections = [];
  let courante = null;
  for (const ligne of lignes) {
    if (ligne.startsWith('## ')) {
      if (courante) sections.push(courante);
      courante = { titre: ligne.slice(3).trim(), lignes: [] };
    } else if (courante) {
      courante.lignes.push(ligne);
    }
  }
  if (courante) sections.push(courante);
  return sections;
}

/** Les numéros de phase qu'un titre déclare, ou `null` si ce n'en est pas une. */
function numerosDe(titre) {
  const m = MOTIF_PHASE.exec(titre);
  if (!m) return null;
  const debut = m[1];
  if (m[2] && !debut.includes('.')) {
    const n = [];
    for (let i = Number(debut); i <= Number(m[2]); i++) n.push(String(i));
    return n;
  }
  return [debut];
}

const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function nomFichier(numeros, titre) {
  // Le titre sans sa date ni ses numéros : « Phase 26 — La TVA par produit ».
  const sujet = titre
    .replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, '')
    .replace(/^Phases?\s+(?:mobile\s+)?[\d.a-z]+(\s*[-–—→]\s*\d+)?\s*[—–-]?\s*/i, '')
    .replace(/\s*\((?:\d{4}-\d{2}-\d{2}|[\d/.\s–—-]{6,25})\)\s*$/, '')
    // « Fondation push Expo (Phase 18) » : le numéro est déjà dans le nom.
    .replace(/\s*\(Phases?\s+[\d.a-z-]+\)\s*$/i, '');
  const slug = sansAccent(sujet)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'PHASE';
  return `PHASE_${numeros.join('-')}_${slug}.docx`;
}

// ── Markdown → Word ───────────────────────────────────────────────────────────

/** `**gras**`, `` `code` ``, `_italique_` — le reste passe tel quel. */
function morceaux(texte) {
  const sortie = [];
  const motif = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let position = 0;
  let m;
  while ((m = motif.exec(texte)) !== null) {
    if (m.index > position) sortie.push(new TextRun(texte.slice(position, m.index)));
    const jeton = m[0];
    if (jeton.startsWith('**')) {
      sortie.push(new TextRun({ text: jeton.slice(2, -2), bold: true }));
    } else if (jeton.startsWith('`')) {
      sortie.push(new TextRun({ text: jeton.slice(1, -1), font: 'Consolas', color: '8A3B12' }));
    } else {
      sortie.push(new TextRun({ text: jeton.slice(1, -1), italics: true }));
    }
    position = m.index + jeton.length;
  }
  if (position < texte.length) sortie.push(new TextRun(texte.slice(position)));
  return sortie.length ? sortie : [new TextRun('')];
}

const estSeparateurTableau = (l) => /^\|[\s:|-]+\|$/.test(l.trim());
const cellules = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function tableau(lignes) {
  const entetes = cellules(lignes[0]);
  const corps = lignes.slice(2).map(cellules);
  const ligne = (valeurs, gras) =>
    new TableRow({
      children: valeurs.map(
        (v) =>
          new TableCell({
            width: { size: Math.floor(100 / valeurs.length), type: WidthType.PERCENTAGE },
            shading: gras ? { fill: 'F5EFEA' } : undefined,
            children: [
              new Paragraph({
                spacing: { before: 60, after: 60 },
                children: gras ? [new TextRun({ text: v, bold: true })] : morceaux(v),
              }),
            ],
          }),
      ),
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [ligne(entetes, true), ...corps.map((c) => ligne(c, false))],
  });
}

function convertir(lignes) {
  const elements = [];
  let i = 0;
  while (i < lignes.length) {
    const ligne = lignes[i];

    if (!ligne.trim()) { i++; continue; }

    if (ligne.startsWith('### ')) {
      elements.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 120 },
        children: [new TextRun({ text: ligne.slice(4).trim(), bold: true, color: ANTHRACITE })],
      }));
      i++; continue;
    }
    if (ligne.startsWith('#### ')) {
      elements.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200, after: 100 },
        children: [new TextRun({ text: ligne.slice(5).trim(), bold: true })],
      }));
      i++; continue;
    }

    // Bloc de code : rendu en chasse fixe, tel quel.
    if (ligne.trim().startsWith('```')) {
      i++;
      const code = [];
      while (i < lignes.length && !lignes[i].trim().startsWith('```')) code.push(lignes[i++]);
      i++;
      for (const l of code) {
        elements.push(new Paragraph({
          spacing: { before: 0, after: 0 },
          shading: { fill: 'F7F4F1' },
          children: [new TextRun({ text: l || ' ', font: 'Consolas', size: 18 })],
        }));
      }
      elements.push(new Paragraph({ text: '', spacing: { after: 120 } }));
      continue;
    }

    // Tableau : au moins un en-tête et sa ligne de séparation.
    if (ligne.trim().startsWith('|') && i + 1 < lignes.length && estSeparateurTableau(lignes[i + 1])) {
      const bloc = [];
      while (i < lignes.length && lignes[i].trim().startsWith('|')) bloc.push(lignes[i++]);
      elements.push(tableau(bloc));
      elements.push(new Paragraph({ text: '', spacing: { after: 120 } }));
      continue;
    }

    if (/^\s*[-*]\s+/.test(ligne)) {
      elements.push(new Paragraph({
        bullet: { level: Math.min(2, Math.floor((ligne.match(/^\s*/)[0].length) / 2)) },
        spacing: { before: 40, after: 40 },
        children: morceaux(ligne.replace(/^\s*[-*]\s+/, '')),
      }));
      i++; continue;
    }
    if (/^\s*\d+\.\s+/.test(ligne)) {
      elements.push(new Paragraph({
        numbering: { reference: 'liste-numerotee', level: 0 },
        spacing: { before: 40, after: 40 },
        children: morceaux(ligne.replace(/^\s*\d+\.\s+/, '')),
      }));
      i++; continue;
    }

    if (ligne.trim() === '---') { i++; continue; }

    elements.push(new Paragraph({
      spacing: { before: 60, after: 60 },
      children: morceaux(ligne.trim()),
    }));
    i++;
  }
  return elements;
}

// ── Le document ───────────────────────────────────────────────────────────────

function document(section, numeros, quand) {
  const titre = section.titre
    .replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, '')
    .replace(/\s*\((?:\d{4}-\d{2}-\d{2}|[\d/.\s–—-]{6,25})\)\s*$/, '');
  // La date vit devant le titre dans les anciennes entrées, entre parenthèses
  // dans les récentes — et parfois à la française.
  const date = (section.titre.match(/^\[(\d{4}-\d{2}-\d{2})\]/) || [])[1]
    || (section.titre.match(/\(([\d/.\s–—-]{6,25})\)\s*$/) || [])[1]
    || (section.titre.match(/\((\d{4}-\d{2}-\d{2})\)/) || [])[1]
    || '';

  return new Document({
    creator: 'Break Eat',
    title: titre,
    description: `Généré depuis brain/ENGINEERING_MANUAL.md le ${quand}`,
    numbering: {
      config: [{
        reference: 'liste-numerotee',
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
      }],
    },
    sections: [{
      properties: {},
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: 'BREAK EAT — manuel d’ingénierie', color: '8A8580', size: 18 })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Document GÉNÉRÉ le ', color: '8A8580', size: 16 }),
              new TextRun({ text: quand, color: '8A8580', size: 16 }),
              new TextRun({ text: '  —  page ', color: '8A8580', size: 16 }),
              new TextRun({ children: [PageNumber.CURRENT], color: '8A8580', size: 16 }),
            ],
          })],
        }),
      },
      children: [
        new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: `PHASE ${numeros.join(' → ')}`, bold: true, color: ORANGE, size: 22 })],
        }),
        new Paragraph({
          heading: HeadingLevel.TITLE,
          spacing: { after: 120 },
          children: [new TextRun({ text: titre, bold: true, color: ANTHRACITE })],
        }),
        date
          ? new Paragraph({
              spacing: { after: 200 },
              children: [new TextRun({ text: `Construite le ${date}`, color: '6B6460', size: 20 })],
            })
          : new Paragraph({ text: '' }),
        new Paragraph({
          spacing: { before: 100, after: 240 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: ORANGE, space: 12 } },
          children: [
            new TextRun({ text: 'Ce document est généré. ', bold: true }),
            new TextRun({
              text: 'Ne le modifiez pas : toute correction se fait dans '
                + 'brain/ENGINEERING_MANUAL.md, puis on relance la génération. '
                + 'Modifié ici, il se perdrait à la prochaine régénération — et il '
                + 'dirait autre chose que le code.',
            }),
          ],
        }),
        ...convertir(section.lignes),
      ],
    }],
  });
}

// ── Exécution ─────────────────────────────────────────────────────────────────

async function principal() {
  const markdown = fs.readFileSync(MANUEL, 'utf8');
  const quand = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  fs.mkdirSync(SORTIE, { recursive: true });
  for (const fichier of fs.readdirSync(SORTIE)) {
    if (fichier.endsWith('.docx')) fs.unlinkSync(path.join(SORTIE, fichier));
  }

  let ecrits = 0;
  for (const section of decouperEnSections(markdown)) {
    const numeros = numerosDe(section.titre);
    if (!numeros) continue;
    // Les cahiers des charges d'origine couvrent les phases 1 à 14. Le premier
    // nombre du numéro suffit : « 11.4c » est une sous-phase de la 11.
    const principal = parseInt(numeros[0], 10);
    if (!Number.isFinite(principal) || principal < PREMIERE_PHASE) continue;

    const nom = nomFichier(numeros, section.titre);
    const buffer = await Packer.toBuffer(document(section, numeros, quand));
    fs.writeFileSync(path.join(SORTIE, nom), buffer);
    ecrits++;
  }

  console.log(`${ecrits} documents ecrits dans « ${path.relative(RACINE, SORTIE)} » (${quand}).`);
}

principal().catch((e) => {
  console.error('Generation impossible :', e);
  process.exitCode = 1;
});
