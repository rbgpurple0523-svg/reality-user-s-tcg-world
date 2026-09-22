'use client';

import { useEffect, useState } from 'react';

type BattleStartPhase = 'idle' | 'reveal' | 'deal' | 'done';

interface UseBattleStartSequenceOptions {
  active: boolean;
  sequenceKey: string;
  characterCount?: number;
  handCount?: number;
}

interface UseBattleStartSequenceResult {
  phase: BattleStartPhase;
  revealedCharacterCount: number;
  dealtHandCount: number;
  isAnimating: boolean;
}

export function useBattleStartSequence({
  active,
  sequenceKey,
  characterCount = 3,
  handCount = 4,
}: UseBattleStartSequenceOptions): UseBattleStartSequenceResult {
  const [phase, setPhase] = useState<BattleStartPhase>('idle');
  const [revealedCharacterCount, setRevealedCharacterCount] = useState(0);
  const [dealtHandCount, setDealtHandCount] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhase('idle');
      setRevealedCharacterCount(0);
      setDealtHandCount(0);
      return;
    }

    let cancelled = false;
    const timers: number[] = [];

    setPhase('reveal');
    setRevealedCharacterCount(0);
    setDealtHandCount(0);

    timers.push(
      window.setTimeout(() => {
        if (cancelled) return;
        for (let index = 0; index < characterCount; index += 1) {
          timers.push(
            window.setTimeout(() => {
              if (!cancelled) {
                setRevealedCharacterCount(index + 1);
              }
            }, index * 260),
          );
        }
      }, 420),
    );

    timers.push(
      window.setTimeout(() => {
        if (cancelled) return;
        setPhase('deal');
        for (let index = 0; index < handCount; index += 1) {
          timers.push(
            window.setTimeout(() => {
              if (!cancelled) {
                setDealtHandCount(index + 1);
              }
            }, index * 190),
          );
        }
      }, 420 + Math.max(0, characterCount - 1) * 260 + 520),
    );

    timers.push(
      window.setTimeout(() => {
        if (!cancelled) {
          setPhase('done');
        }
      }, 420 + Math.max(0, characterCount - 1) * 260 + 520 + Math.max(0, handCount - 1) * 190 + 500),
    );

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [active, sequenceKey, characterCount, handCount]);

  return {
    phase,
    revealedCharacterCount,
    dealtHandCount,
    isAnimating: phase === 'reveal' || phase === 'deal',
  };
}
