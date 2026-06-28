/* eslint-disable */
// Post-traitement de l'export web Expo pour hébergement statique (Netlify/Vercel).
//
// pnpm range les assets (polices Fredoka + @expo/vector-icons, icônes de navigation…)
// sous `dist/assets/__node_modules/.pnpm/@scope+pkg@version/…`. Ce chemin est REFUSÉ
// par les hôtes statiques (dossier `.pnpm` commençant par un point, dossier
// `__node_modules`, caractères `@`/`+`) → 404 → police cassée + icônes absentes.
//
// Fix robuste : on déplace TOUS ces assets vers un dossier plat `dist/vendor/`
// (noms déjà hashés, donc uniques) et on réécrit les références dans le build.
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const nm = path.join(dist, 'assets', '__node_modules');
const vendor = path.join(dist, 'vendor');

if (!fs.existsSync(dist)) {
  console.error("fix-web-assets: dossier dist introuvable — lance `expo export -p web` d'abord.");
  process.exit(1);
}

let moved = 0;
if (fs.existsSync(nm)) {
  fs.mkdirSync(vendor, { recursive: true });
  const stack = [nm];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else {
        // Nom de base (déjà content-hashé par Expo → collision quasi impossible).
        fs.renameSync(p, path.join(vendor, e.name));
        moved++;
      }
    }
  }
  fs.rmSync(nm, { recursive: true, force: true });
}

// Réécrit toute référence ".../assets/__node_modules/<...>/<base>.<ext>" -> "/vendor/<base>.<ext>".
const re = /((?:\.\.)?\/)?assets\/__node_modules\/[^\s"'()]+?\/([\w.\-]+\.\w+)/g;
let patched = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|json|html|map|css)$/.test(e.name)) {
      const c = fs.readFileSync(p, 'utf8');
      if (c.includes('assets/__node_modules/')) {
        const out = c.replace(re, (_m, lead, base) => `${lead || '/'}vendor/${base}`);
        if (out !== c) {
          fs.writeFileSync(p, out);
          patched++;
        }
      }
    }
  }
}
walk(dist);
console.log(`fix-web-assets: ${moved} asset(s) déplacé(s) vers /vendor, ${patched} fichier(s) réécrit(s). Prêt pour hébergement statique.`);
