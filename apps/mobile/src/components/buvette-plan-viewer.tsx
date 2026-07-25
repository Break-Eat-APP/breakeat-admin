import React from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * BuvettePlanViewer — plan des buvettes en plein écran, zoomable.
 *
 * Ouvre l'image du plan (créée par le club sur Canva puis hébergée) par-dessus
 * l'écran courant. Le pincer-pour-zoomer fonctionne nativement sur iOS via la
 * ScrollView (maximumZoomScale + pinchGestureEnabled) — indispensable car un
 * plan est illisible en petit. Sur le web l'image reste affichée (sans zoom).
 *
 * Réutilisable partout : carte du lieu (avant commande) et confirmation de
 * commande (au moment d'aller récupérer). Ne rend rien si `url` est absente.
 */
export function BuvettePlanViewer({
  visible,
  url,
  onClose,
  title = 'Plan des buvettes',
}: {
  visible: boolean;
  url: string | null | undefined;
  onClose: () => void;
  title?: string;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');

  if (!url) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView
          style={StyleSheet.absoluteFill}
          contentContainerStyle={[styles.scrollContent, { minWidth: width, minHeight: height }]}
          maximumZoomScale={4}
          minimumZoomScale={1}
          pinchGestureEnabled
          centerContent
          bouncesZoom
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          <Image
            source={{ uri: url }}
            style={{ width, height: height * 0.85 }}
            resizeMode="contain"
          />
        </ScrollView>

        {/* Titre */}
        <View style={[styles.titleBar, { top: insets.top + 8 }]} pointerEvents="none">
          <Text style={styles.title}>{title}</Text>
        </View>

        {/* Fermer */}
        <Pressable
          onPress={onClose}
          hitSlop={14}
          style={[styles.closeBtn, { top: insets.top + 6 }]}
          accessibilityLabel="Fermer le plan"
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        {/* Indice zoom (iOS/natif uniquement) */}
        {Platform.OS !== 'web' && (
          <View style={[styles.hint, { bottom: insets.bottom + 16 }]} pointerEvents="none">
            <Ionicons name="scan-outline" size={14} color="#fff" />
            <Text style={styles.hintText}>Pince pour zoomer</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  scrollContent: { alignItems: 'center', justifyContent: 'center' },
  titleBar: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  title: { color: '#fff', fontSize: 16, fontFamily: 'Raleway_700Bold', letterSpacing: 0.3 },
  closeBtn: {
    position: 'absolute', right: 12, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center',
  },
  hint: {
    position: 'absolute', left: 0, right: 0, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  hintText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontFamily: 'Raleway_500Medium' },
});
