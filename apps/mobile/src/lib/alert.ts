/**
 * Alertes/confirmations multiplateformes.
 *
 * `Alert` de react-native est un NO-OP sur react-native-web (web/Netlify) : aucune
 * boîte ne s'affiche, et les callbacks de boutons ne sont jamais appelés. Du coup,
 * sur le web, une confirmation de déconnexion ou un message d'aide « disparaissait »
 * silencieusement. Ce helper retombe sur `window.alert/confirm` côté web.
 */
import { Alert, Platform } from 'react-native';

/** Accès typé à window.alert/confirm sur le web (pas de lib DOM en RN). */
const webWindow = (globalThis as {
  window?: { alert: (m: string) => void; confirm: (m: string) => boolean };
}).window;

/** Message simple avec un seul bouton OK. */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web' && webWindow) {
    webWindow.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message, [{ text: 'OK' }]);
}

/**
 * Confirmation oui/non. `onConfirm` n'est appelé que si l'utilisateur valide.
 * `destructive` colore le bouton de validation en rouge (natif).
 */
export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  opts?: { confirmLabel?: string; cancelLabel?: string; destructive?: boolean },
): void {
  const confirmLabel = opts?.confirmLabel ?? 'Confirmer';
  const cancelLabel = opts?.cancelLabel ?? 'Annuler';

  if (Platform.OS === 'web' && webWindow) {
    if (webWindow.confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    {
      text: confirmLabel,
      style: opts?.destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
}
