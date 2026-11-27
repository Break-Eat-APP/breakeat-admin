import { APP_STORE_ID, PACKAGE_ANDROID, libelleFicheStore, liensFicheStore } from '../fiche-store';

describe('la fiche BreakEat sur les stores', () => {
  it('iPhone : l’App Store, directement sur « écrire un avis »', () => {
    const l = liensFicheStore('ios');
    expect(l?.app).toBe(`itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`);
    expect(l?.web).toContain('apps.apple.com');
  });

  it('Android : le Play Store, avec le web en secours', () => {
    const l = liensFicheStore('android');
    expect(l?.app).toBe(`market://details?id=${PACKAGE_ANDROID}`);
    expect(l?.web).toBe(`https://play.google.com/store/apps/details?id=${PACKAGE_ANDROID}`);
  });

  it('le web n’a pas de fiche', () => {
    expect(liensFicheStore('web')).toBeNull();
  });

  it('le libellé nomme le store du téléphone', () => {
    expect(libelleFicheStore('android')).toBe('Noter BreakEat sur Google Play');
    expect(libelleFicheStore('ios')).toBe('Noter BreakEat sur l’App Store');
  });
});
