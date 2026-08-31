import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';
import {
  apiCancelSplit,
  apiClaimSplitUnits,
  apiGetSplit,
  apiSendSplit,
  formatPrice,
  type OrderSplit,
  type SplitUnit,
} from '@lib/api/mobile-api';
import { useAuthStore } from '@store/auth.store';
import { useCartStore } from '@store/cart.store';
import { showAlert, confirmAction } from '@lib/alert';
import { PageHeader } from '@components/page-header';
import { THEME, shadowCard, FONT } from '@lib/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Split'>;

/**
 * L'ARDOISE — un écran, deux publics.
 *
 * L'HÔTE arrive ici depuis son panier : il partage le lien, regarde l'ardoise se
 * remplir, paie ce qui reste, puis envoie la tournée.
 *
 * LE CONVIVE arrive par un message, dans son NAVIGATEUR, sans compte et sans
 * rien avoir installé. Il coche ses articles et paie sur une page Stripe.
 *
 * Le même écran sert les deux parce que c'est le même objet : une liste
 * d'articles dont chacun prend sa part. Seuls les boutons du bas diffèrent.
 */

/** Rafraîchissement pendant que les convives paient. */
const POLL_MS = 8_000;

export function SplitScreen({ route, navigation }: Props) {
  const { code } = route.params;
  const { token } = useAuthStore();
  const resetCart = useCartStore((s) => s.resetCart);

  const [split, setSplit] = useState<OrderSplit | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const [prenom, setPrenom] = useState('');
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      setSplit(await apiGetSplit(code));
      setErreur(null);
    } catch (e: unknown) {
      setErreur(e instanceof Error ? e.message : 'Ardoise introuvable');
    } finally {
      setChargement(false);
    }
  }, [code]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Tant que la tournée se remplit, l'écran doit bouger tout seul : l'hôte
  // regarde son téléphone en attendant que ses amis paient.
  useEffect(() => {
    if (!split || split.status !== 'OPEN') return;
    const t = setInterval(() => void charger(), POLL_MS);
    return () => clearInterval(t);
  }, [split, charger]);

  const basculer = (unit: SplitUnit) => {
    if (unit.status !== 'FREE') return;
    setChoisis((cur) => {
      const suivant = new Set(cur);
      if (suivant.has(unit.id)) suivant.delete(unit.id);
      else suivant.add(unit.id);
      return suivant;
    });
  };

  const montantChoisi = (split?.units ?? [])
    .filter((u) => choisis.has(u.id))
    .reduce((sum, u) => sum + u.unitPriceCents, 0);

  const libres = (split?.units ?? []).filter((u) => u.status === 'FREE');
  const toutRegle = split !== null && libres.length === 0;

  /** Prendre les articles cochés et filer vers la page de paiement Stripe. */
  const payer = async (unitIds: string[]) => {
    if (unitIds.length === 0) return;
    setEnCours(true);
    try {
      const { checkoutUrl } = await apiClaimSplitUnits(code, unitIds, prenom.trim() || undefined);
      setChoisis(new Set());
      // La page de paiement est hébergée par Stripe : on quitte l'app (ou
      // l'onglet) le temps du règlement, et le lien de retour ramène ici.
      await Linking.openURL(checkoutUrl);
    } catch (e: unknown) {
      showAlert('Paiement impossible', e instanceof Error ? e.message : 'Réessaie dans un instant.');
      void charger();
    } finally {
      setEnCours(false);
    }
  };

  const partager = async () => {
    const ou = split?.supplierName ? ` à ${split.supplierName}` : '';
    await Share.share({
      message:
        `On commande${ou} — prends ce que tu veux et paie ta part :\n\n` +
        `breakeat://split/${code}\n\n` +
        `Code : ${code}`,
    });
  };

  const envoyer = async () => {
    setEnCours(true);
    try {
      const order = await apiSendSplit(code);
      resetCart();
      navigation.replace('OrderConfirmation', {
        orderId: order.id,
        publicOrderNumber: order.publicOrderNumber,
        totalCents: order.totalCents,
      });
    } catch (e: unknown) {
      showAlert('Envoi impossible', e instanceof Error ? e.message : 'Réessaie dans un instant.');
      void charger();
    } finally {
      setEnCours(false);
    }
  };

  const annuler = () => {
    confirmAction(
      'Annuler la tournée ?',
      "Les sommes bloquées sur les cartes de tes amis seront libérées. Personne n'a été débité.",
      () => {
        void (async () => {
          try {
            await apiCancelSplit(code);
            void charger();
          } catch (e: unknown) {
            showAlert('Annulation impossible', e instanceof Error ? e.message : 'Réessaie.');
          }
        })();
      },
    );
  };

  if (chargement) {
    return (
      <View style={styles.root}>
        <PageHeader title="Ardoise partagée" />
        <View style={styles.centre}>
          <ActivityIndicator color={THEME.orange} />
        </View>
      </View>
    );
  }

  if (erreur || !split) {
    return (
      <View style={styles.root}>
        <PageHeader title="Ardoise partagée" />
        <View style={styles.centre}>
          <Text style={styles.vide}>{erreur ?? 'Ardoise introuvable.'}</Text>
        </View>
      </View>
    );
  }

  const estHote = Boolean(token);

  return (
    <View style={styles.root}>
      <PageHeader title={split.supplierName ?? 'Ardoise partagée'} />

      <ScrollView
        contentContainerStyle={styles.liste}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => void charger()} tintColor={THEME.orange} />
        }
      >
        {split.status !== 'OPEN' ? (
          <View style={styles.bandeau}>
            <Ionicons
              name={split.status === 'SENT' ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={split.status === 'SENT' ? '#16a34a' : THEME.grey}
            />
            <Text style={styles.bandeauTexte}>
              {split.status === 'SENT'
                ? 'La commande est partie au comptoir.'
                : 'Cette tournée a été annulée. Aucune carte n’a été débitée.'}
            </Text>
          </View>
        ) : (
          <Text style={styles.intro}>
            Coche ce que tu prends, puis paie ta part. Ta carte est simplement{' '}
            <Text style={styles.introFort}>bloquée</Text> — le débit a lieu quand la commande part.
          </Text>
        )}

        <View style={styles.compteur}>
          <Text style={styles.compteurTexte}>
            {formatPrice(split.paidCents)} réglés sur {formatPrice(split.totalCents)}
          </Text>
        </View>

        {split.units.map((unit) => {
          const coche = choisis.has(unit.id);
          const pris = unit.status !== 'FREE';
          return (
            <Pressable
              key={unit.id}
              onPress={() => basculer(unit)}
              disabled={pris || split.status !== 'OPEN'}
              style={({ pressed }) => [
                styles.ligne,
                shadowCard,
                coche && styles.ligneChoisie,
                pris && styles.lignePrise,
                pressed && !pris && { opacity: 0.85 },
              ]}
            >
              <Ionicons
                name={
                  pris ? 'checkmark-circle' : coche ? 'checkbox' : 'square-outline'
                }
                size={22}
                color={pris ? '#16a34a' : coche ? THEME.orange : THEME.grey}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.nom, pris && styles.nomPris]}>{unit.productName}</Text>
                {pris ? (
                  <Text style={styles.parQui}>
                    {unit.status === 'PAID'
                      ? `Réglé${unit.claimantName ? ` par ${unit.claimantName}` : ''}`
                      : 'Réservé — paiement en cours'}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.prix, pris && styles.nomPris]}>
                {formatPrice(unit.unitPriceCents)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {split.status === 'OPEN' && (
        <View style={styles.bas}>
          {choisis.size > 0 ? (
            <>
              <TextInput
                value={prenom}
                onChangeText={setPrenom}
                placeholder="Ton prénom (facultatif)"
                placeholderTextColor={THEME.grey}
                style={styles.champ}
                maxLength={40}
              />
              <Pressable
                style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
                onPress={() => void payer([...choisis])}
                disabled={enCours}
              >
                {enCours ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.ctaTexte}>
                    Payer ma part — {formatPrice(montantChoisi)}
                  </Text>
                )}
              </Pressable>
            </>
          ) : estHote ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.secondaire, pressed && { opacity: 0.9 }]}
                onPress={() => void partager()}
              >
                <Ionicons name="share-outline" size={18} color={THEME.orange} />
                <Text style={styles.secondaireTexte}>Partager l’addition</Text>
              </Pressable>

              {libres.length > 0 && (
                <Pressable
                  style={({ pressed }) => [styles.secondaire, pressed && { opacity: 0.9 }]}
                  onPress={() => void payer(libres.map((u) => u.id))}
                  disabled={enCours}
                >
                  <Ionicons name="card-outline" size={18} color={THEME.orange} />
                  <Text style={styles.secondaireTexte}>
                    Je paie le reste — {formatPrice(libres.reduce((s, u) => s + u.unitPriceCents, 0))}
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.cta,
                  !toutRegle && styles.ctaEteint,
                  pressed && { opacity: 0.9 },
                ]}
                onPress={() => void envoyer()}
                disabled={!toutRegle || enCours}
              >
                {enCours ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.ctaTexte}>
                    {toutRegle
                      ? 'Envoyer la commande →'
                      : `${libres.length} article(s) non réglé(s)`}
                  </Text>
                )}
              </Pressable>

              <Pressable onPress={annuler} hitSlop={8}>
                <Text style={styles.annuler}>Annuler la tournée</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.attente}>Coche les articles que tu prends.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: THEME.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  vide: { color: THEME.inkSoft, fontSize: 15, textAlign: 'center', fontFamily: FONT.regular },

  liste: { padding: 16, paddingBottom: 24, gap: 10 },
  intro: { color: THEME.inkSoft, fontSize: 13.5, lineHeight: 19, fontFamily: FONT.regular },
  introFort: { color: THEME.ink, fontFamily: FONT.bold },

  bandeau: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: THEME.bgSubtle,
  },
  bandeauTexte: { flex: 1, color: THEME.ink, fontSize: 13.5, fontFamily: FONT.medium },

  compteur: { alignItems: 'center', paddingVertical: 4 },
  compteurTexte: { color: THEME.ink, fontSize: 15, fontFamily: FONT.bold },

  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: THEME.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  ligneChoisie: { borderColor: THEME.orange, backgroundColor: THEME.orangeTint },
  lignePrise: { opacity: 0.6 },
  nom: { color: THEME.ink, fontSize: 15, fontFamily: FONT.semibold },
  nomPris: { color: THEME.inkSoft },
  parQui: { color: THEME.inkSoft, fontSize: 12, fontFamily: FONT.regular, marginTop: 1 },
  prix: { color: THEME.ink, fontSize: 15, fontFamily: FONT.bold },

  bas: {
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    backgroundColor: THEME.bg,
  },
  champ: {
    borderWidth: 1.5,
    borderColor: THEME.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: THEME.ink,
    fontFamily: FONT.regular,
  },
  cta: {
    backgroundColor: THEME.orange,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaEteint: { backgroundColor: THEME.grey },
  ctaTexte: { color: '#fff', fontSize: 16, fontFamily: FONT.bold },
  secondaire: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
    borderWidth: 1.5,
    borderColor: THEME.orange,
    backgroundColor: THEME.orangeTint,
  },
  secondaireTexte: { color: THEME.orange, fontSize: 14.5, fontFamily: FONT.bold },
  annuler: {
    color: THEME.grey,
    fontSize: 13,
    textAlign: 'center',
    fontFamily: FONT.regular,
    paddingVertical: 6,
  },
  attente: { color: THEME.inkSoft, fontSize: 13.5, textAlign: 'center', fontFamily: FONT.regular },
});
