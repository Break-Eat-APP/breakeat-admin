import { DelaiDepasse, fetchAvecDelai } from '../api/delai-lecture';

/**
 * Un `fetch` factice qui ne répond jamais, sauf si on l'annule — c'est le
 * serveur saturé du coup d'envoi.
 */
const fetchQuiPend = (appels: RequestInit[]) =>
  ((_url: string, init: RequestInit) => {
    appels.push(init);
    return new Promise<Response>((_ok, ko) => {
      init.signal?.addEventListener('abort', () => ko(new Error('aborted')));
    });
  }) as unknown as typeof fetch;

describe('fetchAvecDelai', () => {
  it('une LECTURE qui ne répond pas est coupée, avec un message clair', async () => {
    const appels: RequestInit[] = [];
    await expect(fetchAvecDelai('/x', { method: 'GET' }, 20, fetchQuiPend(appels))).rejects.toBeInstanceOf(
      DelaiDepasse,
    );
    expect(appels[0].signal).toBeDefined();
  });

  it('sans méthode, c’est une lecture', async () => {
    await expect(fetchAvecDelai('/x', {}, 20, fetchQuiPend([]))).rejects.toBeInstanceOf(DelaiDepasse);
  });

  it('une ÉCRITURE n’est jamais coupée : le serveur l’enregistre peut-être', async () => {
    const appels: RequestInit[] = [];
    let fini = false;
    const p = fetchAvecDelai('/orders', { method: 'POST' }, 20, fetchQuiPend(appels)).finally(() => {
      fini = true;
    });
    await new Promise<void>((r) => setTimeout(() => r(), 60));
    expect(fini).toBe(false);
    expect(appels[0].signal).toBeUndefined();
    void p.catch(() => undefined);
  });

  it('une réponse rapide passe intacte', async () => {
    const reponse = { ok: true } as Response;
    const rapide = (async () => reponse) as unknown as typeof fetch;
    await expect(fetchAvecDelai('/x', {}, 20, rapide)).resolves.toBe(reponse);
  });

  it('une erreur réseau qui n’est pas un délai remonte telle quelle', async () => {
    const enPanne = (async () => {
      throw new Error('réseau coupé');
    }) as unknown as typeof fetch;
    await expect(fetchAvecDelai('/x', {}, 1000, enPanne)).rejects.toThrow('réseau coupé');
  });
});
