'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  apiLogin,
  apiMeWithMemberships,
  getToken,
  clearSession,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';
import { BreakEatLogo } from '@/components/brand/BreakEatLogo';

// ─── Brand tokens (Phase 11 refonte v2 — sourced from @/lib/brand) ───
const ORANGE = BRAND.orange;
const ORANGE_DARK = BRAND.orangeDark;
const ORANGE_SOFT = BRAND.orangeSoft;
const INK = BRAND.ink;
const GREY = BRAND.grey;
const BORDER = BRAND.border;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already authenticated? Go to dashboard
  useEffect(() => {
    if (getToken()) router.replace('/dashboard');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // 1 — Authenticate
      const { user, accessToken } = await apiLogin(email.trim(), password);
      localStorage.setItem('admin_token', accessToken);
      localStorage.setItem('admin_user', JSON.stringify(user));

      // 2 — Load memberships to determine which org to work with
      const me = await apiMeWithMemberships();
      const firstMembership = me.memberships[0];

      if (!firstMembership) {
        // SUPER_ADMIN with no org, or user without membership
        if (me.globalRole === 'SUPER_ADMIN') {
          // SUPER_ADMIN can access the panel without an org
          localStorage.removeItem('admin_org_id');
          localStorage.removeItem('admin_org_name');
        } else {
          clearSession();
          setError("Votre compte n'est membre d'aucune organisation. Contactez un administrateur.");
          setLoading(false);
          return;
        }
      } else {
        localStorage.setItem('admin_org_id', firstMembership.organizationId);
        localStorage.setItem('admin_org_name', firstMembership.organization.name);
      }

      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
      localStorage.removeItem('admin_token');
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
        position: 'relative',
        padding: 20,
      }}
    >
      {/* Neutral white background — no decorative shapes (refonte v2) */}

      <form
        onSubmit={handleSubmit}
        style={{
          position: 'relative',
          zIndex: 1,
          background: '#fff',
          borderRadius: 20,
          padding: '44px 40px 30px',
          width: 420,
          maxWidth: '100%',
          border: `1px solid ${BORDER}`,
          boxShadow: BRAND.shadowSoft,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          overflow: 'hidden',
        }}
      >
        {/* Top accent bar (solid orange) */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 5,
            background: ORANGE,
          }}
        />

        {/* Brand — the B + éclair logo (single source: BreakEatLogo) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            marginBottom: 6,
          }}
        >
          <BreakEatLogo size={60} showWordmark />
          <div
            style={{
              fontSize: 12,
              color: GREY,
              fontWeight: 500,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            Panneau d&apos;administration
          </div>
        </div>

        {/* Email */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#44403c' }}>Adresse email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@votre-organisation.com"
            required
            autoComplete="email"
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${BORDER}`,
              fontSize: 14.5,
              color: INK,
              background: '#fff',
              outline: 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = ORANGE;
              e.target.style.boxShadow = '0 0 0 3px rgba(252, 64, 2, 0.13)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = BORDER;
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Password */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#44403c' }}>Mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              border: `1.5px solid ${BORDER}`,
              fontSize: 14.5,
              color: INK,
              background: '#fff',
              outline: 'none',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = ORANGE;
              e.target.style.boxShadow = '0 0 0 3px rgba(252, 64, 2, 0.13)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = BORDER;
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: 10,
              padding: '10px 14px',
              color: '#dc2626',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? ORANGE_SOFT : ORANGE,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            padding: '14px 0',
            fontWeight: 600,
            fontSize: 15.5,
            cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: loading ? 'none' : BRAND.shadowButton,
            transition: 'background 0.15s',
            marginTop: 4,
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.background = ORANGE_DARK;
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.background = ORANGE;
          }}
        >
          {loading ? 'Connexion en cours…' : 'Se connecter'}
        </button>

        {/* Footer hint */}
        <div
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: GREY,
            marginTop: 2,
          }}
        >
          Accès sécurisé · réservé aux administrateurs
        </div>
      </form>
    </main>
  );
}
