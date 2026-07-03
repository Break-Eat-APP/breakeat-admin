import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { useAuthStore } from '@store/auth.store';
import { useUserLocation } from '@lib/hooks/use-user-location';
import { PageHeader } from '@components/page-header';
import { BOTTOM_BAR_SPACE } from '@components/app-bottom-bar';
import { showAlert, confirmAction } from '@lib/alert';
import { THEME, shadowCard, FONT } from '@lib/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { user, token, clearAuth } = useAuthStore();
  const { status: locStatus, optedOut, request: requestLocation, disable: disableLocation } = useUserLocation();

  const handleLogout = () => {
    confirmAction(
      'Déconnexion',
      'Voulez-vous vraiment vous déconnecter ?',
      () => {
        void clearAuth();
        navigation.reset({ index: 0, routes: [{ name: 'Login', params: { defaultTab: 'login' } }] });
      },
      { confirmLabel: 'Se déconnecter', destructive: true },
    );
  };

  return (
    <View style={styles.root}>
      <PageHeader title="Profil" />
      <ScrollView contentContainerStyle={styles.content}>

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
        <MenuItem
          icon="storefront-outline"
          label="Nos lieux"
          onPress={() => navigation.navigate('Partners')}
        />
        <View style={styles.divider} />
        <LocationMenuItem
          locStatus={locStatus}
          optedOut={optedOut}
          onEnable={requestLocation}
          onDisable={disableLocation}
        />
        <View style={styles.divider} />
        <NotificationsMenuItem />
        <View style={styles.divider} />
        <MenuItem label="Aide & contact" onPress={() => showAlert('Bientôt', 'Disponible prochainement.')} />
        <View style={styles.divider} />
        <MenuItem label="Mentions légales" onPress={() => showAlert('Bientôt', 'Disponible prochainement.')} />
        <View style={styles.divider} />
        <MenuItem label="Confidentialité" onPress={() => showAlert('Bientôt', 'Disponible prochainement.')} />
      </View>

        {token && (
          <Pressable style={styles.logout} onPress={handleLogout}>
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function MenuItem({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
      onPress={onPress}
    >
      {icon ? (
        <View style={styles.menuRow}>
          <Ionicons name={icon} size={18} color={THEME.ink} style={styles.menuIcon} />
          <Text style={styles.menuLabel}>{label}</Text>
        </View>
      ) : (
        <Text style={styles.menuLabel}>{label}</Text>
      )}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

type NotifPerm = 'default' | 'granted' | 'denied' | 'unsupported';

function getNotifPerm(): NotifPerm {
  const N = (globalThis as { Notification?: { permission: string } }).Notification;
  if (!N) return 'unsupported';
  return (N.permission as NotifPerm) ?? 'default';
}

function NotificationsMenuItem() {
  const [perm, setPerm] = useState<NotifPerm>(() => getNotifPerm());
  const granted = perm === 'granted';

  const label =
    granted               ? 'Notifications activées' :
    perm === 'denied'     ? 'Notifications bloquées' :
    perm === 'unsupported' ? 'Notifications indisponibles' :
    'Activer les notifications';

  const handlePress = () => {
    if (granted) return;
    if (perm === 'unsupported') {
      showAlert('Notifications', 'Les notifications ne sont pas disponibles sur cet appareil.');
      return;
    }
    if (perm === 'denied') {
      showAlert(
        'Notifications bloquées',
        "Votre navigateur a bloqué les notifications.\n\nPour les réactiver : icône cadenas à gauche de la barre d'adresse → Notifications → Autoriser, puis rechargez la page.",
      );
      return;
    }
    const N = (globalThis as { Notification?: { requestPermission: () => Promise<string> } }).Notification;
    if (N?.requestPermission) {
      void N.requestPermission().then((p) => setPerm((p as NotifPerm) ?? 'default'));
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <View style={styles.menuRow}>
        <Ionicons
          name={granted ? 'notifications' : 'notifications-outline'}
          size={18}
          color={granted ? THEME.orange : THEME.ink}
          style={styles.menuIcon}
        />
        <Text style={[styles.menuLabel, granted && styles.menuLabelActive]}>{label}</Text>
      </View>
      {granted ? (
        <Ionicons name="checkmark-circle" size={18} color={THEME.orange} />
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
}

type LocStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

function LocationMenuItem({
  locStatus,
  optedOut,
  onEnable,
  onDisable,
}: {
  locStatus: LocStatus;
  optedOut: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  // « Active » = position obtenue ET non coupée par l'utilisateur.
  const active = locStatus === 'granted' && !optedOut;
  const label =
    active                     ? 'Localisation activée' :
    locStatus === 'requesting' ? 'Localisation en cours…' :
    locStatus === 'denied'     ? 'Localisation bloquée' :
    optedOut                   ? 'Localisation désactivée' :
    'Gestion de ma géolocalisation';

  const handlePress = () => {
    if (active) {
      // Bascule OFF (côté app).
      onDisable();
      return;
    }
    // OFF → ON : demande la position (affiche l'aide si le navigateur bloque).
    onEnable();
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <View style={styles.menuRow}>
        <Ionicons
          name={active ? 'location' : 'location-outline'}
          size={18}
          color={active ? THEME.orange : THEME.ink}
          style={styles.menuIcon}
        />
        <Text style={[styles.menuLabel, active && styles.menuLabelActive]}>{label}</Text>
      </View>
      {active ? (
        <View style={styles.toggleOn}>
          <Text style={styles.toggleOnText}>Désactiver</Text>
        </View>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  content: { padding: 16, paddingBottom: BOTTOM_BAR_SPACE + 24 },

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
  toggleOn: {
    backgroundColor: THEME.orangeTint,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: THEME.radius.pill,
  },
  toggleOnText: { color: THEME.orange, fontSize: 13, fontFamily: FONT.semibold },
  menuRow: { flexDirection: 'row', alignItems: 'center' },
  menuIcon: { marginRight: 10 },
  chevron: { color: THEME.grey, fontSize: 22 },
  divider: { height: 1, backgroundColor: THEME.border, marginLeft: 18 },

  logout: { alignItems: 'center', paddingVertical: 18, marginTop: 8 },
  logoutText: { color: THEME.orange, fontSize: 15, fontFamily: FONT.semibold },
});
