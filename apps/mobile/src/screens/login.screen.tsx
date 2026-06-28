import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { apiLogin, apiRegister } from '@lib/api/mobile-api';
import { useAuthStore } from '@store/auth.store';
import { THEME, shadowCard, FONT } from '@lib/theme';
import { BreakEatLogo } from '@components/break-eat-logo';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation, route }: Props) {
  const { setAuth } = useAuthStore();
  const pendingEventId = route.params?.pendingEventId;

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  /** Après succès / passage invité : reprendre le parcours (événement en attente ou retour). */
  const proceed = () => {
    if (pendingEventId) {
      navigation.replace('EventHome', { eventId: pendingEventId });
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('MainTabs');
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Champs requis', 'Email et mot de passe sont obligatoires.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Mot de passe trop court', 'Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (mode === 'register' && displayName.trim().length < 2) {
      Alert.alert('Champ requis', 'Indiquez un nom (au moins 2 caractères).');
      return;
    }
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await apiLogin(email.trim(), password)
          : await apiRegister(email.trim(), password, displayName.trim());
      await setAuth(res.accessToken, res.user);
      proceed();
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : 'Erreur inconnue';
      let msg = raw;
      try {
        const parsed = JSON.parse(raw) as { message?: string | string[] };
        const m = parsed.message;
        msg = Array.isArray(m) ? m[0] ?? raw : (m ?? raw);
      } catch { /* raw n'est pas du JSON */ }
      if (msg.includes('401') || msg.toLowerCase().includes('invalid credentials')) {
        msg = 'Email ou mot de passe incorrect.';
      } else if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('conflict')) {
        msg = 'Un compte existe déjà avec cet email.';
      }
      Alert.alert('Erreur', msg);
    } finally {
      setLoading(false);
    }
  };

  const social = (provider: string) =>
    Alert.alert('Bientôt', `Connexion avec ${provider} disponible prochainement.`);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* En-tête */}
        <View style={styles.header}>
          {navigation.canGoBack() && (
            <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
              <Text style={styles.backIcon}>‹</Text>
            </Pressable>
          )}
          <Text style={styles.title}>Bienvenue chez Break Eat</Text>
        </View>

        {/* Logo */}
        <View style={styles.logoWrap}>
          <BreakEatLogo size={64} variant="orange" />
        </View>

        {/* Bandeau fidélité */}
        <View style={[styles.banner, shadowCard]}>
          <Text style={styles.bannerTitle}>Chez nous, être fidèle ça régale vraiment.</Text>
          <Text style={styles.bannerSub}>Commandez, gagnez des récompenses.</Text>
        </View>

        {/* Onglets */}
        <View style={styles.tabs}>
          <Pressable
            onPress={() => setMode('register')}
            style={[styles.tab, mode === 'register' && styles.tabActive]}
          >
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>Inscription</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('login')}
            style={[styles.tab, mode === 'login' && styles.tabActive]}
          >
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Connexion</Text>
          </Pressable>
        </View>

        {/* Boutons sociaux (placeholders) */}
        <SocialButton label="Continuer avec Facebook" onPress={() => social('Facebook')} />
        <SocialButton label="Continuer avec Google" onPress={() => social('Google')} />
        <SocialButton label="Continuer avec Apple" onPress={() => social('Apple')} />

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>ou</Text>
          <View style={styles.orLine} />
        </View>

        {/* Champs */}
        {mode === 'register' && (
          <TextInput
            style={styles.input}
            placeholder="Nom ou pseudo*"
            placeholderTextColor={THEME.grey}
            value={displayName}
            onChangeText={setDisplayName}
            autoCapitalize="words"
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email*"
          placeholderTextColor={THEME.grey}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Mot de passe*"
            placeholderTextColor={THEME.grey}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
            <Text style={styles.eye}>{showPassword ? '🙈' : '👁'}</Text>
          </Pressable>
        </View>

        {mode === 'login' && (
          <Pressable
            onPress={() => Alert.alert('Bientôt', 'Réinitialisation du mot de passe à venir.')}
            style={styles.forgot}
          >
            <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.submit, loading && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>{mode === 'login' ? 'Se connecter' : "S'inscrire"}</Text>
          )}
        </Pressable>

        <Pressable onPress={proceed} style={styles.skip}>
          <Text style={styles.skipText}>Se connecter plus tard</Text>
        </Pressable>

        <Text style={styles.mentions}>* Mentions obligatoires</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SocialButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.social, pressed && styles.pressed]}
    >
      <Text style={styles.socialText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  scroll: { paddingHorizontal: 24, paddingTop: 56, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  back: { paddingRight: 8 },
  backIcon: { color: THEME.ink, fontSize: 30, lineHeight: 30, fontWeight: '700' },
  title: { flex: 1, color: THEME.ink, fontSize: 22, fontFamily: FONT.bold, textAlign: 'center' },

  logoWrap: { alignItems: 'center', marginBottom: 18 },

  banner: {
    backgroundColor: THEME.orange,
    borderRadius: THEME.radius.card,
    padding: 18,
    marginBottom: 24,
  },
  bannerTitle: { color: '#fff', fontSize: 17, fontFamily: FONT.bold, lineHeight: 23 },
  bannerSub: { color: '#fff', fontSize: 13, marginTop: 6, opacity: 0.92, fontFamily: FONT.regular },

  tabs: {
    flexDirection: 'row',
    backgroundColor: THEME.bgSubtle,
    borderRadius: THEME.radius.control,
    padding: 4,
    marginBottom: 24,
  },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: THEME.radius.control - 4 },
  tabActive: { backgroundColor: THEME.surface, ...shadowCard },
  tabText: { color: THEME.inkSoft, fontSize: 15, fontFamily: FONT.semibold },
  tabTextActive: { color: THEME.orange },

  social: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: THEME.radius.control,
    paddingVertical: 15,
    marginBottom: 12,
  },
  pressed: { opacity: 0.7 },
  socialText: { color: THEME.ink, fontSize: 15, fontFamily: FONT.semibold },

  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: THEME.border },
  orText: { color: THEME.inkSoft, fontSize: 14, fontFamily: FONT.medium },

  nameRow: { flexDirection: 'row', gap: 12 },
  input: {
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: THEME.radius.control,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 15,
    color: THEME.ink,
    marginBottom: 12,
    fontFamily: FONT.regular,
  },
  inputHalf: { flex: 1 },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: THEME.radius.control,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  passwordInput: { flex: 1, paddingVertical: 15, fontSize: 15, color: THEME.ink, fontFamily: FONT.regular },
  eye: { fontSize: 18, paddingLeft: 8 },

  forgot: { alignSelf: 'flex-end', paddingVertical: 8 },
  forgotText: { color: THEME.orange, fontSize: 13, fontFamily: FONT.semibold },

  submit: {
    backgroundColor: THEME.orange,
    borderRadius: THEME.radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontFamily: FONT.bold },

  skip: { alignItems: 'center', paddingVertical: 16 },
  skipText: { color: THEME.orange, fontSize: 15, fontFamily: FONT.semibold },

  mentions: { color: THEME.grey, fontSize: 12, textAlign: 'center', marginTop: 4, fontFamily: FONT.regular },
});
