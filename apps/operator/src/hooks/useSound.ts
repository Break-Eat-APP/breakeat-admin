'use client';

import { useRef, useCallback } from 'react';

/**
 * useSound — generates brief sound alerts using the Web Audio API.
 * No external library required. Uses oscillator + gain envelope.
 *
 * Sounds:
 *   playNewOrder  — two ascending beeps (attentive but not aggressive)
 *   playOrderReady — three quick rising tones (celebrate + urgency)
 */

function createAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

function beep(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume = 0.3,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.frequency.value = frequency;
  osc.type = 'sine';

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  // Lazy-init AudioContext (must be created after user gesture on some browsers)
  function getCtx(): AudioContext | null {
    if (!ctxRef.current) ctxRef.current = createAudioContext();
    if (ctxRef.current?.state === 'suspended') {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }

  const playNewOrder = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    beep(ctx, 880, now,       0.18, 0.25);
    beep(ctx, 1100, now + 0.22, 0.18, 0.25);
  }, []);

  const playOrderReady = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    beep(ctx, 880,  now,       0.12, 0.3);
    beep(ctx, 1100, now + 0.15, 0.12, 0.3);
    beep(ctx, 1320, now + 0.30, 0.20, 0.35);
  }, []);

  return { playNewOrder, playOrderReady };
}
