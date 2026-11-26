import React, { useCallback, useEffect, useMemo } from 'react';
import { AppState, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { apiGetMesSuivisFlaix, formatPrice } from '@lib/api/mobile-api';
import { PageHeader } from '@components/page-header';
import { useBottomBarSpace } from '@components/app-bottom-bar';
import { ADRESSE_SUPPORT, lienSignalement } from '@lib/support';
import { showAlert } from '@lib/alert';
import { THEME } from '@lib/theme';
import { useAuthStore } from '@store/auth.store';
import { useSuiviStore } from '@store/suivi.store';
import { avecEtatEnDirect, statutCommandeFlaix } from '@lib/etat-commande-flaix';
import { STATUS_MAP, STEPS, retourEnArriere, stylesSuivi as styles } from '@screens/order-tracking.screen';

type Props = NativeStackScreenProps<RootStackParamList, 'SuiviFlaix'>;

/** Le rythme de la flamme : l'état vient de NOTRE base, pas de Flaix. */
const RELECTURE_MS = 10_000;

/**
 * LE SUIVI D'UNE COMMANDE FLAIX, DANS BREAKEAT (27/11/2026).
 *
 * Toucher un ticket Flaix ouvrait la page de suivi de Flaix : Rémi voulait le
 * même écran qu'une commande BreakEat, avec « Signaler un problème avec ma
 * commande » (26/11). Même présentation, mêmes styles (`stylesSuivi`) : le
 * numéro en grand, l'état, les étapes, le détail, le signalement.
 *
 * D'OÙ VIENNENT LES DONNÉES — sans aucun appel de plus chez Flaix :
 *  · la commande elle-même (numéro, lieu, lignes, total) : passée par « Mes
 *    commandes », qui l'a lue chez Flaix à son ouverture ;
 *  · l'étape EN DIRECT : `/flaix/mes-suivis`, que notre serveur tient à jour
 *    toutes les 15 s (`surveillance-commandes-flaix.service.ts`), relue ici
 *    toutes les 10 s tant que la commande n'est pas terminée.
 *
 * Ce que l'écran ne fait PAS, parce que c'est Flaix qui vend : le reçu
 * officiel reste celui de Flaix (« Voir le reçu » ouvre sa page), pas de plan
 * de buvette ni de « Je suis arrivé ».
 */
export function SuiviFlaixScreen({ route, navigation }: Props) {
  const espaceBas = useBottomBarSpace();
  const recue = route.params.commande;
  const suivis = useSuiviStore((e) => e.commandesFlaix);
  const direct = useMemo(() => suivis.find((s) => s.id === recue.id), [suivis, recue.id]);
  const commande = useMemo(() => avecEtatEnDirect(recue, direct), [recue, direct]);
  const statut = statutCommandeFlaix(commande);
  const cfg = statut ? STATUS_MAP[statut] : undefined;
  const termine = cfg?.isFinal === true || (!statut && !commande.enCours);

  const relire = useCallback(async () => {
    try {
      useSuiviStore.getState().publierFlaix(await apiGetMesSuivisFlaix());
    } catch {
      // Hors ligne : l'écran garde le dernier état connu.
    }
  }, []);

  useEffect(() => {
    void relire();
    if (termine) return;
    const t = setInterval(() => void relire(), RELECTURE_MS);
    const sub = AppState.addEventListener('change', (e) => {
      if (e === 'active') void relire();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [termine, relire]);

  const signalerProbleme = async () => {
    const lien = lienSignalement(
      {
        numero: `n° ${commande.numero}`,
        // Le jeton Flaix est un droit d'accès : jamais dans un e-mail. Le
        // support retrouve la commande par le lieu, le match, le numéro et
        // l'heure.
        reference: ['Commande Flaix', commande.lieu, commande.evenement].filter(Boolean).join(' · '),
        buvette: commande.pointDeRetrait,
        passeeLe: commande.passeeLe,
      },
      {
        compte: useAuthStore.getState().user?.email ?? null,
        appareil: `${Platform.OS} ${Platform.Version}`,
        version: Constants.expoConfig?.version ?? 'version inconnue',
      },
    );
    try {
      if (!(await Linking.canOpenURL(lien))) throw new Error('aucune messagerie');
      await Linking.openURL(lien);
    } catch {
      showAlert(
        'Aucune messagerie configurée',
        `Écris-nous à ${ADRESSE_SUPPORT} en précisant la commande n° ${commande.numero}.`,
      );
      navigation.navigate('Aide');
    }
  };

  const ouvrirRecu = async () => {
    if (!commande.lienRecu) return;
    try {
      await Linking.openURL(commande.lienRecu);
    } catch {
      showAlert('Lien indisponible', "Impossible d'ouvrir le reçu pour le moment.");
    }
  };

  const noter = () => {
    // La feuille de note vit dans « Mes commandes » : on y retourne, et elle
    // s'ouvre d'elle-même (`jetonANoter`).
    useSuiviStore.getState().demanderNote(commande.id);
    navigation.navigate('Commandes');
  };

  const etape = statut ? STEPS.indexOf(statut) : -1;
  const libelle = cfg?.label ?? commande.etatLibelle;
  const description = cfg?.description ?? commande.etatDetail ?? '';

  return (
    <View style={styles.root}>
      <PageHeader
        title={`Commande N° ${commande.numero}`}
        onBack={() => retourEnArriere(navigation)}
        right={
          !termine ? (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : undefined
        }
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: espaceBas + 16 }]}>
        <View style={styles.numeroCarte}>
          <Text style={styles.numeroLabel}>Numéro de commande</Text>
          <Text style={styles.numeroValeur}>{commande.numero}</Text>
        </View>

        <View style={[styles.statusHero, { backgroundColor: cfg?.bg ?? THEME.surface }]}>
          <Text style={[styles.statusLabel, { color: cfg?.color ?? THEME.grey }]}>{libelle}</Text>
          {description ? <Text style={styles.statusDesc}>{description}</Text> : null}
        </View>

        {/* Le point de retrait : là où se présenter. Flaix le donne. */}
        {commande.pointDeRetrait || commande.lieu ? (
          <View style={styles.planCarte}>
            <View style={styles.planIcone}>
              <Ionicons name="location-outline" size={22} color={THEME.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planTitre} numberOfLines={1}>
                {commande.pointDeRetrait ?? commande.lieu}
              </Text>
              <Text style={styles.planSous} numberOfLines={1}>
                {[commande.pointDeRetrait ? commande.lieu : null, commande.evenement].filter(Boolean).join(' · ') ||
                  'Point de retrait'}
              </Text>
            </View>
          </View>
        ) : null}

        {statut && statut !== 'CANCELLED' ? (
          <View style={styles.stepsCard}>
            {STEPS.slice(0, -1).map((step, i) => {
              const fait = i < etape;
              const actif = i === etape;
              return (
                <View key={step} style={styles.stepRow}>
                  <View style={[styles.stepDot, fait && styles.stepDotDone, actif && styles.stepDotActive]}>
                    {fait && <Ionicons name="checkmark" size={13} color="#fff" />}
                    {actif && <View style={styles.stepPulse} />}
                  </View>
                  <Text style={[styles.stepLabel, fait && styles.stepLabelDone, actif && styles.stepLabelActive]}>
                    {STATUS_MAP[step]?.label ?? step}
                  </Text>
                  {i < STEPS.length - 2 && <View style={[styles.stepLine, fait && styles.stepLineDone]} />}
                </View>
              );
            })}
          </View>
        ) : null}

        {commande.lignes.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Ta commande</Text>
            {commande.lignes.map((l, i) => (
              <View key={i} style={styles.itemRow}>
                <Text style={styles.itemQty}>{l.quantite}×</Text>
                <View style={styles.itemTextes}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {l.produit}
                  </Text>
                  {l.tauxTva != null ? <Text style={styles.itemTva}>TVA {l.tauxTva} %</Text> : null}
                </View>
                <Text style={styles.itemPrice}>{formatPrice(Math.round(l.totalTtc * 100))}</Text>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.itemRow}>
              <Text style={styles.totalLabel}>Total TTC</Text>
              <Text style={styles.totalValue}>{formatPrice(Math.round(commande.totalTtc * 100))}</Text>
            </View>
          </View>
        ) : null}

        {/* « Noter ma commande » : récupérée, pas encore notée. */}
        {direct?.notable ? (
          <Pressable
            style={({ pressed }) => [styles.signaler, pressed && { opacity: 0.7 }]}
            onPress={noter}
            accessibilityRole="button"
          >
            <Ionicons name="star-outline" size={20} color={THEME.orange} />
            <Text style={styles.signalerTexte}>Noter ma commande</Text>
            <Ionicons name="chevron-forward" size={18} color={THEME.grey} />
          </Pressable>
        ) : null}

        {/* Le reçu officiel est celui de Flaix : c'est lui qui encaisse. */}
        {commande.lienRecu ? (
          <Pressable
            style={({ pressed }) => [styles.signaler, pressed && { opacity: 0.7 }]}
            onPress={() => void ouvrirRecu()}
            accessibilityRole="button"
          >
            <Ionicons name="receipt-outline" size={20} color={THEME.orangeDark} />
            <Text style={styles.signalerTexte}>Voir le reçu</Text>
            <Ionicons name="chevron-forward" size={18} color={THEME.grey} />
          </Pressable>
        ) : null}

        <Pressable
          style={({ pressed }) => [styles.signaler, pressed && { opacity: 0.7 }]}
          onPress={() => void signalerProbleme()}
          accessibilityRole="button"
        >
          <Ionicons name="alert-circle-outline" size={20} color={THEME.orangeDark} />
          <Text style={styles.signalerTexte}>Signaler un problème avec ma commande</Text>
          <Ionicons name="chevron-forward" size={18} color={THEME.grey} />
        </Pressable>

        {!termine ? <Text style={styles.pollInfo}>Mise à jour automatique</Text> : null}
      </ScrollView>
    </View>
  );
}
