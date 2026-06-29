/**
 * coords.ts — conversion DMS ↔ décimal pour les formulaires de lieu.
 *
 * Formats acceptés :
 *   - Décimal      : "43.296" ou "43,296"
 *   - DMS complet  : "43° 17' 45.6\" N" ou "43°17'45.6\"N"
 *   - Paire décimal : "43.296, 5.404" ou "43.296 5.404"
 *   - Paire DMS    : "43° 17' 45.6\" N, 5° 24' 17.2\" E"
 */

/** Convertit un token DMS ou décimal en nombre décimal. Retourne null si invalide. */
function parseSingleCoord(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;

  // Décimal direct (accepte la virgule comme séparateur)
  const dec = Number(s.replace(',', '.'));
  if (Number.isFinite(dec)) return dec;

  // DMS : deg° min' sec" [N|S|E|O|W]
  // Exemples : "43° 17' 45.2184\" N"  "5°24'17.2\"E"
  const dmsRe = /^(\d+)\s*[°]\s*(\d+)\s*['′]\s*([\d.,]+)\s*["″]\s*([NSEOWnseoow])?$/;
  const m = dmsRe.exec(s.replace(/\s+/g, ' ').trim());
  if (m) {
    const deg = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = parseFloat(m[3].replace(',', '.'));
    const dir = (m[4] ?? '').toUpperCase();
    if (min >= 60 || sec >= 60) return null;
    let result = deg + min / 60 + sec / 3600;
    if (dir === 'S' || dir === 'O' || dir === 'W') result = -result;
    return Number.isFinite(result) ? Math.round(result * 1e7) / 1e7 : null;
  }

  return null;
}

export interface ParsedCoords {
  lat: number;
  lng: number;
}

/**
 * Tente de parser une chaîne contenant lat + lng dans n'importe quel format.
 * Retourne null si la chaîne ne correspond à rien de connu.
 *
 * Stratégie :
 *   1. Séparateur virgule : "43.296, 5.404" ou DMS avec virgule
 *   2. Séparateur espace  : deux tokens côte à côte
 */
export function parseCoordsString(input: string): ParsedCoords | null {
  const s = input.trim();
  if (!s) return null;

  // Tente de séparer sur une virgule (hors des degrés/minutes/secondes)
  // On repère les virgules qui ne sont PAS à l'intérieur d'un nombre DMS
  const commaSplit = s.split(/,(?![^°]*["″])/);
  if (commaSplit.length >= 2) {
    const lat = parseSingleCoord(commaSplit[0].trim());
    const lng = parseSingleCoord(commaSplit.slice(1).join(',').trim());
    if (lat !== null && lng !== null) return { lat, lng };
  }

  // Tente de séparer sur l'espace entre deux groupes DMS/décimal
  // Pattern : <coord>[NSEO] <coord>[NSEO]  ou  <decimal> <decimal>
  const spaceRe = /^([\d°\s'′"″.,]+[NSEOnseow]?)\s+([\d°\s'′"″.,]+[NSEOnseow]?)$/i;
  const sm = spaceRe.exec(s);
  if (sm) {
    const lat = parseSingleCoord(sm[1].trim());
    const lng = parseSingleCoord(sm[2].trim());
    if (lat !== null && lng !== null) return { lat, lng };
  }

  return null;
}

/** Formate un nombre décimal en 6 décimales max (supprime les zéros trailing). */
export function fmtCoord(n: number): string {
  return parseFloat(n.toFixed(6)).toString();
}
