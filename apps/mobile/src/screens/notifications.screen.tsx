import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { PageHeader } from '@components/page-header';
import { useBottomBarSpace } from '@components/app-bottom-bar';
import { apiNotifications, type NotificationCliente } from '@lib/api/mobile-api';
import { useNotifStore } from '@store/notif.store';
import { THEME, HEAD } from '@lib/theme';

/**
 * Ce que le club a annoncé.
 *
 * Un push est éphémère : balayé de l'écran, il n'existe plus. Cet écran est le
 * seul endroit où l'annonce survit — et la raison d'être du compteur sur la
 * cloche.
 *
 * L'ouverture marque tout comme lu. C'est le geste du client : il vient
 * regarder, pas accuser réception ligne par ligne. Marquer à la fermeture
 * laisserait la pastille allumée derrière lui.
 */
export function NotificationsScreen() {
  const espaceBas = useBottomBarSpace();
  const markRead = useNotifStore((e) => e.markRead);
  const [liste, setListe] = useState<NotificationCliente[]>([]);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    try {
      const { notifications } = await apiNotifications();
      setListe(notifications);
    } catch (e: unknown) {
      console.warn('Notifications indisponibles:', e);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
    // La pastille s'éteint à l'OUVERTURE, pas à la sortie : le client vient de
    // regarder, la laisser allumée derrière lui serait faux.
    markRead();
  }, [charger, markRead]);

  const quand = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <PageHeader title="Notifications" />

      {chargement ? (
        <View style={styles.centre}>
          <ActivityIndicator size="large" color={THEME.orange} />
        </View>
      ) : liste.length === 0 ? (
        <View style={styles.centre}>
          <Ionicons name="notifications-off-outline" size={40} color={THEME.grey} />
          <Text style={styles.vide}>Aucune notification pour le moment.</Text>
        </View>
      ) : (
        <FlatList
          data={liste}
          keyExtractor={(n) => n.id}
          contentContainerStyle={[styles.liste, { paddingBottom: espaceBas }]}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => void charger()} tintColor={THEME.orange} />
          }
          renderItem={({ item }) => (
            <View style={[styles.carte, !item.lue && styles.carteNonLue]}>
              <View style={styles.enTete}>
                {/* Le point ne marque QUE les non-lues : tout marquer reviendrait
                    à ne rien marquer. */}
                {!item.lue && <View style={styles.point} />}
                <Text style={styles.titre}>{item.title}</Text>
              </View>
              <Text style={styles.corps}>{item.body}</Text>
              <Text style={styles.date}>{quand(item.createdAt)}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  vide: { color: THEME.grey, fontSize: 14, textAlign: 'center', fontFamily: HEAD.medium },

  liste: { padding: 16, gap: 12 },
  carte: {
    backgroundColor: THEME.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 16,
    gap: 6,
  },
  carteNonLue: { borderColor: THEME.orangeSoft, backgroundColor: THEME.orangeTint },

  enTete: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  point: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  titre: { flex: 1, color: THEME.ink, fontSize: 15.5, fontFamily: HEAD.bold },
  corps: { color: THEME.inkSoft, fontSize: 14, lineHeight: 20 },
  date: { color: THEME.grey, fontSize: 12, fontFamily: HEAD.medium },
});
