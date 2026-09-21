import { verifierLienFlaix } from './lien-flaix';

describe('verifierLienFlaix', () => {
  it('accepte un rapport sur ops.flaixlabs.com', () => {
    const v = verifierLienFlaix('https://ops.flaixlabs.com/reports/events/8431');
    expect(v).toEqual({ valide: true, url: 'https://ops.flaixlabs.com/reports/events/8431' });
  });

  it('accepte le domaine nu et nettoie les espaces collés avec le lien', () => {
    expect(verifierLienFlaix('  https://flaixlabs.com/r/1  ')).toEqual({
      valide: true,
      url: 'https://flaixlabs.com/r/1',
    });
  });

  it('refuse un site qui IMITE Flaix', () => {
    // Le cas qui justifie tout le contrôle : un faux écran de connexion.
    for (const piege of [
      'https://flaixlabs.com.pirate.fr/login',
      'https://faux-flaixlabs.com/login',
      'https://ops-flaixlabs.com/login',
      'https://google.com/?q=flaixlabs.com',
    ]) {
      expect(verifierLienFlaix(piege).valide).toBe(false);
    }
  });

  it('refuse ce qui n’est pas https', () => {
    expect(verifierLienFlaix('http://ops.flaixlabs.com/r/1').valide).toBe(false);
    expect(verifierLienFlaix('javascript:alert(1)').valide).toBe(false);
  });

  it('refuse des identifiants glissés dans l’adresse', () => {
    expect(verifierLienFlaix('https://moi:secret@ops.flaixlabs.com/r/1').valide).toBe(false);
  });

  it('refuse le vide, le n’importe quoi et le trop long', () => {
    expect(verifierLienFlaix('   ').valide).toBe(false);
    expect(verifierLienFlaix('rapport du match').valide).toBe(false);
    expect(verifierLienFlaix(`https://ops.flaixlabs.com/${'a'.repeat(600)}`).valide).toBe(false);
  });
});
