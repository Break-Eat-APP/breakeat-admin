import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTime, type CommandeFlaix } from '@lib/api/mobile-api';
import { showAlert } from '@lib/alert';
import { THEME, shadowCard, HEAD } from '@lib/theme';

/**
 * La carte d'une commande passée dans FLAIX, dans « Mes commandes »
 * (21/11/2026).
 *
 * Plus simple que le ticket d'une commande BreakEat, et c'est voulu : BreakEat
 * ne fait que LIRE ces commandes chez Flaix. Pas de « Je suis arrivé », pas
 * de note, pas de plan : ces gestes demandent une commande BreakEat. L'état
 * affiché est celui que Flaix donne (c'est l'opérateur Flaix qui dit
 * « prête »), relu à chaque rafraîchissement de l'écran.
 */

const VERT = '#16a34a';
const VERT_FOND = 'rgba(22, 163, 74, 0.10)';

const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

function heureDeRetrait(c: CommandeFlaix): string | null {
  if (c.retraitAffiche) return c.retraitAffiche;
  if (c.retraitPrevu) return formatTime(c.retraitPrevu);
  return null;
}

function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

async function ouvrir(url: string | null) {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    showAlert('Lien indisponible', "Impossible d'ouvrir cette page pour le moment.");
  }
}

export function CarteCommandeFlaix({ commande: c }: { commande: CommandeFlaix }) {
  const couleur = c.prete ? VERT : c.enCours ? THEME.orange : THEME.inkSoft;
  const fond = c.prete ? VERT_FOND : c.enCours ? THEME.orangeTint : THEME.bgSubtle;
  const heure = heureDeRetrait(c);

  return (
    <View style={[styles.carte, shadowCard]}>
      <View style={styles.entete}>
        <View style={{ flex: 1 }}>
          <Text style={styles.lieu} numberOfLines={1}>
            {c.lieu ?? 'Commande'}
          </Text>
          <Text style={styles.sousTitre} numberOfLines={1}>
            {[c.evenement, jour(c.passeeLe)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={[styles.etat, { backgroundColor: fond }]}>
          <Text style={[styles.etatTexte, { color: couleur }]}>{c.etatLibelle}</Text>
        </View>
      </View>

      {c.numero ? <Text style={styles.numero}>Commande n° {c.numero}</Text> : null}
      {c.etatDetail && c.enCours ? <Text style={styles.detail}>{c.etatDetail}</Text> : null}

      {c.pointDeRetrait || heure ? (
        <View style={styles.ligneInfo}>
          <Ionicons name="location-outline" size={16} color={THEME.inkSoft} />
          <Text style={styles.info}>
            {[c.pointDeRetrait, heure ? `retrait vers ${heure}` : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
      ) : null}

      <View style={styles.lignes}>
        {c.lignes.map((l, i) => (
          <View key={i} style={styles.ligne}>
            <Text style={styles.produit} numberOfLines={1}>
              {l.quantite} × {l.produit}
            </Text>
            <Text style={styles.prix}>{euros(l.totalTtc)}</Text>
          </View>
        ))}
        <View style={[styles.ligne, styles.total]}>
          <Text style={styles.totalTexte}>Total</Text>
          <Text style={styles.totalTexte}>{euros(c.totalTtc)}</Text>
        </View>
      </View>

      {c.lienSuivi || c.lienRecu ? (
        <View style={styles.boutons}>
          {c.lienSuivi && c.enCours ? (
            <Pressable
              style={({ pressed }) => [styles.bouton, styles.boutonPlein, pressed && styles.appuye]}
              onPress={() => void ouvrir(c.lienSuivi)}
              accessibilityRole="button"
            >
              <Text style={styles.boutonPleinTexte}>Suivre ma commande</Text>
            </Pressable>
          ) : null}
          {c.lienRecu ? (
            <Pressable
              style={({ pressed }) => [styles.bouton, pressed && styles.appuye]}
              onPress={() => void ouvrir(c.lienRecu)}
              accessibilityRole="button"
            >
              <Text style={styles.boutonTexte}>Reçu</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  carte: {
    backgroundColor: THEME.surface,
    borderRadius: THEME.radius.card,
    padding: 16,
    gap: 10,
  },
  entete: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  lieu: { fontFamily: HEAD.bold, fontSize: 17, color: THEME.ink },
  sousTitre: { fontFamily: HEAD.medium, fontSize: 13, color: THEME.inkSoft, marginTop: 2 },
  etat: { borderRadius: THEME.radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  etatTexte: { fontFamily: HEAD.bold, fontSize: 12.5 },
  numero: { fontFamily: HEAD.extrabold, fontSize: 22, color: THEME.ink },
  detail: { fontFamily: HEAD.medium, fontSize: 13.5, color: THEME.inkSoft },
  ligneInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  info: { fontFamily: HEAD.medium, fontSize: 14, color: THEME.ink, flex: 1 },
  lignes: { borderTopWidth: 1, borderTopColor: THEME.border, paddingTop: 8, gap: 4 },
  ligne: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  produit: { fontFamily: HEAD.medium, fontSize: 14, color: THEME.ink, flex: 1 },
  prix: { fontFamily: HEAD.medium, fontSize: 14, color: THEME.inkSoft },
  total: { borderTopWidth: 1, borderTopColor: THEME.border, paddingTop: 6, marginTop: 4 },
  totalTexte: { fontFamily: HEAD.bold, fontSize: 15, color: THEME.ink },
  boutons: { flexDirection: 'row', gap: 10, marginTop: 2 },
  bouton: {
    flex: 1,
    borderRadius: THEME.radius.control,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingVertical: 11,
    alignItems: 'center',
  },
  boutonPlein: { backgroundColor: THEME.orange, borderColor: THEME.orange },
  boutonTexte: { fontFamily: HEAD.bold, fontSize: 14, color: THEME.ink },
  boutonPleinTexte: { fontFamily: HEAD.bold, fontSize: 14, color: '#fff' },
  appuye: { opacity: 0.7 },
});
