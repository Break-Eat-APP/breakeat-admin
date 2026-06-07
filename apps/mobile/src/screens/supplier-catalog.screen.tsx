import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import {
  apiGetPublicProducts,
  formatPrice,
  type ProductGroup,
  type PublicProduct,
} from '@lib/api/mobile-api';
import { useCartStore } from '@store/cart.store';

type Props = NativeStackScreenProps<RootStackParamList, 'SupplierCatalog'>;

interface SectionData {
  title: string;
  data: PublicProduct[];
}

export function SupplierCatalogScreen({ route, navigation }: Props) {
  const { eventId, supplierId } = route.params;
  const { items, addItem, incrementItem, decrementItem, totalCents, totalItems } =
    useCartStore();

  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetPublicProducts(eventId, supplierId);
      setGroups(data.groups);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [eventId, supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const getItemQty = (productId: string) =>
    items.find((i) => i.productId === productId)?.quantity ?? 0;

  const sections: SectionData[] = groups.map((g) => ({
    title: g.category.name,
    data: g.products,
  }));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Chargement du catalogue…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryText}>Réessayer</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Catalogue</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const qty = getItemQty(item.id);
          return (
            <View style={styles.productCard}>
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{item.name}</Text>
                {item.description && (
                  <Text style={styles.productDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
                <Text style={styles.productPrice}>{formatPrice(item.price)}</Text>
              </View>

              {qty === 0 ? (
                <Pressable
                  style={styles.addBtn}
                  onPress={() =>
                    addItem({
                      productId: item.id,
                      productName: item.name,
                      unitPriceCents: item.price,
                    })
                  }
                >
                  <Text style={styles.addBtnText}>+</Text>
                </Pressable>
              ) : (
                <View style={styles.qtyControls}>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => decrementItem(item.id)}
                  >
                    <Text style={styles.qtyBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{qty}</Text>
                  <Pressable
                    style={styles.qtyBtn}
                    onPress={() => incrementItem(item.id)}
                  >
                    <Text style={styles.qtyBtnText}>+</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* Floating cart bar */}
      {totalItems() > 0 && (
        <Pressable
          style={styles.cartBar}
          onPress={() => navigation.navigate('Cart')}
        >
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{totalItems()}</Text>
          </View>
          <Text style={styles.cartBarText}>Voir mon panier</Text>
          <Text style={styles.cartBarTotal}>{formatPrice(totalCents())}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },

  centered: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: { color: '#9ca3af', fontSize: 14, marginTop: 12 },
  errorText: { color: '#f87171', fontSize: 14, textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '700' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#1e293b',
    gap: 12,
  },
  backBtn: { padding: 4 },
  backArrow: { color: '#94a3b8', fontSize: 20 },
  headerTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: '700' },

  list: { paddingBottom: 120 },

  sectionHeader: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  sectionTitle: { color: '#2563eb', fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },

  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    gap: 12,
  },
  productInfo: { flex: 1 },
  productName: { color: '#f1f5f9', fontSize: 15, fontWeight: '600' },
  productDesc: { color: '#94a3b8', fontSize: 13, marginTop: 2, lineHeight: 18 },
  productPrice: { color: '#2563eb', fontSize: 15, fontWeight: '700', marginTop: 4 },

  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 22, lineHeight: 26, fontWeight: '700' },

  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnText: { color: '#f1f5f9', fontSize: 18, fontWeight: '700', lineHeight: 22 },
  qtyValue: { color: '#f1f5f9', fontSize: 16, fontWeight: '700', minWidth: 24, textAlign: 'center' },

  cartBar: {
    position: 'absolute',
    bottom: 32,
    left: 20,
    right: 20,
    backgroundColor: '#2563eb',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cartBadge: {
    backgroundColor: '#ffffff',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadgeText: { color: '#2563eb', fontSize: 13, fontWeight: '800' },
  cartBarText: { flex: 1, color: '#ffffff', fontSize: 16, fontWeight: '700' },
  cartBarTotal: { color: '#bfdbfe', fontSize: 15, fontWeight: '600' },
});
