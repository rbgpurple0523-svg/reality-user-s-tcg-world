'use client';

import React, { useEffect, useState } from 'react';
import SkillCutIn from './SkillCutIn';
import SupportEffectOverlay from './SupportEffectOverlay';
import type { BattlePreResultEffectKey } from './battleEffectTypes';

export type SkillPreResultEffectPayload = {
  effectKey: BattlePreResultEffectKey;
  characterName: string;
  skillName: string;
  dialogue?: string;
  colorHex?: string;
  side?: 'left' | 'right';
};

export type SupportPreResultEffectPayload = {
  effectKey: BattlePreResultEffectKey;
  cardName: string;
  dialogue?: string;
  colorHex?: string;
  target?: 'self' | 'opponent' | 'both';
};

type EffectItem =
  | {
      id: number;
      kind: 'skill';
      payload: SkillPreResultEffectPayload;
    }
  | {
      id: number;
      kind: 'support';
      payload: SupportPreResultEffectPayload;
    };

type EffectListener = (effect: EffectItem | null) => void;

const listeners = new Set<EffectListener>();
const queue: Array<{
  effect: EffectItem;
  resolve: () => void;
}> = [];

let currentEffect: EffectItem | null = null;
let currentResolve: (() => void) | null = null;
let nextEffectId = 0;

function publish(effect: EffectItem | null) {
  currentEffect = effect;
  listeners.forEach((listener) => listener(effect));
}

function drainQueue() {
  if (currentEffect || queue.length === 0) return;
  const next = queue.shift();
  if (!next) return;
  currentResolve = next.resolve;
  publish(next.effect);
}

function enqueue(effect: EffectItem): Promise<void> {
  return new Promise((resolve) => {
    queue.push({ effect, resolve });
    drainQueue();
  });
}

export function playSkillPreResultEffect(
  payload: SkillPreResultEffectPayload,
): Promise<void> {
  return enqueue({
    id: nextEffectId++,
    kind: 'skill',
    payload,
  });
}

export function playSupportPreResultEffect(
  payload: SupportPreResultEffectPayload,
): Promise<void> {
  return enqueue({
    id: nextEffectId++,
    kind: 'support',
    payload,
  });
}

export function isBattlePreResultEffectPlaying(): boolean {
  return currentEffect !== null || queue.length > 0;
}

export default function BattleEffectLayer() {
  const [effect, setEffect] = useState<EffectItem | null>(currentEffect);

  useEffect(() => {
    listeners.add(setEffect);
    return () => {
      listeners.delete(setEffect);
    };
  }, []);

  useEffect(() => {
    if (!effect) return;

    const duration = effect.kind === 'skill' ? 900 : 950;
    const timer = window.setTimeout(() => {
      const completedResolve = currentResolve;
      currentResolve = null;
      publish(null);
      completedResolve?.();
      drainQueue();
    }, duration);

    return () => window.clearTimeout(timer);
  }, [effect?.id]);

  return (
    <>
      {effect?.kind === 'skill' && (
        <SkillCutIn
          visible
          effectKey={effect.payload.effectKey}
          characterName={effect.payload.characterName}
          skillName={effect.payload.skillName}
          dialogue={effect.payload.dialogue}
          colorHex={effect.payload.colorHex}
          side={effect.payload.side}
        />
      )}

      {effect?.kind === 'support' && (
        <SupportEffectOverlay
          visible
          effectKey={effect.payload.effectKey}
          cardName={effect.payload.cardName}
          dialogue={effect.payload.dialogue}
          colorHex={effect.payload.colorHex}
          target={effect.payload.target}
        />
      )}
    </>
  );
}
