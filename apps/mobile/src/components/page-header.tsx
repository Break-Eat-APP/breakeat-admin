import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { THEME, FONT } from '@lib/theme';

interface PageHeaderProps {
  title?: string;
  /** Override the back action (par défaut : navigation.goBack()). */
  onBack?: () => void;
  /** Élément affiché à droite (panier, action, etc.). */
  right?: React.ReactNode;
}

/**
 * Header de page secondaire : flèche retour + titre optionnel.
 * Gère lui-même le safe-area inset du haut — le screen n'a pas besoin de SafeAreaView.
 */
export function PageHeader({ title, onBack, right }: PageHeaderProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const handleBack = onBack ?? (() => {
    if (navigation.canGoBack()) navigation.goBack();
  });

  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <Pressable onPress={handleBack} hitSlop={14} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={26} color={THEME.orange} />
      </Pressable>

      {title ? (
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      ) : (
        <View style={styles.spacer} />
      )}

      <View style={styles.right}>{right ?? null}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  backBtn: {
    padding: 4,
    borderRadius: 8,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontFamily: FONT.bold,
    color: THEME.ink,
    textAlign: 'center',
  },
  spacer: { flex: 1 },
  right: {
    minWidth: 34,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
});
