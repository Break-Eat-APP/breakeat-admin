import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { useAuthStore } from '@store/auth.store';
import { useUserLocation } from '@lib/hooks/use-user-location';
import { THEME, shadowCard, FONT } from '@lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { user, token, clearAuth } = useAuthStore();
  const { status: locStatus, request: requestLocation } = useUserLocation();

  const handleLogout = () => {
    Alert.alert('Déconnexion', 'Voulez-vous vraiment vous déconnecter ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Se déconnecter',
        style: 'destructive',
        onPress: () => {
          void clearAuth();
          navigation.reset({ index: 0, routes: [{ name: 'Login', params: { defaultTab: 'login' } }] });
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.screenTitle}>Profil</Text>

      {token && user ? (
        <View style={[styles.card, shadowCard]}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user.displayName?.charAt(0) || user.email.charAt(0)).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.name}>{user.displayName}</Text>
          <Text style={styles.email}>{user.email}</Text>
        </View>
      ) : (
        <View style={[styles.card, shadowCard]}>
          <Text style={styles.guestTitle}>Vous n'êtes pas connecté</Text>
          <Text style={styles.guestSub}>
            Connectez-vous pour retrouver vos commandes et aller plus vite au paiement.
          </Text>
          <Pressable style={styles.cta} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.ctaText}>Se connecter / S'inscrire</Text>
          </Pressable>
        </View>
      )}

      {/* Liens secondaires */}
      <View style={[styles.menu, shadowCard]}>
        <LocationMenuItem locStatus={locStatus} onPress={requestLocation} />
        <View style={styles.divider} />
        <MenuItem label="Aide & contact" onPress={() => Alert.alert('Bientôt', 'Disponible prochainement.')} />
        <View style={styles.divider} />
        <MenuItem label="Mentions légales" onPress={() => Alert.alert('Bientôt', 'Disponible prochainement.')} />
        <View style={styles.divider} />
        <MenuItem label="Confidentialité" onPress={() => Alert.alert('Bientôt', 'Disponible prochainement.')} />
      </View>

        {token && (
          <Pressable style={styles.logout} onPress={handleLogout}>
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

type LocStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

function LocationMenuItem({ locStatus, onPress }: { locStatus: LocStatus; onPress: () => void }) {
  const granted = locStatus === 'granted';
  const label =
    locStatus === 'granted'    ? 'Localisation activée' :
    locStatus === 'denied'     ? 'Localisation refusée' :
    locStatus === 'requesting' ? 'Localisation en cours…' :
    'Activer ma localisation';

  const handlePress = () => {
    if (locStatus === 'denied') {
      Alert.alert(
        'Localisation bloquée',
        'Votre navigateur a refusé l\'accès à la localisation.\n\nPour l\'activer : cliquez sur l\'icône de localisation dans la barre d\'adresse de votre navigateur et sélectionnez « Autoriser ».',
        [{ text: 'OK' }],
      );
      return;
    }
    if (!granted) onPress();
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <View style={styles.menuRow}>
        <Ionicons
          name={granted ? 'location' : 'location-outline'}
          size={18}
          color={granted ? THEME.orange : THEME.ink}
          style={styles.menuIcon}
        />
        <Text style={[styles.menuLabel, granted && styles.menuLabelActive]}>{label}</Text>
      </View>
      {!granted && <Text style={styles.chevron}>›</Text>}
      {granted && <Ionicons name="checkmark-circle" size={18} color={THEME.orange} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { padding: 16, paddingBottom: 40 },
  screenTitle: {
    color: THEME.ink,
    fontSize: 22,
    fontFamily: FONT.bold,
    textAlign: 'center',
    paddingTop: 0,
    paddingBottom: 16,
  },

  card: {
    backgroundColor: THEME.surface,
    borderRadius: THEME.radius.card,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: THEME.orange,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#fff', fontSize: 30, fontFamily: FONT.bold },
  name: { color: THEME.ink, fontSize: 18, fontFamily: FONT.bold },
  email: { color: THEME.inkSoft, fontSize: 14, marginTop: 2 },

  guestTitle: { color: THEME.ink, fontSize: 16, fontFamily: FONT.bold, marginBottom: 6 },
  guestSub: { color: THEME.inkSoft, fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 16 },
  cta: {
    backgroundColor: THEME.orange,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: THEME.radius.control,
  },
  ctaText: { color: '#fff', fontFamily: FONT.bold, fontSize: 15 },

  menu: { backgroundColor: THEME.surface, borderRadius: THEME.radius.card, overflow: 'hidden' },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  pressed: { opacity: 0.6 },
  menuLabel: { color: THEME.ink, fontSize: 15 },
  menuLabelActive: { color: THEME.orange },
  menuRow: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: { marginRight: 10 },
  chevron: { color: THEME.grey, fontSize: 22 },
  divider: { height: 1, backgroundColor: THEME.border, marginLeft: 18 },

  logout: { alignItems: 'center', paddingVertical: 18, marginTop: 8 },
  logoutText: { color: THEME.orange, fontSize: 15, fontFamily: FONT.semibold },
});
