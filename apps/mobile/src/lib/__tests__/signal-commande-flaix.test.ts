/**
 * LE SIGNAL « UNE COMMANDE FLAIX VIENT D'ÊTRE PASSÉE » (24/11/2026).
 */
import { creerSignalCommandeFlaix } from '../signal-commande-flaix';

describe('signal de commande Flaix', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('lit une seule fois quand plusieurs pages se chargent coup sur coup', async () => {
    const lire = jest.fn().mockResolvedValue(undefined);
    const s = creerSignalCommandeFlaix({ lire, estConnecte: () => true, attenteMs: 3000 });

    s.planifier();
    jest.advanceTimersByTime(1000);
    s.planifier();
    jest.advanceTimersByTime(2999);
    expect(lire).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(lire).toHaveBeenCalledTimes(1);
  });

  it('lit tout de suite à la fermeture, et annule la lecture planifiée', async () => {
    const lire = jest.fn().mockResolvedValue(undefined);
    const s = creerSignalCommandeFlaix({ lire, estConnecte: () => true });

    s.planifier();
    await s.maintenant();
    expect(lire).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(10_000);
    await Promise.resolve();
    expect(lire).toHaveBeenCalledTimes(1);
  });

  it("ne lit pas sans session", async () => {
    const lire = jest.fn();
    const s = creerSignalCommandeFlaix({ lire, estConnecte: () => false });
    await s.maintenant();
    expect(lire).not.toHaveBeenCalled();
  });

  it('avale une erreur de lecture', async () => {
    const lire = jest.fn().mockRejectedValue(new Error('réseau'));
    const s = creerSignalCommandeFlaix({ lire, estConnecte: () => true });
    await expect(s.maintenant()).resolves.toBeUndefined();
  });

  it('relit une fois si un signal arrive pendant une lecture', async () => {
    let finir: () => void = () => undefined;
    const lire = jest
      .fn()
      .mockImplementationOnce(() => new Promise<void>((r) => (finir = r)))
      .mockResolvedValue(undefined);
    const s = creerSignalCommandeFlaix({ lire, estConnecte: () => true });

    const premiere = s.maintenant();
    await s.maintenant();
    await s.maintenant();
    expect(lire).toHaveBeenCalledTimes(1);
    finir();
    await premiere;
    expect(lire).toHaveBeenCalledTimes(2);
  });
});
