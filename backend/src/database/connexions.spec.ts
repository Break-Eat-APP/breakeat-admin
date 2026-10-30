import { lireLesConnexions, resumeDesConnexions, OCCUPATION_ALERTE } from './connexions';

/**
 * COMBIEN DE RÉPLIQUES LA BASE PEUT ENCORE PORTER.
 *
 * C'est la question d'un soir de gros match : on veut ajouter une instance
 * pour encaisser l'affluence. Le pool en ouvre dix ; si la base est à
 * quatre-vingt-quinze connexions sur cent, l'instance qu'on ajoute est
 * précisément celle qui épuisera la base — et l'API répondra « too many
 * connections » pendant que le processeur s'ennuie.
 *
 * Rien de tout cela ne figurait dans le dépôt. On le demande maintenant à
 * PostgreSQL, qui sait.
 */
describe('les connexions que la base peut encore porter', () => {
  /** Une base qui répond ce qu'on lui dit de répondre. */
  const base = (plafond: string, ouvertes: bigint) => ({
    $queryRawUnsafe: jest.fn().mockResolvedValue([{ plafond, ouvertes }]),
  });

  it('dit combien d’instances de plus le plafond permet', async () => {
    const etat = await lireLesConnexions(base('100', 40n), 10);

    expect(etat).toEqual({
      plafond: 100,
      ouvertes: 40,
      libres: 60,
      occupation: 40,
      // Six instances de dix connexions tiennent encore.
      instancesPossibles: 6,
    });
  });

  /**
   * LE CAS QUI COMPTE : la base est pleine, et l'on s'apprête à ajouter le
   * replica qui la fera tomber.
   */
  it('annonce ZÉRO instance possible quand la base est pleine', async () => {
    const etat = await lireLesConnexions(base('100', 96n), 10);

    expect(etat?.instancesPossibles).toBe(0);
    expect(etat?.occupation).toBeGreaterThanOrEqual(OCCUPATION_ALERTE);
  });

  it('ne rend jamais un nombre de libres négatif', async () => {
    // Le plafond peut avoir été abaissé pendant que des connexions tenaient.
    const etat = await lireLesConnexions(base('50', 60n), 10);

    expect(etat?.libres).toBe(0);
    expect(etat?.instancesPossibles).toBe(0);
  });

  /**
   * UN PLAFOND INCONNU N'EST PAS UNE PANNE. Certaines bases gérées masquent
   * ces vues, et un démarrage ne doit pas échouer pour une ligne
   * d'information.
   */
  it('rend « inconnu » plutôt que de lever quand la base refuse', async () => {
    const muette = { $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('permission denied')) };

    await expect(lireLesConnexions(muette, 10)).resolves.toBeNull();
  });

  it('rend « inconnu » sur une réponse illisible', async () => {
    for (const absurde of ['', 'beaucoup', '0', '-10']) {
      await expect(lireLesConnexions(base(absurde, 10n), 10)).resolves.toBeNull();
    }
    const vide = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    await expect(lireLesConnexions(vide, 10)).resolves.toBeNull();
  });

  // ─── La phrase du journal ───────────────────────────────────────

  it('se lit en une phrase dans les journaux de déploiement', async () => {
    const etat = await lireLesConnexions(base('100', 40n), 10);

    expect(resumeDesConnexions(etat)).toBe(
      '40/100 connexions prises (40 %), de quoi tenir encore 6 instance(s)',
    );
  });

  it('dit clairement qu’on ne sait pas, plutôt que d’inventer', () => {
    expect(resumeDesConnexions(null)).toContain('inconnu');
  });
});
