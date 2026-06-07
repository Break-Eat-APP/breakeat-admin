import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { formatPrice } from '@lib/api/mobile-api';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderConfirmation'>;

export function OrderConfirmationScreen({ route, navigation }: Props) {
  const { orderId, publicOrderNumber, totalCents } = route.params;

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, fadeAnim]);

  return (
    <View style={styles.root}>
      {/* Success icon */}
      <Animated.View style={[styles.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
        <Text style={styles.icon}>✓</Text>
      </Animated.View>

      {/* Texts */}
      <Animated.View style={[styles.textBlock, { opacity: fadeAnim }]}>
        <Text style={styles.title}>Commande confirmée !</Text>
        <Text style={styles.subtitle}>Votre commande a été passée avec succès.</Text>

        <View style={styles.orderCard}>
          <View style={styles.orderRow}>
            <Text style={styles.orderLabel}>N° de commande</Text>
            <Text style={styles.orderNumber}>{publicOrderNumber}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.orderRow}>
            <Text style={styles.orderLabel}>Montant</Text>
            <Text style={styles.orderAmount}>{formatPrice(totalCents)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.orderRow}>
            <Text style={styles.orderLabel}>Statut</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>PAYÉ</Text>
            </View>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>
            Rendez-vous au stand à l'heure de votre créneau. Votre commande sera préparée !
          </Text>
        </View>
      </Animated.View>

      {/* Actions */}
      <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => navigation.navigate('OrderTracking', { orderId })}
        >
          <Text style={styles.primaryBtnText}>Suivre ma commande →</Text>
        </Pressable>

        <Pressable
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('QRScanner')}
        >
          <Text style={styles.secondaryBtnText}>Scanner un autre événement</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 24,
  },

  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  icon: { color: '#fff', fontSize: 48, fontWeight: '900', lineHeight: 54 },

  textBlock: { width: '100%', alignItems: 'center', gap: 12 },
  title: { color: '#f1f5f9', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#94a3b8', fontSize: 15, textAlign: 'center' },

  orderCard: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 8,
  },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderLabel: { color: '#94a3b8', fontSize: 13 },
  orderNumber: { color: '#f1f5f9', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  orderAmount: { color: '#2563eb', fontSize: 18, fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#334155' },
  statusBadge: {
    backgroundColor: '#166534',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: { color: '#86efac', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  infoBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    width: '100%',
  },
  infoIcon: { fontSize: 16 },
  infoText: { color: '#94a3b8', fontSize: 13, flex: 1, lineHeight: 18 },

  actions: { width: '100%', gap: 12 },
  primaryBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#6b7280', fontSize: 14 },
});
