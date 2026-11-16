/**
 * LES CRÉNEAUX, RANGÉS PAR MOMENT (demande de Rémi, 16/11/2026).
 *
 * L'écran de choix n'affichait qu'une heure par créneau : le club avait réglé
 * un créneau « Mi-temps » sur sa buvette, le client lisait « 17:30 » sans
 * savoir que c'était la mi-temps. Les créneaux sont désormais rangés sous le
 * nom de leur moment.
 *
 * Le moment (`kind`) ne vaut QUE pour un créneau issu d'un modèle de la
 * buvette (`templateId`) : un créneau saisi sur l'événement porte le moment par
 * défaut de la base (« Immédiat »), qui ne dit rien de lui. Ceux-là vont sous
 * « Créneaux horaires ».
 */
export interface CreneauRangeable {
  id: string;
  label: string | null;
  startAt: string;
  endAt: string;
  kind?: string;
  templateId?: string | null;
}

export interface SectionCreneaux<T> {
  cle: string;
  titre: string;
  data: T[];
}

/** L'ordre d'une soirée : tout de suite, la mi-temps, la deuxième pause, puis les heures. */
const SECTIONS: { cle: string; titre: string }[] = [
  { cle: 'IMMEDIATE', titre: 'Dès que c’est prêt' },
  { cle: 'PAUSE_1', titre: 'Mi-temps' },
  { cle: 'PAUSE_2', titre: 'Deuxième pause' },
  { cle: 'HORAIRE', titre: 'Créneaux horaires' },
  { cle: 'CUSTOM', titre: 'À heure précise' },
];

function cleDe(c: CreneauRangeable): string {
  if (!c.templateId || !c.kind) return 'HORAIRE';
  if (c.kind === 'GENERAL') return 'HORAIRE';
  return SECTIONS.some((s) => s.cle === c.kind) ? c.kind : 'HORAIRE';
}

export function rangerCreneaux<T extends CreneauRangeable>(creneaux: T[]): SectionCreneaux<T>[] {
  const parDebut = [...creneaux].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  return SECTIONS.map((s) => ({
    cle: s.cle,
    titre: s.titre,
    data: parDebut.filter((c) => cleDe(c) === s.cle),
  })).filter((s) => s.data.length > 0);
}

/** « 14:00 – 14:15 » : la plage, dans le fuseau du téléphone. */
export function plageHoraire(c: { startAt: string; endAt: string }): string {
  const h = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return `${h(c.startAt)} – ${h(c.endAt)}`;
}

/**
 * Ce qu'on écrit en gros sur la carte : le nom donné par le club, sinon la
 * plage horaire. La plage passe dessous quand le nom n'est pas déjà une heure.
 */
export function titreEtDetail(c: CreneauRangeable): { titre: string; detail: string | null } {
  const plage = plageHoraire(c);
  const nom = c.label?.trim();
  if (!nom) return { titre: plage, detail: null };
  const estDejaUneHeure = /^\d{1,2}[:h]\d{2}/.test(nom);
  return { titre: nom, detail: estDejaUneHeure ? null : plage };
}
