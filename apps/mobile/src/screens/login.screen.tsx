import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { apiLogin, apiRegister } from '@lib/api/mobile-api';

import { useAuthStore } from '@store/auth.store';
import { showAlert } from '@lib/alert';
import { useUserLocation } from '@lib/hooks/use-user-location';
import { THEME, shadowCard, HEAD } from '@lib/theme';
import { BreakEatLogo } from '@components/break-eat-logo';

/** Les conditions generales, hebergees sur le site vitrine. */
const URL_CGU = 'https://breakeat.fr/conditions-generales';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

/**
 * Connexion par Apple / Google / Facebook.
 *
 * Les boutons existaient mais n'étaient branchés sur rien : ils affichaient
 * « bientôt disponible » — et sur le web, rien du tout. Trois boutons bien
 * visibles qui ne mènent nulle part font croire à une application cassée,
 * surtout devant de vrais utilisateurs.
 *
 * Ils restent écrits et prêts : passer cette constante à `true` les rétablit
 * le jour où les fournisseurs seront branchés.
 */
const SOCIAL_LOGIN_READY = false;

export function LoginScreen({ navigation, route }: Props) {
  const { setAuth } = useAuthStore();
  const { request: requestLocation } = useUserLocation();
  const pendingEventId = route.params?.pendingEventId;

  const [mode, setMode] = useState<'login' | 'register'>(
    route.params?.defaultTab ?? 'register',
  );
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
      navigation.replace('Lieux');
    }
  };

  /**
   * Acceptation des conditions — decochee par defaut, et jamais deduite.
   *
   * Un consentement pre-coche ne vaut rien : c'est precisement ce qu'exige le
   * RGPD (un acte positif) et ce que verifie Apple a la revue. La case ne
   * s'affiche qu'a l'INSCRIPTION : la redemander a chaque connexion en ferait
   * une formalite qu'on coche sans lire.
   */
  const [cguAcceptees, setCguAcceptees] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert('Champs requis', 'Email et mot de passe sont obligatoires.');
      return;
    }
    if (password.length < 8) {
      showAlert('Mot de passe trop court', 'Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (mode === 'register' && displayName.trim().length < 2) {
      showAlert('Champ requis', 'Indiquez un nom (au moins 2 caractères).');
      return;
    }
    // L'acceptation des conditions ne se déduit PAS d'un clic sur « S'inscrire ».
    //
    // Une case décochée par défaut, et un refus explicite : c'est ce qui rend
    // le consentement démontrable. Pré-cocher, ou considérer que l'inscription
    // vaut acceptation, priverait la trace de toute valeur le jour où elle
    // servirait.
    if (mode === 'register' && !cguAcceptees) {
      showAlert(
        'Conditions à accepter',
        'Cochez la case pour confirmer que vous acceptez les conditions générales d’utilisation.',
      );
      return;
    }
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await apiLogin(email.trim(), password)
          : await apiRegister(email.trim(), password, displayName.trim());
      await setAuth(res.accessToken, res.user, res.refreshToken);
      if (mode === 'register') {
        // Confort, pas prérequis : localisation et notifications sont demandées
        // APRÈS que le compte existe. Isolées dans leur propre try, car un
        // navigateur qui refuse ces API ferait basculer une inscription
        // RÉUSSIE dans le catch — l'utilisateur verrait « Erreur » alors que
        // son compte vient d'être créé, puis « ce compte existe déjà » en
        // réessayant. Impossible à comprendre de l'extérieur.
        try {
          requestLocation();
          const NotifAPI = (globalThis as { Notification?: { permission: string; requestPermission: () => Promise<string> } }).Notification;
          if (NotifAPI && NotifAPI.permission === 'default') {
            void NotifAPI.requestPermission();
          }
        } catch (err) {
          console.warn('Permissions post-inscription ignorées:', err);
        }
      }
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
      showAlert('Erreur', msg);
    } finally {
      setLoading(false);
    }
  };

  const social = (provider: string) =>
    // `Alert.alert` ne fait RIEN sur le web : le bouton semblait cassé plutôt
    // qu'indisponible. Le helper couvre les deux plateformes.
    showAlert('Bientôt', `Connexion avec ${provider} disponible prochainement.`);

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
          <Text style={styles.bannerTitle}>Profitez de l'événement, on s'occupe de la file d'attente.</Text>
          <Text style={styles.bannerSub}>Déstresse, commande &amp; déguste.</Text>
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

        {SOCIAL_LOGIN_READY && (
          <>
            <SocialButton
              icon="logo-apple"
              iconColor={THEME.ink}
              label="Continuer avec Apple"
              onPress={() => social('Apple')}
            />
            <SocialButton
              icon="logo-google"
              iconColor="#EA4335"
              label="Continuer avec Google"
              onPress={() => social('Google')}
            />
            <SocialButton
              icon="logo-facebook"
              iconColor="#1877F2"
              label="Continuer avec Facebook"
              onPress={() => social('Facebook')}
            />

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>ou</Text>
              <View style={styles.orLine} />
            </View>
          </>
        )}

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
            {/* Un singe qui se cache les yeux pour masquer un mot de passe :
                l'icone standard dit la meme chose sans faire farce. */}
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={THEME.grey}
            />
          </Pressable>
        </View>

        {mode === 'login' && (
          <Pressable
            onPress={() => showAlert('Bientôt', 'Réinitialisation du mot de passe à venir.')}
            style={styles.forgot}
          >
            <Text style={styles.forgotText}>Mot de passe oublié ?</Text>
          </Pressable>
        )}

        {/* Les conditions générales — à l'inscription seulement.
            Les redemander à chaque connexion transformerait un consentement en
            formalité qu'on coche sans lire. */}
        {mode === 'register' && (
          <Pressable
            style={styles.cguRow}
            onPress={() => setCguAcceptees((v) => !v)}
            hitSlop={6}
          >
            <View style={[styles.cguCase, cguAcceptees && styles.cguCaseCochee]}>
              {cguAcceptees ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
            </View>
            <Text style={styles.cguTexte}>
              J’ai pris connaissance et j’accepte les{' '}
              <Text
                style={styles.cguLien}
                onPress={() => void Linking.openURL(URL_CGU)}
              >
                conditions générales d’utilisation
              </Text>
              .
            </Text>
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

function SocialButton({
  icon,
  iconColor,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.social, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={20} color={iconColor} style={styles.socialIcon} />
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
  title: { flex: 1, color: THEME.ink, fontSize: 22, fontFamily: HEAD.bold, textAlign: 'center' },

  logoWrap: { alignItems: 'center', marginBottom: 18 },

  banner: {
    backgroundColor: THEME.orange,
    borderRadius: THEME.radius.card,
    padding: 18,
    marginBottom: 24,
  },
  bannerTitle: { color: '#fff', fontSize: 17, fontFamily: HEAD.bold, lineHeight: 23 },
  bannerSub: { color: '#fff', fontSize: 13, marginTop: 6, opacity: 0.92, fontFamily: HEAD.medium },

  tabs: {
    flexDirection: 'row',
    backgroundColor: THEME.bgSubtle,
    borderRadius: THEME.radius.control,
    padding: 4,
    marginBottom: 24,
  },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderRadius: THEME.radius.control - 4 },
  tabActive: { backgroundColor: THEME.surface, ...shadowCard },
  tabText: { color: THEME.inkSoft, fontSize: 15, fontFamily: HEAD.semibold },
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
  socialIcon: { marginRight: 10 },
  socialText: { color: THEME.ink, fontSize: 15, fontFamily: HEAD.semibold },

  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: THEME.border },
  orText: { color: THEME.inkSoft, fontSize: 14, fontFamily: HEAD.medium },

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
    fontFamily: HEAD.medium,
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
  passwordInput: { flex: 1, paddingVertical: 15, fontSize: 15, color: THEME.ink, fontFamily: HEAD.medium },

  forgot: { alignSelf: 'flex-end', paddingVertical: 8 },
  forgotText: { color: THEME.orange, fontSize: 13, fontFamily: HEAD.semibold },

  submit: {
    backgroundColor: THEME.orange,
    borderRadius: THEME.radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontFamily: HEAD.bold },

  skip: { alignItems: 'center', paddingVertical: 16 },
  skipText: { color: THEME.orange, fontSize: 15, fontFamily: HEAD.semibold },

  cguRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 16, paddingHorizontal: 2 },
  cguCase: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: THEME.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  cguCaseCochee: { backgroundColor: THEME.orange, borderColor: THEME.orange },
  cguTexte: { flex: 1, color: THEME.inkSoft, fontSize: 13, lineHeight: 19 },
  cguLien: { color: THEME.orange, textDecorationLine: 'underline' },

  mentions: { color: THEME.grey, fontSize: 12, textAlign: 'center', marginTop: 4, fontFamily: HEAD.medium },
});
