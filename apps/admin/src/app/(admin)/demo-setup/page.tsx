'use client';

import { useState } from 'react';
import {
  apiGetVenues,
  apiCreateVenue,
  apiUpdateVenue,
  apiCreateEvent,
  apiGetSuppliers,
  apiCreateSupplier,
  apiAttachSupplier,
  apiCreateCategory,
  apiCreateProduct,
  apiCreatePickupPoint,
  apiCreateSlot,
  apiUpdateEventStatus,
  getOrgId,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface StepResult {
  label: string;
  status: 'pending' | 'running' | 'ok' | 'error';
  detail?: string;
}

interface DemoResult {
  venueId: string;
  eventId: string;
  supplierId: string;
  qrLink: string;
  operatorUrl: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DemoSetupPage() {
  const [steps, setSteps] = useState<StepResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<DemoResult | null>(null);
  const [globalError, setGlobalError] = useState('');

  const orgId = getOrgId();

  function updateStep(index: number, patch: Partial<StepResult>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function runSetup() {
    if (!orgId) { setGlobalError('Aucune organisation sélectionnée.'); return; }

    const STEPS: StepResult[] = [
      { label: 'Lieu du club (réutilisé si existant)', status: 'pending' },
      { label: 'Création de l\'événement (Match Spartiates)', status: 'pending' },
      { label: 'Création du fournisseur (Buvette Nord)', status: 'pending' },
      { label: 'Attachement du fournisseur à l\'événement', status: 'pending' },
      { label: 'Création des catégories (Boissons, Snacks)', status: 'pending' },
      { label: 'Création des produits (Coca, Hot-Dog, Bière)', status: 'pending' },
      { label: 'Création des points de retrait', status: 'pending' },
      { label: 'Création des créneaux horaires', status: 'pending' },
      { label: 'Activation de l\'événement', status: 'pending' },
    ];
    setSteps(STEPS);
    setRunning(true);
    setDone(null);
    setGlobalError('');

    let venueId = '';
    let eventId = '';
    let supplierId = '';
    let catBoissonsId = '';
    let catSnacksId = '';

    try {
      // Step 0 — Venue
      updateStep(0, { status: 'running' });
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 7); // 1 semaine dans le futur
      startDate.setHours(19, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setHours(23, 0, 0, 0);

      // Un club = un lieu : on réutilise le lieu existant de l'org au lieu d'en
      // recréer un à chaque run (évite les doublons de « Patinoire des Spartiates »).
      const venueData = {
        name: 'Patinoire des Spartiates',
        address: '1 Avenue du Sport, 75012 Paris',
        timezone: 'Europe/Paris',
      };
      const existingVenues = await apiGetVenues(orgId);
      const venueList = Array.isArray(existingVenues) ? existingVenues : [];
      if (venueList.length > 0) {
        const v = await apiUpdateVenue(orgId, venueList[0].id, venueData);
        venueId = v.id;
        updateStep(0, { status: 'ok', detail: `réutilisé · ${v.id.slice(0, 8)}…` });
      } else {
        const v = await apiCreateVenue(orgId, venueData);
        venueId = v.id;
        updateStep(0, { status: 'ok', detail: `créé · ${v.id.slice(0, 8)}…` });
      }

      // Step 1 — Event
      updateStep(1, { status: 'running' });
      const event = await apiCreateEvent(orgId, {
        venueId,
        name: 'Match Spartiates Hockey',
        startAt: startDate.toISOString().slice(0, 16),
        endAt: endDate.toISOString().slice(0, 16),
      });
      eventId = event.id;
      updateStep(1, { status: 'ok', detail: `ID: ${event.id.slice(0, 8)}…` });

      // Step 2 — Supplier (réutilise « Buvette Nord » si elle existe déjà → pas de doublon)
      updateStep(2, { status: 'running' });
      const existingSups = await apiGetSuppliers(orgId);
      const reused = (Array.isArray(existingSups) ? existingSups : []).find(
        (s) => s.name === 'Buvette Nord',
      );
      let supplier;
      if (reused) {
        supplier = reused;
        updateStep(2, { status: 'ok', detail: `réutilisée · ${reused.id.slice(0, 8)}…` });
      } else {
        supplier = await apiCreateSupplier(orgId, {
          name: 'Buvette Nord',
          preparationZone: 'Zone A — Entrée nord',
        });
        updateStep(2, { status: 'ok', detail: `créée · ${supplier.id.slice(0, 8)}…` });
      }
      supplierId = supplier.id;

      // Step 3 — Attach
      updateStep(3, { status: 'running' });
      await apiAttachSupplier(orgId, eventId, supplierId);
      updateStep(3, { status: 'ok' });

      // Step 4 — Categories
      updateStep(4, { status: 'running' });
      const [catBoissons, catSnacks] = await Promise.all([
        apiCreateCategory(orgId, { name: 'Boissons', sortOrder: 1 }),
        apiCreateCategory(orgId, { name: 'Snacks', sortOrder: 2 }),
      ]);
      catBoissonsId = catBoissons.id;
      catSnacksId = catSnacks.id;
      updateStep(4, { status: 'ok' });

      // Step 5 — Products
      updateStep(5, { status: 'running' });
      await Promise.all([
        apiCreateProduct(orgId, supplierId, { name: 'Coca-Cola 33cl', price: 250, categoryId: catBoissonsId, description: 'Boisson gazeuse classique' }),
        apiCreateProduct(orgId, supplierId, { name: 'Bière Kronenbourg 33cl', price: 400, categoryId: catBoissonsId, description: 'Bière blonde' }),
        apiCreateProduct(orgId, supplierId, { name: 'Eau minérale 50cl', price: 200, categoryId: catBoissonsId }),
        apiCreateProduct(orgId, supplierId, { name: 'Hot-Dog', price: 500, categoryId: catSnacksId, description: 'Pain brioche + saucisse grillée' }),
        apiCreateProduct(orgId, supplierId, { name: 'Nachos + Sauce', price: 450, categoryId: catSnacksId }),
      ]);
      updateStep(5, { status: 'ok', detail: '5 produits créés' });

      // Step 6 — Pickup Points
      updateStep(6, { status: 'running' });
      await Promise.all([
        apiCreatePickupPoint(orgId, { name: 'Comptoir Nord', venueId, eventId, supplierId }),
        apiCreatePickupPoint(orgId, { name: 'Comptoir Est', venueId, eventId, supplierId }),
      ]);
      updateStep(6, { status: 'ok', detail: '2 points de retrait créés' });

      // Step 7 — Slots (3 créneaux de 20 min)
      updateStep(7, { status: 'running' });
      const slotStart = new Date(startDate);
      slotStart.setHours(20, 0, 0, 0);
      const slots = [
        { start: new Date(slotStart), label: '20:00 – 20:20' },
        { start: new Date(slotStart.getTime() + 20 * 60 * 1000), label: '20:20 – 20:40' },
        { start: new Date(slotStart.getTime() + 40 * 60 * 1000), label: '20:40 – 21:00' },
      ];
      await Promise.all(slots.map((s) =>
        apiCreateSlot(eventId, {
          startAt: s.start.toISOString(),
          endAt: new Date(s.start.getTime() + 20 * 60 * 1000).toISOString(),
          capacity: 30,
          label: s.label,
        })
      ));
      updateStep(7, { status: 'ok', detail: '3 créneaux créés' });

      // Step 8 — Activate
      updateStep(8, { status: 'running' });
      await apiUpdateEventStatus(orgId, eventId, 'ACTIVE');
      updateStep(8, { status: 'ok' });

      setDone({
        venueId,
        eventId,
        supplierId,
        qrLink: `breakeat://event/${eventId}`,
        operatorUrl: `http://localhost:3002/dashboard/${eventId}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      setGlobalError(msg);
      setSteps((prev) => prev.map((s) => s.status === 'running' ? { ...s, status: 'error', detail: msg } : s));
    } finally {
      setRunning(false);
    }
  }

  const STATUS_ICON: Record<string, string> = {
    pending: '⬜',
    running: '🔄',
    ok: '✅',
    error: '❌',
  };

  if (!orgId) return (
    <div style={{ padding: 32, color: '#dc2626', fontSize: 14, fontFamily: BRAND.font }}>
      Aucune organisation sélectionnée. Reconnectez-vous.
    </div>
  );

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Header */}
      <h1 style={{ fontSize: 26, fontWeight: 600, color: BRAND.ink, margin: '0 0 8px', letterSpacing: -0.3 }}>
        Démo — Spartiates Hockey
      </h1>
      <p style={{ color: BRAND.grey, fontSize: 14, marginBottom: 8 }}>
        Crée en un clic tout l&apos;environnement de démonstration complet : lieu, événement, fournisseur, produits, points de retrait et créneaux.
      </p>
      <div style={{ background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 24 }}>
        ⚠️ Chaque clic crée de nouvelles données. Ne pas exécuter plusieurs fois dans la même organisation sans nettoyer avant.
      </div>

      {!running && steps.length === 0 && (
        <button
          onClick={() => void runSetup()}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.orangeDark; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.orange; }}
          style={{
            background: BRAND.orange,
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            padding: '14px 32px',
            fontWeight: 700,
            fontSize: 16,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.15s ease',
            boxShadow: BRAND.shadowButton,
          }}
        >
          Créer la démo Spartiates Hockey
        </button>
      )}

      {/* Progress */}
      {steps.length > 0 && (
        <div style={{ background: BRAND.bg, borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(28,25,23,0.06)', border: `1px solid ${BRAND.border}`, marginBottom: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: BRAND.ink, marginBottom: 16 }}>Progression</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>{STATUS_ICON[s.status]}</span>
                <span style={{ fontSize: 14, color: s.status === 'error' ? '#dc2626' : s.status === 'ok' ? '#065f46' : BRAND.inkSoft, flex: 1 }}>
                  {s.label}
                </span>
                {s.detail && <span style={{ fontSize: 12, color: BRAND.grey }}>{s.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global error */}
      {globalError && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {globalError}
        </div>
      )}

      {/* Success result */}
      {done && (
        <div style={{ background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ fontWeight: 600, fontSize: 16, color: '#166534', marginBottom: 16 }}>
            ✅ Démo créée avec succès !
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <ResultItem label="ID Événement" value={done.eventId} copy />
            <ResultItem label="ID Fournisseur" value={done.supplierId} copy />
            <ResultItem label="Deep Link QR" value={done.qrLink} copy />
          </div>

          {/* QR Code */}
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 8 }}>QR Code — Scanner depuis le mobile</div>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(done.qrLink)}`}
                alt="QR Code Spartiates Hockey"
                width={200}
                height={200}
                style={{ borderRadius: 8, border: '2px solid #16a34a' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 8 }}>Prochaines étapes</div>
              <ol style={{ color: BRAND.inkSoft, fontSize: 14, paddingLeft: 20, lineHeight: 1.8 }}>
                <li>Scannez le QR code avec votre téléphone (app Break Eat)</li>
                <li>Choisissez Buvette Nord</li>
                <li>Ajoutez Coca-Cola et Hot-Dog au panier</li>
                <li>Sélectionnez le créneau 20:00–20:20</li>
                <li>Passez la commande (paiement fictif)</li>
                <li>Vérifiez l&apos;apparition sur le dashboard opérateur</li>
              </ol>
              <a
                href={done.operatorUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-block', marginTop: 12, background: BRAND.ink, color: '#fff', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}
              >
                📊 Ouvrir le dashboard opérateur →
              </a>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => void window.open(`/events/${done.eventId}`, '_blank')}
              onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.orangeDark; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.orange; }}
              style={{ background: BRAND.orange, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s ease' }}
            >
              🎪 Voir l&apos;événement dans l&apos;admin →
            </button>
            <button
              onClick={() => { setSteps([]); setDone(null); setGlobalError(''); }}
              style={{ background: BRAND.bgSubtle, color: BRAND.inkSoft, border: `1px solid ${BRAND.border}`, borderRadius: 8, padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Réinitialiser
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultItem({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <code style={{ background: BRAND.bg, padding: '5px 10px', borderRadius: 6, fontSize: 11, border: `1px solid ${BRAND.border}`, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </code>
        {copy && (
          <button
            onClick={() => void navigator.clipboard?.writeText(value)}
            style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 6, padding: '5px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            📋
          </button>
        )}
      </div>
    </div>
  );
}
