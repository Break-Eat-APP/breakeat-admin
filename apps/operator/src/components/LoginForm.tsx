'use client';

import { useState } from 'react';
import { BRAND, BreakEatLogo } from '@break-eat/brand';
import { login } from '@/lib/api/orders-client';

/**
 * Shared operator login form (refonte v2 — blanc / orange #FC4002).
 *
 * Single source for the operator login UI — used by both the home page
 * (event selector) and the per-event dashboard, so the two surfaces never
 * drift apart again. Stores the JWT under `operator_token`, then calls
 * onLogin(token) so the parent can swap to its authenticated view.
 */
export function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { accessToken } = await login(email, password);
      localStorage.setItem('operator_token', accessToken);
      onLogin(accessToken);
    } catch {
      setError('Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: BRAND.bg,
        fontFamily: BRAND.font,
        padding: 20,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          position: 'relative',
          background: '#fff',
          borderRadius: 20,
          padding: '44px 40px 30px',
          width: 380,
          maxWidth: '100%',
          border: `1px solid ${BRAND.border}`,
          boxShadow: BRAND.shadowSoft,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          overflow: 'hidden',
        }}
      >
        {/* Top accent bar (solid orange) */}
        <div aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, background: BRAND.orange }} />

        {/* Brand — official logo with wording */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <BreakEatLogo size={54} showWordmark />
          <div style={{ fontSize: 12, color: BRAND.grey, fontWeight: 500, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Portail opérateur
          </div>
        </div>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            border: `1.5px solid ${BRAND.border}`,
            fontSize: 14.5,
            color: BRAND.ink,
            background: '#fff',
            outline: 'none',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = BRAND.orange;
            e.target.style.boxShadow = '0 0 0 3px rgba(252, 64, 2, 0.13)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = BRAND.border;
            e.target.style.boxShadow = 'none';
          }}
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            border: `1.5px solid ${BRAND.border}`,
            fontSize: 14.5,
            color: BRAND.ink,
            background: '#fff',
            outline: 'none',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = BRAND.orange;
            e.target.style.boxShadow = '0 0 0 3px rgba(252, 64, 2, 0.13)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = BRAND.border;
            e.target.style.boxShadow = 'none';
          }}
        />
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? BRAND.orangeSoft : BRAND.orange,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '13px 0',
            fontWeight: 600,
            fontSize: 15,
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : BRAND.shadowButton,
            fontFamily: 'inherit',
            transition: 'background 0.15s',
            marginTop: 4,
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.background = BRAND.orangeDark;
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.background = BRAND.orange;
          }}
        >
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
