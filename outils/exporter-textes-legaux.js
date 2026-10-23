/**
 * exporter-textes-legaux.js
 *
 * Fabrique les quatre documents légaux en Word (.docx) et en texte (.md)
 * À PARTIR de `apps/mobile/src/lib/textes-legaux.ts`.
 *
 * Pourquoi générer plutôt que de garder des PDF à côté : un document recopié
 * à la main ment dès la correction suivante. Ici la source est le fichier que
 * l'application embarque — celui que le client lit réellement. On relance
 * cette commande et les deux formats sont à jour.
 *
 * Le .docx s'ouvre dans Word ; le .md se colle dans Wix sans traîner de mise
 * en forme parasite.
 *
 *   node outils/exporter-textes-legaux.js
 */

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const SOURCE = path.join(RACINE, 'apps', 'mobile', 'src', 'lib', 'textes-legaux.ts');
const SORTIE = path.join(RACINE, 'GUIDE_DEVELOPPEMENT', 'documents-legaux');

const ts = require(path.join(RACINE, 'node_modules', 'typescript'));
const {
  Document, Packer, Paragraph, TextRun, Header, Footer,
  AlignmentType, HeadingLevel, PageNumber,
} = require(path.join(RACINE, 'phases de DEV', 'node_modules', 'docx'));

const ORANGE = 'FD4000';
const ANTHRACITE = '241F1D';

/**
 * On TRANSPILE le TypeScript au lieu de le lire à la grammaire.
 *
 * Une analyse par expression régulière casserait au premier paragraphe qui
 * contient une apostrophe ou une virgule bien placée — et ces textes en sont
 * pleins. Le compilateur, lui, sait ce qu'est une chaîne.
 *
 * Le fichier source n'importe rien : une fois les types retirés, il s'exécute
 * tel quel.
 */
function chargerDocuments() {
  const brut = fs.readFileSync(SOURCE, 'utf8');
  const js = ts.transpileModule(brut, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;

  const module_ = { exports: {} };
  new Function('module', 'exports', js)(module_, module_.exports);
  const docs = module_.exports.DOCUMENTS_LEGAUX;
  if (!Array.isArray(docs) || docs.length === 0) {
    throw new Error('DOCUMENTS_LEGAUX introuvable ou vide dans ' + SOURCE);
  }
  return docs;
}

// ── Markdown : ce qui se colle dans Wix ──────────────────────────────────────

function enMarkdown(doc) {
  const lignes = [
    `# ${doc.titre}`,
    '',
    `*${doc.version}*`,
    '',
    '---',
    '',
  ];
  for (const section of doc.sections) {
    lignes.push(`## ${section.titre}`, '');
    for (const p of section.paragraphes) lignes.push(p, '');
  }
  return lignes.join('\n');
}

// ── Word : ce qui s'ouvre d'un double-clic ───────────────────────────────────

function enDocx(doc) {
  const enfants = [
    new Paragraph({
      children: [new TextRun({ text: doc.titre, bold: true, size: 36, color: ORANGE })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [new TextRun({ text: doc.version, size: 20, color: '777777' })],
      spacing: { after: 360 },
    }),
  ];

  for (const section of doc.sections) {
    enfants.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: section.titre, bold: true, size: 26, color: ORANGE })],
        spacing: { before: 320, after: 140 },
      }),
    );
    for (const p of section.paragraphes) {
      enfants.push(
        new Paragraph({
          children: [new TextRun({ text: p, size: 22, color: ANTHRACITE })],
          spacing: { after: 160, line: 300 },
          alignment: AlignmentType.JUSTIFIED,
        }),
      );
    }
  }

  return new Document({
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `BREAK EAT APP — ${doc.titre}`, size: 16, color: '999999' }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Page ', size: 16, color: '999999' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999' }),
                ],
              }),
            ],
          }),
        },
        children: enfants,
      },
    ],
  });
}

// ── Écriture ─────────────────────────────────────────────────────────────────

/** Un nom de fichier qu'un double-clic ouvre, sans accent ni espace. */
const nomDe = (doc) =>
  doc.titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '_')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase();

async function main() {
  const docs = chargerDocuments();
  fs.mkdirSync(SORTIE, { recursive: true });

  for (const doc of docs) {
    const base = nomDe(doc);
    fs.writeFileSync(path.join(SORTIE, `${base}.md`), enMarkdown(doc), 'utf8');
    const buffer = await Packer.toBuffer(enDocx(doc));
    fs.writeFileSync(path.join(SORTIE, `${base}.docx`), buffer);
    const mots = doc.sections.reduce(
      (t, s) => t + s.paragraphes.join(' ').split(/\s+/).length,
      0,
    );
    console.log(`   ${base}  (${doc.sections.length} articles, ~${mots} mots)`);
  }

  console.log(
    `\n${docs.length} documents ecrits en .docx et .md dans ` +
      `« ${path.relative(RACINE, SORTIE)} ».`,
  );
}

main().catch((e) => {
  console.error('Echec :', e.message);
  process.exit(1);
});
