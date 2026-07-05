import React from 'react';
import { ScrollView, Text } from 'react-native';

/**
 * Filet de sécurité de démarrage.
 *
 * En release native, une erreur JS fatale (au require du bundle, au premier
 * rendu, ou asynchrone) termine l'app immédiatement après le splash, sans
 * aucun message. Ce module convertit ces trois familles d'erreurs en un écran
 * lisible (message + stack), pour diagnostiquer sur l'appareil sans Mac :
 *  - erreurs de rendu React        → ErrorBoundary (getDerivedStateFromError)
 *  - erreurs JS fatales hors rendu → ErrorUtils.setGlobalHandler
 *  - échec du require de l'app     → StartupErrorScreen (utilisé par index.*.js)
 */

interface ErrorUtilsLike {
  getGlobalHandler(): ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

function describe(error: unknown): string {
  const e = error as { stack?: string; message?: string } | null;
  return String(e?.stack ?? e?.message ?? error);
}

export function StartupErrorScreen({ error }: { error: unknown }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#ffffff' }}
      contentContainerStyle={{ padding: 24, paddingTop: 80, paddingBottom: 48 }}
    >
      <Text style={{ fontSize: 18, fontWeight: '700', color: '#b91c1c' }}>
        Erreur au démarrage
      </Text>
      <Text style={{ marginTop: 6, fontSize: 13, color: '#6b6460' }}>
        Envoyez une capture de cet écran au support.
      </Text>
      <Text selectable style={{ marginTop: 16, fontSize: 12, lineHeight: 17, color: '#111111' }}>
        {describe(error)}
      </Text>
    </ScrollView>
  );
}

// ── Capture globale, installée DÈS L'IMPORT de ce module ────────────────
// (componentDidMount serait trop tard : les effets des enfants s'exécutent
// avant, et une erreur fatale y déclencherait le handler par défaut → app
// terminée avant que le garde-fou soit actif.)
let capturedError: unknown = null;
const listeners = new Set<(error: unknown) => void>();

function capture(error: unknown): void {
  if (capturedError == null) capturedError = error;
  listeners.forEach((notify) => notify(error));
}

const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
if (utils) {
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      // Ne PAS rappeler le handler par défaut : en release il termine l'app.
      capture(error);
      return;
    }
    previous?.(error, isFatal);
  });
}

interface State {
  error: unknown;
}

export class CrashGuard extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: capturedError };

  private readonly onFatal = (error: unknown) => this.setState({ error });

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidMount(): void {
    listeners.add(this.onFatal);
    if (capturedError != null) this.setState({ error: capturedError });
  }

  componentWillUnmount(): void {
    listeners.delete(this.onFatal);
  }

  render(): React.ReactNode {
    if (this.state.error != null) {
      return <StartupErrorScreen error={this.state.error} />;
    }
    return this.props.children;
  }
}
