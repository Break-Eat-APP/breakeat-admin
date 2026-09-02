import React, { useEffect, useRef, useState } from 'react';
import { THEME } from '@lib/theme';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { formatPrice } from '@lib/api/mobile-api';
import {
  initLiveActivityTokenSync,
  startOrderTracking,
} from '@lib/live-activity-tracking';
import { BuvettePlanViewer } from '@components/buvette-plan-viewer';

type Props = NativeStackScreenProps<RootStackParamList, 'OrderConfirmation'>;

export function OrderConfirmationScreen({ route, navigation }: Props) {
  const { orderId, publicOrderNumber, totalCents, buvettePlanUrl } = route.params;
  const [planOpen, setPlanOpen] = useState(false);

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // PHASE 21 — démarre le suivi sur écran verrouillé dès la confirmation.
  // L'écoute des tokens est installée AVANT le démarrage : iOS peut émettre le
  // premier token immédiatement, et il ne doit pas se perdre.
  useEffect(() => {
    initLiveActivityTokenSync();
    void startOrderTracking({ orderId, orderNumber: publicOrderNumber });
  }, [orderId, publicOrderNumber]);

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
        <Ionicons name="checkmark" size={44} color="#fff" />
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
          <Ionicons name="information-circle-outline" size={16} color={THEME.inkSoft} />
          <Text style={styles.infoText}>
            Rendez-vous au stand à l'heure de votre créneau. Votre commande sera préparée !
          </Text>
        </View>
      </Animated.View>

      {/* Actions */}
      <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
        {buvettePlanUrl ? (
          <Pressable style={styles.planBtn} onPress={() => setPlanOpen(true)}>
            <Ionicons name="map" size={18} color="#fff" />
            <Text style={styles.planBtnText}>Voir le plan des buvettes</Text>
          </Pressable>
        ) : null}

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

      <BuvettePlanViewer
        visible={planOpen}
        url={buvettePlanUrl}
        onClose={() => setPlanOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: THEME.bg,
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

  textBlock: { width: '100%', alignItems: 'center', gap: 12 },
  title: { color: THEME.ink, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: THEME.inkSoft, fontSize: 15, textAlign: 'center' },

  orderCard: {
    width: '100%',
    backgroundColor: THEME.surface,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: THEME.bgSubtle,
    marginTop: 8,
  },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderLabel: { color: THEME.inkSoft, fontSize: 13 },
  orderNumber: { color: THEME.ink, fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  orderAmount: { color: THEME.orange, fontSize: 18, fontWeight: '800' },
  divider: { height: 1, backgroundColor: THEME.bgSubtle },
  statusBadge: {
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: { color: '#86efac', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },

  infoBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: THEME.bg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: THEME.bgSubtle,
    width: '100%',
  },
  infoText: { color: THEME.inkSoft, fontSize: 13, flex: 1, lineHeight: 18 },

  actions: { width: '100%', gap: 12 },
  planBtn: {
    backgroundColor: '#FC4002',
    paddingVertical: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  planBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  primaryBtn: {
    backgroundColor: THEME.orange,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: THEME.grey, fontSize: 14 },
});
