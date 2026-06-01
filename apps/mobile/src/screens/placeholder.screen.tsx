import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Placeholder screen — Phase 1.
 * Replaced by real screens from Phase 2 onward.
 */
export function PlaceholderScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>BRAT EAT</Text>
      <Text style={styles.subtitle}>Phase 1 — Foundation ready</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
    marginTop: 8,
  },
});
