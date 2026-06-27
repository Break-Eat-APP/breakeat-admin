/* eslint-disable */
// Post-traitement de l'export web Expo pour hébergement statique (Netlify/Vercel).
//
// pnpm range les assets sous `dist/assets/__node_modules/.pnpm/…`. Or les hôtes
// statiques (Netlify) IGNORENT les dossiers commençant par un point → les polices
// (Fredoka + @expo/vector-icons) renvoient 404, la police casse et les icônes
// disparaissent. On renomme `.pnpm` → `pnpm` et on corrige les références dans le bundle.
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const dotPnpm = path.join(dist, 'assets', '__node_modules', '.pnpm');
const pnpm = path.join(dist, 'assets', '__node_modules', 'pnpm');

if (!fs.existsSync(dist)) {
  console.error('fix-web-assets: dossier dist introuvable — lance `expo export -p web` d\'abord.');
  process.exit(1);
}

if (fs.existsSync(dotPnpm)) {
  fs.rmSync(pnpm, { recursive: true, force: true });
  fs.renameSync(dotPnpm, pnpm);
  console.log('fix-web-assets: dossier .pnpm renommé en pnpm');
}

// Réécrit les références "/.pnpm/" -> "/pnpm/" dans tous les fichiers texte du build.
let patched = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|json|html|map|css)$/.test(e.name)) {
      const c = fs.readFileSync(p, 'utf8');
      if (c.includes('/.pnpm/')) {
        fs.writeFileSync(p, c.split('/.pnpm/').join('/pnpm/'));
        patched++;
      }
    }
  }
}
walk(dist);
console.log(`fix-web-assets: ${patched} fichier(s) corrigé(s). Prêt pour l'hébergement statique.`);
