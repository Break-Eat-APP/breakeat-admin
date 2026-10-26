import { BadRequestException } from '@nestjs/common';
import { OrderSplitsService } from './order-splits.service';

/**
 * L'INTERRUPTEUR DE L'ARDOISE — un flag en base, sinon l'environnement.
 *
 * L'ardoise touche à de l'argent déjà encaissé : elle rembourse quand un envoi
 * échoue. Si elle se comporte mal un soir de match, il faut pouvoir la couper
 * **en quelques secondes**. Avec la seule variable d'environnement, il fallait
 * redéployer — cinq minutes, et un risque de plus au pire moment.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DEUX PIÈGES, TOUS DEUX VERROUILLÉS ICI.
 *
 * **1. « Aucun flag » n'est pas « flag à faux ».** `resolve()` rend `false`
 * dans les deux cas. Brancher l'ardoise dessus l'aurait désactivée partout
 * tant que personne n'avait créé la ligne — une panne immédiate, le jour de la
 * mise en service. D'où `resolveOuRien`, qui rend `null`.
 *
 * **2. Une garde devenue asynchrone doit être attendue.** En rendant
 * `assertActive()` asynchrone, trois appels sont restés sans `await` : la
 * promesse flottait, l'exécution continuait, et **l'ardoise serait restée
 * ouverte même coupée**. Le typecheck ne l'a pas vu — une promesse flottante
 * est du TypeScript valide. Les tests ci-dessous, eux, le voient.
 */
describe('OrderSplitsService — l’interrupteur', () => {
  function monter(flagEnBase: boolean | null, variableEnv: boolean) {
    const flags = { resolveOuRien: jest.fn().mockResolvedValue(flagEnBase) };
    const service = new OrderSplitsService(
      {} as never,
      {} as never,
      {} as never,
      { get: (cle: string) => (cle === 'app.split.enabled' ? variableEnv : undefined) } as never,
      flags as never,
    );
    return { service, flags };
  }

  describe('qui décide', () => {
    it('sans flag en base, la variable d’environnement décide — ouverte', async () => {
      const { service } = monter(null, true);
      await expect(service.estActive()).resolves.toBe(true);
    });

    it('sans flag en base, la variable d’environnement décide — fermée', async () => {
      const { service } = monter(null, false);
      await expect(service.estActive()).resolves.toBe(false);
    });

    /**
     * Le cas qui justifie tout : couper l'ardoise sans redéployer, alors que
     * l'environnement dit encore « ouverte ».
     */
    it('un flag à FAUX ferme, même si l’environnement dit ouverte', async () => {
      const { service } = monter(false, true);
      await expect(service.estActive()).resolves.toBe(false);
    });

    it('un flag à VRAI ouvre, même si l’environnement dit fermée', async () => {
      const { service } = monter(true, false);
      await expect(service.estActive()).resolves.toBe(true);
    });

    it('interroge bien la clé attendue', async () => {
      const { service, flags } = monter(null, true);
      await service.estActive();
      expect(flags.resolveOuRien).toHaveBeenCalledWith('app.split.enabled');
    });
  });

  /**
   * LA GARDE DOIT VRAIMENT BLOQUER.
   *
   * C'est ici que se joue le piège de la promesse flottante : si un appelant
   * oublie son `await`, la méthode continue et ouvre une ardoise que
   * l'exploitant croyait coupée.
   */
  describe('la garde bloque réellement', () => {
    it('refuse d’ouvrir une ardoise quand l’interrupteur est coupé', async () => {
      const { service } = monter(false, true);

      await expect(
        service.ouvrir('u1', 'panier-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('le message s’adresse au client, pas au développeur', async () => {
      const { service } = monter(false, false);

      await expect(
        service.ouvrir('u1', 'panier-1'),
      ).rejects.toThrow(/partage d’addition n’est pas activé/);
    });
  });
});
