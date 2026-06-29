import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/root-navigator';

type Props = NativeStackScreenProps<RootStackParamList, 'QRScanner'>;

/** Parses breakeat://event/<uuid> and returns the eventId or null */
function parseDeepLink(url: string): string | null {
  const match = url.match(/^breakeat:\/\/event\/([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

export function QRScannerScreen({ navigation }: Props) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const insets = useSafeAreaInsets();
  const [scanned, setScanned] = useState(false);
  const [manualId, setManualId] = useState('');
  const [showManual, setShowManual] = useState(false);

  // Request camera permission on mount
  useEffect(() => {
    if (!hasPermission) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission]);

  const handleScannedCode = useCallback(
    (value: string) => {
      if (scanned) return;

      const eventId = parseDeepLink(value);
      if (eventId) {
        setScanned(true);
        navigation.navigate('EventHome', { eventId });
        // Reset after a short delay to allow re-scanning
        setTimeout(() => setScanned(false), 2000);
      } else {
        Alert.alert('QR invalide', "Ce QR code n'est pas un code Break Eat valide.");
      }
    },
    [scanned, navigation],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      const first = codes[0];
      if (first?.value) {
        handleScannedCode(first.value);
      }
    },
  });

  const handleManualSubmit = () => {
    const id = manualId.trim();
    if (!id) return;

    // Accept full deep link URL or bare UUID
    const eventId = parseDeepLink(id) ?? (id.match(/^[0-9a-f-]{36}$/i) ? id : null);
    if (eventId) {
      navigation.navigate('EventHome', { eventId });
    } else {
      Alert.alert('ID invalide', "Format attendu : UUID ou breakeat://event/<uuid>");
    }
  };

  const openSettings = () => {
    void Linking.openSettings();
  };

  // ── Permission denied ──────────────────────────────────────
  if (!hasPermission) {
    return (
      <View style={styles.root}>
        <Pressable
          onPress={() => navigation.canGoBack() ? navigation.goBack() : undefined}
          hitSlop={14}
          style={[styles.floatBack, { top: insets.top + 6 }]}
        >
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <View style={styles.centered}>
          <Text style={styles.permTitle}>Accès caméra requis</Text>
          <Text style={styles.permText}>
            Break Eat a besoin de la caméra pour scanner les QR codes.
          </Text>
          {Platform.OS === 'ios' ? (
            <Pressable style={styles.btn} onPress={openSettings}>
              <Text style={styles.btnText}>Ouvrir les réglages</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.btn} onPress={() => void requestPermission()}>
              <Text style={styles.btnText}>Autoriser la caméra</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setShowManual(true)} style={styles.altBtn}>
            <Text style={styles.altText}>Saisir un ID manuellement</Text>
          </Pressable>
          {showManual && renderManualInput()}
        </View>
      </View>
    );
  }

  // ── No camera device ────────────────────────────────────────
  if (!device) {
    return (
      <View style={styles.root}>
        <Pressable
          onPress={() => navigation.canGoBack() ? navigation.goBack() : undefined}
          hitSlop={14}
          style={[styles.floatBack, { top: insets.top + 6 }]}
        >
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </Pressable>
        <View style={styles.centered}>
          <Text style={styles.permText}>Aucune caméra arrière disponible.</Text>
        </View>
      </View>
    );
  }

  function renderManualInput() {
    return (
      <View style={styles.manualBox}>
        <Text style={styles.manualLabel}>ID ou lien d'événement</Text>
        <TextInput
          style={styles.manualInput}
          value={manualId}
          onChangeText={setManualId}
          placeholder="ex: 550e8400-e29b-41d4-a716-..."
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={styles.btn} onPress={handleManualSubmit}>
          <Text style={styles.btnText}>Accéder à l'événement</Text>
        </Pressable>
      </View>
    );
  }

  // ── Main scanner view ────────────────────────────────────────
  return (
    <View style={styles.root}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!scanned}
        codeScanner={codeScanner}
      />

      {/* Back button flottant */}
      <Pressable
        onPress={() => navigation.canGoBack() ? navigation.goBack() : undefined}
        hitSlop={14}
        style={[styles.floatBack, { top: insets.top + 6 }]}
      >
        <Ionicons name="chevron-back" size={26} color="#fff" />
      </Pressable>

      {/* Overlay */}
      <View style={styles.overlay}>
        <Text style={styles.header}>BREAK EAT</Text>
        <Text style={styles.hint}>Scannez le QR code de votre événement</Text>

        {/* Viewfinder */}
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>

        {scanned && (
          <View style={styles.scannedBadge}>
            <Text style={styles.scannedText}>✓ QR détecté !</Text>
          </View>
        )}

        {/* Manual input toggle */}
        <Pressable onPress={() => setShowManual((v) => !v)} style={styles.altBtn}>
          <Text style={styles.altText}>
            {showManual ? '▲ Masquer la saisie manuelle' : '▼ Saisir un ID manuellement'}
          </Text>
        </Pressable>
        {showManual && renderManualInput()}
      </View>
    </View>
  );
}

const CORNER = 24;
const CORNER_W = 3;
const BLUE = '#2563eb';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  floatBack: {
    position: 'absolute',
    left: 12,
    zIndex: 10,
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  centered: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },

  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },

  header: {
    position: 'absolute',
    top: 60,
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 3,
  },

  hint: {
    position: 'absolute',
    top: 96,
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },

  viewfinder: {
    width: 240,
    height: 240,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER,
    height: CORNER,
    borderColor: BLUE,
  },
  topLeft: { top: 0, left: 0, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W },
  topRight: { top: 0, right: 0, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W },

  scannedBadge: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  scannedText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  permTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff', textAlign: 'center' },
  permText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },

  btn: {
    backgroundColor: BLUE,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  altBtn: { paddingVertical: 10, alignItems: 'center' },
  altText: { color: '#6b7280', fontSize: 13 },

  manualBox: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(17,24,39,0.9)',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  manualLabel: { color: '#d1d5db', fontSize: 13, fontWeight: '600' },
  manualInput: {
    backgroundColor: '#1f2937',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#374151',
  },
});
