'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  apiGetSuppliers,
  apiGetCategories,
  apiCreateCategory,
  apiGetProducts,
  apiCreateProduct,
  apiDeleteProduct,
  type Supplier,
  type Category,
  type Product,
  getOrgId,
} from '@/lib/api/admin-client';
import { BRAND } from '@/lib/brand';

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ title, children, action }: {
  title: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div style={{ background: BRAND.bg, borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(28,25,23,0.06)', border: `1px solid ${BRAND.border}`, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: BRAND.ink, margin: 0 }}>{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupplierDetailPage() {
  const params = useParams();
  const supplierId = params.id as string;
  const orgId = getOrgId();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Category form
  const [newCatName, setNewCatName] = useState('');
  const [creatingCat, setCreatingCat] = useState(false);
  const [catError, setCatError] = useState('');

  // Product form
  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '', price: '', categoryId: '', description: '',
  });
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [productError, setProductError] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError('');
    try {
      const [sups, cats, prods] = await Promise.all([
        apiGetSuppliers(orgId),
        apiGetCategories(orgId),
        apiGetProducts(orgId, supplierId),
      ]);
      const found = (Array.isArray(sups) ? sups : []).find((s) => s.id === supplierId);
      setSupplier(found ?? null);
      setCategories(Array.isArray(cats) ? cats : []);
      setProducts(Array.isArray(prods) ? prods : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [orgId, supplierId]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setCreatingCat(true);
    setCatError('');
    try {
      const cat = await apiCreateCategory(orgId, { name: newCatName.trim() });
      setCategories((prev) => [...prev, cat]);
      setNewCatName('');
    } catch (err) {
      setCatError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreatingCat(false);
    }
  }

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    setCreatingProduct(true);
    setProductError('');
    try {
      const priceCents = Math.round(parseFloat(productForm.price.replace(',', '.')) * 100);
      if (isNaN(priceCents)) throw new Error('Prix invalide');
      await apiCreateProduct(orgId, supplierId, {
        name: productForm.name.trim(),
        price: priceCents,
        categoryId: productForm.categoryId,
        description: productForm.description.trim() || undefined,
      });
      setShowProductForm(false);
      setProductForm({ name: '', price: '', categoryId: '', description: '' });
      await load();
    } catch (err) {
      setProductError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setCreatingProduct(false);
    }
  }

  async function handleDeleteProduct(productId: string) {
    if (!confirm('Supprimer ce produit ?')) return;
    try {
      await apiDeleteProduct(orgId, supplierId, productId);
      setProducts((prev) => prev.filter((p) => p.id !== productId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  }

  function formatPrice(cents: number) {
    return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
  }

  if (!orgId) return <div style={{ padding: 32, color: '#dc2626', fontSize: 14, fontFamily: BRAND.font }}>Aucune organisation.</div>;
  if (loading) return <div style={{ padding: 32, color: BRAND.grey, fontSize: 14, fontFamily: BRAND.font }}>Chargement…</div>;
  if (error) return <div style={{ padding: 32, color: '#dc2626', fontSize: 14, background: '#fee2e2', borderRadius: 8, margin: 32, fontFamily: BRAND.font }}>{error}</div>;
  if (!supplier) return <div style={{ padding: 32, color: '#dc2626', fontSize: 14, fontFamily: BRAND.font }}>Fournisseur introuvable.</div>;

  const catById = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const productsByCat = categories.map((cat) => ({
    cat,
    items: products.filter((p) => p.categoryId === cat.id),
  }));
  const uncategorised = products.filter((p) => !categories.find((c) => c.id === p.categoryId));

  return (
    <div style={{ padding: 32, fontFamily: BRAND.font }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <a href="/events" style={{ color: BRAND.grey, fontSize: 13, textDecoration: 'none' }}>← Événements</a>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: BRAND.ink, margin: 0 }}>
          🏪 {supplier.name}
        </h1>
        <div style={{ fontSize: 13, color: BRAND.grey, marginTop: 4 }}>
          {supplier.preparationZone && <span>Zone : {supplier.preparationZone} · </span>}
          <code style={{ background: BRAND.bgSubtle, padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{supplier.id}</code>
        </div>
      </div>

      {/* Categories */}
      <Card title={`Catégories (${categories.length})`}>
        <form onSubmit={handleCreateCategory} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Nom de la catégorie (ex: Boissons)"
            required
            style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, fontFamily: 'inherit' }}
          />
          <button
            type="submit"
            disabled={creatingCat || !newCatName.trim()}
            style={{ background: creatingCat ? BRAND.grey : BRAND.orange, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {creatingCat ? '…' : '+ Ajouter'}
          </button>
        </form>
        {catError && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{catError}</div>}
        {categories.length === 0 ? (
          <p style={{ color: BRAND.grey, fontSize: 14, margin: 0 }}>Aucune catégorie. Créez-en une pour pouvoir ajouter des produits.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {categories.map((c) => (
              <span
                key={c.id}
                style={{ background: BRAND.orangeTint, color: BRAND.orange, borderRadius: 999, padding: '4px 12px', fontSize: 13, fontWeight: 600 }}
              >
                {c.name}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Products */}
      <Card
        title={`Produits (${products.length})`}
        action={
          categories.length > 0 ? (
            <button
              onClick={() => setShowProductForm((v) => !v)}
              style={{ background: BRAND.bgSubtle, border: `1px solid ${BRAND.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: BRAND.inkSoft, fontFamily: 'inherit' }}
            >
              {showProductForm ? '✕ Annuler' : '+ Nouveau produit'}
            </button>
          ) : undefined
        }
      >
        {/* Product create form */}
        {showProductForm && (
          <form
            onSubmit={handleCreateProduct}
            style={{ background: BRAND.bgSubtle, borderRadius: 8, padding: 16, marginBottom: 16, border: `1px solid ${BRAND.border}` }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>Nom du produit *</label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Coca-Cola 33cl"
                  required
                  style={inp}
                />
              </div>
              <div>
                <label style={lbl}>Prix (€) *</label>
                <input
                  type="text"
                  value={productForm.price}
                  onChange={(e) => setProductForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="2,50"
                  required
                  style={inp}
                />
              </div>
              <div>
                <label style={lbl}>Catégorie *</label>
                <select
                  value={productForm.categoryId}
                  onChange={(e) => setProductForm((f) => ({ ...f, categoryId: e.target.value }))}
                  required
                  style={{ ...inp, background: BRAND.bg }}
                >
                  <option value="">Sélectionner…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Description</label>
                <input
                  type="text"
                  value={productForm.description}
                  onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="(optionnel)"
                  style={inp}
                />
              </div>
            </div>
            {productError && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 8 }}>{productError}</div>}
            <button
              type="submit"
              disabled={creatingProduct}
              style={{ marginTop: 12, background: creatingProduct ? BRAND.grey : BRAND.orange, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {creatingProduct ? 'Création…' : 'Créer le produit'}
            </button>
          </form>
        )}

        {categories.length === 0 && (
          <p style={{ color: '#f59e0b', fontSize: 14, margin: 0 }}>⚠️ Créez d&apos;abord une catégorie avant d&apos;ajouter des produits.</p>
        )}

        {/* Products by category */}
        {productsByCat.map(({ cat, items }) => (
          items.length === 0 ? null : (
            <div key={cat.id} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.orange, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                {cat.name}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map((p) => (
                  <div
                    key={p.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: BRAND.bgSubtle, borderRadius: 8, border: `1px solid ${BRAND.border}` }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: BRAND.ink }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: 12, color: BRAND.grey }}>{p.description}</div>}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#059669' }}>{formatPrice(p.price)}</div>
                    <button
                      onClick={() => void handleDeleteProduct(p.id)}
                      style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                      Suppr.
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        ))}

        {uncategorised.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.grey, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Sans catégorie</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {uncategorised.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: BRAND.bgSubtle, borderRadius: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#059669' }}>{formatPrice(p.price)}</div>
                  <button onClick={() => void handleDeleteProduct(p.id)} style={{ background: 'none', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Suppr.</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {products.length === 0 && categories.length > 0 && (
          <p style={{ color: BRAND.grey, fontSize: 14, margin: 0 }}>Aucun produit. Cliquez &quot;+ Nouveau produit&quot;.</p>
        )}

        {/* Quick product summary for use in admin */}
        {products.length > 0 && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0fdf4', borderRadius: 6, fontSize: 13, color: '#166534' }}>
            ✓ {products.length} produit{products.length > 1 ? 's' : ''} — Catégories utilisées : {[...new Set(products.map((p) => catById[p.categoryId] ?? '?'))].join(', ')}
          </div>
        )}
      </Card>
    </div>
  );
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: BRAND.inkSoft, marginBottom: 4 };
const inp: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${BRAND.border}`, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
