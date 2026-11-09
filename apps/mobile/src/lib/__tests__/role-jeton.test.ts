import { estSuperAdmin, roleDuJeton } from '../role-jeton';

// Jest tourne sous Node, qui fournit `Buffer` ; les types de React Native ne le
// déclarent pas.
declare const Buffer: { from(texte: string): { toString(codage: 'base64'): string } };

/** Un jeton au format JWT (signature factice : elle n'est pas lue). */
function jeton(charge: Record<string, unknown>): string {
  const b64url = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(charge)}.signature`;
}

describe('roleDuJeton', () => {
  it('lit le rôle signé par le serveur', () => {
    expect(roleDuJeton(jeton({ sub: 'u1', globalRole: 'SUPER_ADMIN' }))).toBe('SUPER_ADMIN');
    expect(roleDuJeton(jeton({ sub: 'u1', globalRole: 'CUSTOMER' }))).toBe('CUSTOMER');
  });

  it('lit une charge dont le base64 contient - et _ (accents, caractères spéciaux)', () => {
    // « é » et « ÿ » produisent des octets qui donnent + et / en base64 standard.
    const t = jeton({ sub: 'u1', email: 'rémi+ÿ?>>@exemple.fr', globalRole: 'SUPER_ADMIN' });
    expect(t.split('.')[1]).toMatch(/[-_]/);
    expect(roleDuJeton(t)).toBe('SUPER_ADMIN');
  });

  it('rend null sans lever pour tout ce qui n’est pas un jeton lisible', () => {
    expect(roleDuJeton(null)).toBeNull();
    expect(roleDuJeton('')).toBeNull();
    expect(roleDuJeton('pas-un-jeton')).toBeNull();
    expect(roleDuJeton('a.%%%.c')).toBeNull();
    expect(roleDuJeton(jeton({ sub: 'u1' }))).toBeNull();
    expect(roleDuJeton(jeton({ globalRole: 42 }))).toBeNull();
  });
});

describe('estSuperAdmin', () => {
  it('ne répond oui qu’au super admin', () => {
    expect(estSuperAdmin(jeton({ globalRole: 'SUPER_ADMIN' }))).toBe(true);
    expect(estSuperAdmin(jeton({ globalRole: 'ORG_ADMIN' }))).toBe(false);
    expect(estSuperAdmin(undefined)).toBe(false);
  });
});
