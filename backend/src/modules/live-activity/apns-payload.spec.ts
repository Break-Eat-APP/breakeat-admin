import { construirePayloadLiveActivity } from './apns.service';

/**
 * La charge utile APNs d'une Live Activity.
 *
 * Apple accepte une clé mal nommée et l'ignore : l'activité reste alors figée
 * sans la moindre erreur. Ces tests verrouillent les noms que iOS attend.
 */
describe('construirePayloadLiveActivity', () => {
  const maintenant = new Date('2026-09-17T12:00:00Z');
  const etat = { status: 'READY', statusLabel: 'Commande prête' };

  it('une mise à jour ordinaire reste SILENCIEUSE', () => {
    const p = construirePayloadLiveActivity('update', etat, {}, maintenant) as {
      aps: Record<string, unknown>;
    };
    expect(p.aps).toEqual({
      timestamp: 1789646400,
      event: 'update',
      'content-state': etat,
    });
    expect(p.aps).not.toHaveProperty('alert');
  });

  it('un produit manquant ALLUME l’écran, avec un son', () => {
    const p = construirePayloadLiveActivity(
      'update',
      etat,
      { alert: { title: 'Produit manquant', body: 'Il manque 1× Bière.' } },
      maintenant,
    ) as { aps: Record<string, unknown> };
    expect(p.aps.alert).toEqual({
      title: 'Produit manquant',
      body: 'Il manque 1× Bière.',
      sound: 'default',
    });
  });

  it('les dates sont en secondes, et la date de retrait ne vaut que pour la fin', () => {
    const plusTard = new Date('2026-09-17T13:00:00Z');
    const maj = construirePayloadLiveActivity(
      'update',
      etat,
      { staleDate: plusTard, dismissalDate: plusTard },
      maintenant,
    ) as { aps: Record<string, unknown> };
    expect(maj.aps['stale-date']).toBe(1789650000);
    expect(maj.aps).not.toHaveProperty('dismissal-date');

    const fin = construirePayloadLiveActivity(
      'end',
      etat,
      { dismissalDate: plusTard },
      maintenant,
    ) as {
      aps: Record<string, unknown>;
    };
    expect(fin.aps['dismissal-date']).toBe(1789650000);
  });
});
