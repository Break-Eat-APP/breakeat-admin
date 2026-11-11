import React from 'react';
import {
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { THEME, FONT } from '@lib/theme';

/**
 * UNE FEUILLE DU BAS QUI SAIT VIVRE AVEC LE CLAVIER.
 *
 * Constaté par Rémi le 10/11 sur la note d'une commande et sur « Mes
 * informations » : une fois le clavier ouvert, IMPOSSIBLE de le fermer, et
 * le bouton « Enregistrer » restait dessous. Trois causes, toutes ici :
 *
 *  1. Rien ne remontait la feuille au-dessus du clavier → `KeyboardAvoidingView`.
 *  2. Le pavé du téléphone et un champ sur plusieurs lignes n'ont PAS de
 *     touche « OK » sur iPhone : rien ne fermait le clavier. → la barre
 *     `BarreClavier` (« OK » au-dessus du clavier), et toucher le fond ou la
 *     feuille hors d'un champ le ferme aussi.
 *  3. Un appui sur « Enregistrer » pendant que le clavier est ouvert ne doit
 *     pas être avalé par la fermeture du clavier → `keyboardShouldPersistTaps`.
 */
export const BARRE_CLAVIER = 'barre-clavier-ok';

export function FeuilleClavier({
  children,
  style,
  contenuStyle,
}: {
  children: React.ReactNode;
  /** La feuille elle-même (fond, coins, marges). */
  style?: StyleProp<ViewStyle>;
  /** La colonne de son contenu (l'écart entre les champs, par exemple). */
  contenuStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <KeyboardAvoidingView
      style={styles.racine}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Le voile : le toucher range le clavier (il ne ferme pas la feuille,
          pour ne rien perdre de ce qui a été tapé). */}
      <Pressable style={styles.voile} onPress={Keyboard.dismiss} accessible={false} />
      <View style={style}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          {/* Toucher la feuille hors d'un champ range aussi le clavier. */}
          <Pressable onPress={Keyboard.dismiss} accessible={false} style={contenuStyle}>
            {children}
          </Pressable>
        </ScrollView>
      </View>
      <BarreClavier />
    </KeyboardAvoidingView>
  );
}

/** « OK » au-dessus du clavier iPhone — la touche qui manque au pavé numérique. */
function BarreClavier() {
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={BARRE_CLAVIER}>
      <View style={styles.barre}>
        <Pressable onPress={Keyboard.dismiss} hitSlop={10} accessibilityRole="button">
          <Text style={styles.ok}>OK</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, justifyContent: 'flex-end' },
  voile: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  barre: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: '#F2F1EF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: THEME.border,
  },
  ok: { color: THEME.orange, fontSize: 16, fontFamily: FONT.bold },
});
