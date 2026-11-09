/**
 * GÉNÈRE `PHASES_DE_DEVELOPPEMENT.docx` À PARTIR DES DOCUMENTS DU DÉPÔT.
 *
 * Pourquoi un générateur plutôt qu'un fichier Word écrit à la main : un
 * document recopié diverge au premier correctif, et c'est toujours celui
 * qu'on relit le moins qui ment. Celui-ci reprend, sans les réécrire :
 *
 *   · `brain/ROADMAP.md`              — les phases 0 → 22, l'index 24 → 73 ;
 *   · `CHANGELOG.md`                  — toutes les versions, le détail des récentes ;
 *   · `REPRISE.md`                    — l'état courant et ce qui reste ;
 *   · `brain/audits/AUDIT_*.md`       — le dernier audit ;
 *   · le guide « Remonter à la cause d'un bug », écrit ICI (il n'existe pas ailleurs).
 *
 * UTILISATION (depuis la racine du dépôt) :
 *
 *   npm install -g docx              # une seule fois ; `docx` n'est PAS une
 *                                    # dépendance du projet, exprès
 *   NODE_PATH="$(npm root -g)" node GUIDE_DEVELOPPEMENT/generer-phases-docx.js
 *
 * Puis, pour que la table des matières soit remplie : ouvrir le fichier dans
 * Word et accepter « mettre à jour les champs » (ou F9 dessus).
 *
 * À relancer après chaque mise à jour des documents vivants.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let docx;
try {
  docx = require('docx');
} catch {
  console.error(
    "La bibliothèque « docx » est introuvable. Installe-la (npm install -g docx) puis relance avec\n" +
      '  NODE_PATH="$(npm root -g)" node GUIDE_DEVELOPPEMENT/generer-phases-docx.js',
  );
  process.exit(1);
}

const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} = docx;

const RACINE = path.resolve(__dirname, '..');
// Un chemin de sortie peut être passé en argument (pour un essai hors du dépôt).
const SORTIE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'PHASES_DE_DEVELOPPEMENT.docx');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8').replace(/\r\n/g, '\n');

// ─── Mise en page ────────────────────────────────────────────────────────
// A4, marges de 2 cm : 11906 − 2 × 1134 = 9638 DXA de largeur utile.
const LARGEUR = 9638;
const POLICE = 'Arial';
const MONO = 'Consolas';
const ORANGE = 'FD4000';
const GRIS = '6B6460';
const FOND_TETE = 'FBE3D8';

// ─── Texte en ligne : **gras**, `code`, [lien](url) ──────────────────────
function sansEmoji(t) {
  // Les emoji des titres de REPRISE (🟢, 🗄️…) ne s'affichent pas partout dans
  // Word : on les retire plutôt que de laisser des carrés vides.
  return t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, '').replace(/^\s+/, '');
}

function runs(texte, base = {}) {
  const propre = sansEmoji(texte).replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const morceaux = propre.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((m) => m !== '');
  return morceaux.flatMap((m) => {
    if (m.startsWith('**') && m.endsWith('**')) {
      // Le gras peut contenir du `code` : on le redécoupe, en gardant le gras.
      return runs(m.slice(2, -2), { ...base, bold: true });
    }
    if (m.startsWith('`') && m.endsWith('`')) {
      return new TextRun({ text: m.slice(1, -1), font: MONO, size: 18, color: '7A2E00', ...base });
    }
    return new TextRun({ text: m, font: POLICE, ...base });
  });
}

// ─── Tableaux ───────────────────────────────────────────────────────────
function cellule(texte, largeur, entete) {
  return new TableCell({
    width: { size: largeur, type: WidthType.DXA },
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    shading: entete ? { type: ShadingType.CLEAR, fill: FOND_TETE, color: 'auto' } : undefined,
    children: [new Paragraph({ children: runs(texte, entete ? { bold: true, size: 18 } : { size: 18 }) })],
  });
}

function tableau(lignes) {
  const nb = Math.max(...lignes.map((l) => l.length));
  const rangees = lignes.map((l) => [...l, ...Array(nb - l.length).fill('')]);
  // Largeurs proportionnelles au texte le plus long de chaque colonne, bornées :
  // une colonne « Date » n'a pas besoin du tiers de la page.
  const poids = Array.from({ length: nb }, (_, c) =>
    Math.min(60, Math.max(8, ...rangees.map((r) => r[c].length))),
  );
  const total = poids.reduce((a, b) => a + b, 0);
  const largeurs = poids.map((p) => Math.floor((p / total) * LARGEUR));
  largeurs[nb - 1] += LARGEUR - largeurs.reduce((a, b) => a + b, 0);
  const bord = { style: BorderStyle.SINGLE, size: 4, color: 'D9D2CC' };
  return new Table({
    width: { size: LARGEUR, type: WidthType.DXA },
    columnWidths: largeurs,
    borders: { top: bord, bottom: bord, left: bord, right: bord, insideHorizontal: bord, insideVertical: bord },
    rows: rangees.map(
      (r, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: r.map((t, c) => cellule(t, largeurs[c], i === 0)),
        }),
    ),
  });
}

const cellulesDe = (ligne) =>
  ligne
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

// ─── Markdown → Word (le sous-ensemble utilisé par nos documents) ────────
let instanceListe = 0;

function markdown(md, decalage = 0) {
  const sortie = [];
  const lignes = md.split('\n');
  let para = [];
  let liste = null; // { type, instance, items: [{niveau, texte}] }
  let code = null;

  const fermerPara = () => {
    if (para.length) {
      let t = para.join(' ');
      const italique = /^_.*_$/.test(t);
      if (italique) t = t.slice(1, -1);
      sortie.push(new Paragraph({ spacing: { after: 120 }, children: runs(t, italique ? { italics: true, color: GRIS } : {}) }));
      para = [];
    }
  };
  const fermerListe = () => {
    if (!liste) return;
    for (const it of liste.items) {
      sortie.push(
        new Paragraph({
          numbering: { reference: liste.type, level: Math.min(it.niveau, 2), instance: liste.instance },
          spacing: { after: 60 },
          children: runs(it.texte),
        }),
      );
    }
    liste = null;
  };
  const fermer = () => {
    fermerPara();
    fermerListe();
  };

  for (let i = 0; i < lignes.length; i++) {
    const brut = lignes[i];
    const l = brut.replace(/^>\s?/, ''); // les citations sont rendues comme du texte

    if (/^\s*```/.test(l)) {
      if (code) {
        for (const c of code) {
          sortie.push(
            new Paragraph({
              shading: { type: ShadingType.CLEAR, fill: 'F5F1EE', color: 'auto' },
              children: [new TextRun({ text: c || ' ', font: MONO, size: 17 })],
            }),
          );
        }
        code = null;
      } else {
        fermer();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(l);
      continue;
    }

    const titre = /^(#{1,6})\s+(.*)$/.exec(l);
    if (titre) {
      fermer();
      const niveau = Math.min(titre[1].length + decalage, 4);
      const niveaux = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
      sortie.push(new Paragraph({ heading: niveaux[niveau - 1], children: runs(titre[2]) }));
      continue;
    }
    if (/^\s*---\s*$/.test(l)) {
      fermer();
      continue;
    }
    if (/^\s*\|/.test(l)) {
      fermer();
      const bloc = [];
      while (i < lignes.length && /^\s*>?\s*\|/.test(lignes[i])) {
        const ligne = lignes[i].replace(/^\s*>\s?/, '');
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(ligne)) bloc.push(cellulesDe(ligne));
        i++;
      }
      i--;
      if (bloc.length) {
        sortie.push(tableau(bloc));
        sortie.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
      }
      continue;
    }
    const puce = /^(\s*)[-*]\s+(.*)$/.exec(l);
    const numero = /^(\s*)\d+\.\s+(.*)$/.exec(l);
    if (puce || numero) {
      fermerPara();
      const m = puce || numero;
      const type = puce ? 'puces' : 'numeros';
      if (!liste || liste.type !== type) {
        fermerListe();
        liste = { type, instance: ++instanceListe, items: [] };
      }
      liste.items.push({ niveau: Math.floor(m[1].length / 2), texte: m[2] });
      continue;
    }
    if (l.trim() === '') {
      fermer();
      continue;
    }
    if (liste && /^\s+\S/.test(l)) {
      liste.items[liste.items.length - 1].texte += ' ' + l.trim();
      continue;
    }
    fermerListe();
    para.push(l.trim());
  }
  fermer();
  return sortie;
}

// ─── Extraction des sources ──────────────────────────────────────────────
function entre(texte, debut, fin) {
  const d = texte.indexOf(debut);
  if (d < 0) throw new Error(`Repère introuvable : « ${debut} »`);
  const f = fin ? texte.indexOf(fin, d + debut.length) : -1;
  return texte.slice(d, f < 0 ? undefined : f);
}

const roadmap = lire('brain/ROADMAP.md');
const changelog = lire('CHANGELOG.md');
const reprise = lire('REPRISE.md');

/** Phases 0 → 22 : le titre et le premier paragraphe de chaque section. */
function phasesInitiales() {
  const zone = entre(roadmap, '## Phase 0', '# Après les phases');
  const lignes = [['Phase', 'Sujet', 'En une phrase']];
  const sections = zone.split(/\n(?=## Phase )/);
  for (const brute of sections) {
    // Une section s'arrête au titre de niveau 1 suivant (« # Phases 11 à 22 ») :
    // sans cela, la phase 10 avalait l'introduction de la partie suivante.
    const s = brute.split(/\n# /)[0];
    const t = /^## Phase (\d+)\s*[:—-]\s*(.+)$/m.exec(s);
    if (!t) continue;
    const corps = s.split('\n').slice(1);
    const para = [];
    for (const l of corps) {
      if (l.trim() === '') {
        if (para.length) break;
        continue;
      }
      if (/^\s*[-|#*>]/.test(l) || /^Deliverables|^Acceptance/.test(l)) {
        if (para.length) break;
        continue;
      }
      para.push(l.trim());
    }
    // Les phases 2 à 10 n'ont pas de phrase d'objectif : leur section commence
    // par la liste des livrables, reprise alors en une ligne.
    let resume = para.join(' ').replace(/^Goal:\s*/, '');
    if (!resume) {
      const livrables = [];
      let dedans = false;
      for (const l of corps) {
        if (/^Deliverables/.test(l)) {
          dedans = true;
          continue;
        }
        if (dedans && /^\s*-\s+/.test(l)) livrables.push(l.replace(/^\s*-\s+/, '').replace(/[;.]\s*$/, ''));
        else if (dedans && livrables.length && l.trim() !== '') break;
      }
      if (livrables.length) resume = 'Livrables : ' + livrables.join(', ') + '.';
    }
    lignes.push([t[1], t[2].trim(), resume]);
  }
  return lignes;
}

/** L'index des phases 24 → 73, tel que ROADMAP le tient. */
function indexPhases() {
  const zone = entre(roadmap, '# Phases 24', '## Depuis le 31/10');
  const lignes = zone.split('\n').filter((l) => /^\|\s*[\d-]+\s*\|/.test(l));
  return [['Phase', 'Date', 'Sujet (titre de la section du manuel)'], ...lignes.map(cellulesDe)];
}

/** Toutes les versions du CHANGELOG, de la plus récente à la plus ancienne. */
function versions() {
  const rangees = [['Version', 'Date', 'Sujet']];
  for (const l of changelog.split('\n')) {
    const m = /^## \[([^\]]+)\]\s*—\s*(\d{4}-\d{2}-\d{2})\s*—\s*(.+)$/.exec(l);
    if (m) rangees.push([m[1], m[2], m[3]]);
  }
  return rangees;
}

/** Le détail des versions récentes : le CHANGELOG, de la plus récente à 1.5.0. */
function versionsRecentes() {
  const d = changelog.indexOf('## [');
  const f = changelog.indexOf('## [1.4.0]');
  return changelog.slice(d, f);
}

function dernierAudit() {
  const dossier = path.join(RACINE, 'brain', 'audits');
  const fichiers = fs
    .readdirSync(dossier)
    .filter((f) => /^AUDIT_\d{4}-\d{2}-\d{2}.*\.md$/.test(f))
    .sort();
  const dernier = fichiers[fichiers.length - 1];
  return { nom: dernier, texte: lire(path.join('brain', 'audits', dernier)) };
}

// ─── Le guide qui n'existe nulle part ailleurs ───────────────────────────
const GUIDE_BUG = `
Ce guide sert à **remonter d'un symptôme à sa cause** sans connaître le code par cœur. Il suppose seulement un accès au dépôt et aux consoles (Railway, Vercel, Expo, App Store Connect, Play Console, Stripe).

## 1. Fixer le symptôme

- **Quel écran ou quelle route**, avec quelles données (club, lieu, événement, numéro de commande).
- **Quelle version** : numéro de build de l'app (TestFlight / Play Console), commit du serveur (\`GET https://breakeat-admin-production.up.railway.app/health\` → champ \`commit\`), déploiement Vercel des consoles.
- **Depuis quand** : la date du premier signalement borne la recherche dans le CHANGELOG.

## 2. Vérifier que le code en ligne est celui qu'on croit

- Comparer le \`commit\` de \`/health\` à \`git log -1 origin/main\`. Un serveur en retard sur \`main\` signale presque toujours une **migration bloquée** (journal *Deploy* de Railway, pas *Build*) — jamais « le serveur est lent ».
- Pour l'app : la liste des builds Expo donne le **commit** de chaque build (colonne « Git ref »).

## 3. Trouver la livraison suspecte

- \`CHANGELOG.md\` : les entrées entre la dernière version saine et la première version fautive. Chacune liste ses fichiers (\`+\` créés, \`~\` modifiés).
- Le **pourquoi** de chaque choix est dans \`brain/ENGINEERING_MANUAL.md\`, section de la phase (index plus bas dans ce document) ou de la période.
- En dernier recours : \`git log -S"texte affiché"\` retrouve le commit qui a introduit ou retiré une phrase ; \`git bisect\` coupe l'historique en deux jusqu'au commit fautif.

## 4. Trouver le code

- \`GUIDE_DEVELOPPEMENT/CARTE_DU_CODE.md\` : quel module, quel écran, quel fichier — et les fichiers qui existent **en double** (une correction vaut pour les deux).
- \`git log -p -- <fichier>\` : l'histoire du fichier, avec les messages de commit, écrits pour expliquer le pourquoi.

## 5. Lire les journaux avant toute hypothèse

- **Railway** (serveur) : journaux *Deploy* et HTTP.
- **Stripe** (paiements) : Developers → Events / Webhooks.
- **Vercel** (consoles web) : Deployments → Logs.
- **Expo** (builds) : la page de la build ; **App Store Connect** : TestFlight → plantages.
- **CI GitHub** : \`https://github.com/Break-Eat-APP/breakeat-admin/actions\`. Un commit rouge sur la CI est le premier suspect.

## 6. Les pièges déjà rencontrés

| Symptôme | Première piste | Où c'est expliqué |
|---|---|---|
| Une route publique répond 400 « uuid is expected » | une route littérale déclarée APRÈS \`:id\` | manuel, 05 → 09/11 |
| La Live Activity « ne bouge plus » | le \`ContentState\` du serveur et celui du Swift ne correspondent plus (iOS ignore en silence) | \`BreakEatOrderAttributes.swift\` |
| Le chrono de la Live Activity reste à 0:00 | \`peremption.ts\` (serveur) et \`countdownTarget\` (Swift) ne suivent plus la même règle | CHANGELOG 1.7.0 |
| L'extension Live Activity a disparu de la build, sans erreur | un greffon \`@bacons/apple-targets\` ignoré : dépendance non déclarée (\`packageExtensions\`) ; vérifier \`npx expo config --type prebuild\` | manuel, 09/11 soir |
| Plantage iOS « useState of null » | deux copies de React ; singletons forcés dans \`apps/mobile/metro.config.js\` | manuel |
| Build Android : « Field 'version' is required » dans Gradle | un paquet Expo d'un SDK en avance (cas \`expo-store-review\`) | CHANGELOG 1.5.0 |
| Google Play refuse une build | clé d'importation : SHA-1 du keystore EAS ≠ celui attendu par la Play Console | CHANGELOG 1.7.2 |
| Bouton Google en échec sur Android (\`DEVELOPER_ERROR\`) | client OAuth Android manquant pour ce paquet et ce SHA-1 | REPRISE, Android |
| « Mot de passe oublié » n'apparaît pas | \`MAIL_PROVIDER\` / \`MAIL_API_KEY\` / \`MAIL_FROM\` absents de Railway | REPRISE |
| Tests verts sur le poste, rouges sur la CI | fuseau horaire (CI en UTC), ou tests d'intégration qui ne tournent que sur la CI | manuel, 09/11 soir |
| Échec sur le poste, vert sur la CI | OneDrive ou magasin pnpm local ; la CI fait foi | manuel, 09/11 soir |
| Une alerte ne s'affiche pas sur le web | \`Alert.alert\` ne fait rien sur le web : utiliser \`lib/alert.ts\` | manuel |
| Commande payée qui n'arrive nulle part | phase 29 : stock, compte Stripe, retour de paiement, poste opérateur | manuel, phase 29 |
| Réglages Break Eat absents de la fiche d'un match | normal sur un lieu Flaix (\`venue.flaixEnabled\`) | CHANGELOG 1.6.0 |
`;

const DOCUMENTS = `
| Document | Ce qu'il contient | Quand il change |
|---|---|---|
| \`REPRISE.md\` | l'état courant, ce qui reste dans l'ordre, les pièges du moment | à chaque fin de session |
| \`CHANGELOG.md\` | chaque livraison : quoi, pourquoi, fichiers touchés | à chaque livraison |
| \`brain/ENGINEERING_MANUAL.md\` | le pourquoi de chaque décision, phase par phase, et les règles tirées des erreurs | à chaque décision qui engage la suite |
| \`brain/TASK_SUMMARY.md\` | le résumé de chaque session, erreurs commises comprises (le plus récent en haut) | à chaque session |
| \`brain/ROADMAP.md\` | le plan initial (0 → 10), les phases reconstituées (11 → 22), l'index 24 → 73, les versions | à chaque version |
| \`GUIDE_DEVELOPPEMENT/CARTE_DU_CODE.md\` | où vit chaque chose dans le code | quand un fichier important naît ou change de rôle |
| \`brain/audits/\` | les audits, datés | à chaque audit |
| ce document (\`PHASES_DE_DEVELOPPEMENT.docx\`) | tout ce qui précède, rassemblé, et le guide de recherche de cause | régénéré par \`generer-phases-docx.js\` |
| l'historique git | chaque commit explique son pourquoi | toujours |
`;

// ─── Assemblage ──────────────────────────────────────────────────────────
function commitCourant() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: RACINE }).toString().trim();
  } catch {
    return 'inconnu';
  }
}

const h = (niveau, texte) =>
  new Paragraph({
    heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][niveau - 1],
    children: runs(texte),
  });
const p = (texte, base) => new Paragraph({ spacing: { after: 120 }, children: runs(texte, base) });
const saut = () => new Paragraph({ children: [new PageBreak()] });

const audit = dernierAudit();
const etat = entre(reprise, '## 🟢 ÉTAT AU', '## 🗄️ ÉTAT AU');
const apresPhases = entre(roadmap, '# Après les phases', '# Phases 24');
const aujourdHui = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

const contenu = [
  // Page de titre
  new Paragraph({ spacing: { before: 2400, after: 240 }, children: [new TextRun({ text: 'BreakEat', font: POLICE, size: 64, bold: true, color: ORANGE })] }),
  new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: 'Phases de développement et traçabilité', font: POLICE, size: 40, bold: true })] }),
  new Paragraph({
    spacing: { after: 600 },
    children: [new TextRun({ text: 'Pour retrouver, à partir d’un symptôme, la livraison et la décision qui en sont la cause.', font: POLICE, size: 24, color: GRIS })],
  }),
  p(`Généré le ${aujourdHui} depuis le dépôt (commit ${commitCourant()}) par GUIDE_DEVELOPPEMENT/generer-phases-docx.js.`, { color: GRIS, size: 18 }),
  p('Sources : brain/ROADMAP.md, CHANGELOG.md, REPRISE.md, brain/ENGINEERING_MANUAL.md, ' + `brain/audits/${audit.nom}. ` + 'En cas de désaccord, ce sont elles qui font foi : régénérer ce document.', { color: GRIS, size: 18 }),
  saut(),

  // Pas un titre : il ne doit pas figurer dans son propre sommaire.
  new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Sommaire', font: POLICE, size: 32, bold: true, color: ORANGE })] }),
  new TableOfContents('Sommaire', { hyperlink: true, headingStyleRange: '1-2' }),
  saut(),

  h(1, 'Remonter à la cause d’un bug'),
  ...markdown(GUIDE_BUG, 1),
  saut(),

  h(1, 'Les documents du dossier'),
  ...markdown(DOCUMENTS, 1),
  saut(),

  h(1, 'État courant et ce qui reste'),
  p('Reprise telle quelle de REPRISE.md, section « État ».', { color: GRIS, italics: true }),
  ...markdown(etat.split('\n').slice(1).join('\n'), 1),
  saut(),

  h(1, 'Phases 0 à 22'),
  p('Phases 0 à 10 : le plan initial (rédigé en anglais dans ROADMAP.md). Phases 11 à 22 : reconstituées après coup. Le détail est dans brain/ROADMAP.md et brain/ENGINEERING_MANUAL.md.'),
  tableau(phasesInitiales()),
  new Paragraph({ children: [] }),
  ...markdown(apresPhases, 1),
  saut(),

  h(1, 'Phases 24 à 73'),
  p('La phase 23 n’existe pas (numérotation passée de 22 à 24). Chaque ligne renvoie à une section de brain/ENGINEERING_MANUAL.md portant le même titre ; les phases 71 à 73 sont décrites dans CHANGELOG.md, entrée 1.2.0.'),
  tableau(indexPhases()),
  saut(),

  h(1, 'Toutes les versions'),
  p('Depuis le 31/10/2026, le travail se compte en versions du CHANGELOG plutôt qu’en phases. La liste complète, de la plus récente à la plus ancienne :'),
  tableau(versions()),
  saut(),

  h(1, 'Détail des versions récentes'),
  p('Reprise du CHANGELOG, de la plus récente à la 1.5.0.', { color: GRIS, italics: true }),
  ...markdown(versionsRecentes(), 0),
  saut(),

  h(1, 'Dernier audit'),
  p(`brain/audits/${audit.nom}`, { color: GRIS, italics: true }),
  ...markdown(audit.texte.split('\n').slice(1).join('\n'), 1),
];

const titre = (taille, avant) => ({
  run: { font: POLICE, size: taille, bold: true },
  paragraph: { spacing: { before: avant, after: 120 }, keepNext: true },
});

const doc = new Document({
  creator: 'BreakEat',
  title: 'BreakEat — Phases de développement et traçabilité',
  styles: {
    default: { document: { run: { font: POLICE, size: 20 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, ...titre(32, 240), run: { font: POLICE, size: 32, bold: true, color: ORANGE } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, ...titre(26, 240) },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, ...titre(22, 180) },
      { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', quickFormat: true, ...titre(20, 120) },
    ],
  },
  numbering: {
    config: [
      {
        reference: 'puces',
        levels: [0, 1, 2].map((niveau) => ({
          level: niveau,
          format: LevelFormat.BULLET,
          text: ['•', '◦', '▪'][niveau],
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360 * (niveau + 1), hanging: 260 } } },
        })),
      },
      {
        reference: 'numeros',
        levels: [0, 1, 2].map((niveau) => ({
          level: niveau,
          format: LevelFormat.DECIMAL,
          text: `%${niveau + 1}.`,
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360 * (niveau + 1), hanging: 300 } } },
        })),
      },
    ],
  },
  sections: [
    {
      properties: {
        page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: 'BreakEat — Phases de développement · page ', font: POLICE, size: 16, color: GRIS }),
                new TextRun({ children: [PageNumber.CURRENT], font: POLICE, size: 16, color: GRIS }),
              ],
            }),
          ],
        }),
      },
      children: contenu,
    },
  ],
});

Packer.toBuffer(doc).then((tampon) => {
  fs.writeFileSync(SORTIE, tampon);
  console.log(`Écrit : ${path.relative(RACINE, SORTIE)} (${Math.round(tampon.length / 1024)} Ko)`);
});
