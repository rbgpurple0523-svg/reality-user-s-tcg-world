'use client';

import React from 'react';
import { BATTLE_EFFECT_DEFINITIONS } from './battleEffectDefinitions';
import { getSupportBattleColor } from './battleCardVisuals';
import type { BattlePreResultEffectKey } from './battleEffectTypes';

interface SupportEffectOverlayProps {
  visible: boolean;
  effectKey: BattlePreResultEffectKey;
  cardName: string;
  dialogue?: string;
  colorHex?: string;
  target?: 'self' | 'opponent' | 'both';
}

const SYMBOLS: Record<BattlePreResultEffectKey, string> = {
  'skill-primary': '✦',
  'skill-product': '◈',
  'skill-difference': '⚡',
  'skill-combo': '✦',
  'skill-total': '✹',
  'skill-response': '◌',
  'skill-burst': '✹',
  'skill-crash': '▼',
  heal: '✚',
  'buff-stat': '↑',
  'buff-all': '✦',
  'debuff-stat': '↓',
  'debuff-all': '☄',
  'support-limit': '🔒',
  'support-impact': '✦',
  'support-free': '🔓',
  draw: '🃏',
  mirror: '◇',
  reflect: '↔',
  'skill-seal': '🔒',
};

export default function SupportEffectOverlay({
  visible,
  effectKey,
  cardName,
  dialogue,
  colorHex,
  target = 'self',
}: SupportEffectOverlayProps) {
  if (!visible) return null;

  const definition = BATTLE_EFFECT_DEFINITIONS[effectKey];
  const accent = getSupportBattleColor(colorHex);
  const symbol = SYMBOLS[effectKey];

  return (
    <div className="pointer-events-none fixed inset-0 z-[75] flex items-center justify-center overflow-hidden">
      <div
        className={`support-effect-shell support-effect-${definition.motion} support-effect-${definition.intensity}`}
        style={{
          ['--battle-accent' as string]: accent,
          ['--battle-accent-soft' as string]: `${accent}55`,
        }}
      >
        <div className="support-effect-ring support-effect-ring-a" />
        <div className="support-effect-ring support-effect-ring-b" />
        <div className="support-effect-spark support-effect-spark-a">{symbol}</div>
        <div className="support-effect-spark support-effect-spark-b">{symbol}</div>
        <div className="support-effect-spark support-effect-spark-c">{symbol}</div>
        <div className="relative z-10 rounded-3xl border border-white/40 bg-slate-950/80 px-6 py-5 text-center text-white shadow-2xl backdrop-blur-md">
          <div className="text-[9px] font-black tracking-[0.28em] text-white/50">
            SUPPORT EFFECT
          </div>
          <div className="mt-1 text-xs font-bold text-white/70">
            {target === 'self' ? 'YOUR CARD' : target === 'opponent' ? 'OPPONENT CARD' : 'BOTH CARDS'}
          </div>
          <div className="mt-2 text-xl font-black sm:text-2xl">{cardName}</div>
          <div className="mt-1 text-xs font-black" style={{ color: accent }}>
            {definition.label}
          </div>
          {dialogue && (
            <div className="mt-3 text-sm font-bold text-white/85">{dialogue}</div>
          )}
        </div>
      </div>

      <style jsx>{`
        .support-effect-shell {
          position: relative;
          display: grid;
          place-items: center;
          width: min(70vw, 500px);
          aspect-ratio: 1;
        }
        .support-effect-ring {
          position: absolute;
          inset: 14%;
          border: 2px solid var(--battle-accent);
          border-radius: 9999px;
          box-shadow: 0 0 24px var(--battle-accent-soft), inset 0 0 24px var(--battle-accent-soft);
        }
        .support-effect-ring-b {
          inset: 26%;
          border-style: dashed;
          opacity: .65;
        }
        .support-effect-spark {
          position: absolute;
          color: var(--battle-accent);
          font-weight: 900;
          text-shadow: 0 0 12px var(--battle-accent);
        }
        .support-effect-spark-a { top: 13%; left: 20%; }
        .support-effect-spark-b { top: 22%; right: 16%; }
        .support-effect-spark-c { bottom: 15%; left: 18%; }
        .support-effect-pulse .support-effect-ring-a,
        .support-effect-rise .support-effect-ring-a,
        .support-effect-orbit .support-effect-ring-a,
        .support-effect-impact .support-effect-ring-a,
        .support-effect-burst .support-effect-ring-a,
        .support-effect-mirror .support-effect-ring-a,
        .support-effect-reflect .support-effect-ring-a,
        .support-effect-lock .support-effect-ring-a,
        .support-effect-draw .support-effect-ring-a {
          animation: ring-open 900ms ease-out both;
        }
        .support-effect-fall .support-effect-ring-a {
          animation: ring-collapse 900ms ease-in both;
        }
        .support-effect-orbit .support-effect-ring-b,
        .support-effect-mirror .support-effect-ring-b,
        .support-effect-reflect .support-effect-ring-b {
          animation: spin-ring 1100ms linear infinite;
        }
        .support-effect-burst .support-effect-spark,
        .support-effect-rise .support-effect-spark,
        .support-effect-draw .support-effect-spark {
          animation: sparkle 850ms ease-out both;
        }
        .support-effect-fall .support-effect-spark,
        .support-effect-lock .support-effect-spark {
          animation: drop-spark 700ms ease-in both;
        }
        .support-effect-strong .support-effect-ring-a {
          filter: drop-shadow(0 0 10px var(--battle-accent));
        }
        @keyframes ring-open {
          0% { transform: scale(.4); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: scale(1.25); opacity: 0; }
        }
        @keyframes ring-collapse {
          0% { transform: scale(1.2); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: scale(.35); opacity: 0; }
        }
        @keyframes spin-ring {
          to { transform: rotate(360deg); }
        }
        @keyframes sparkle {
          0% { transform: scale(.4) rotate(-20deg); opacity: 0; }
          40% { opacity: 1; }
          100% { transform: scale(1.5) rotate(20deg); opacity: 0; }
        }
        @keyframes drop-spark {
          0% { transform: translateY(-16px) scale(.6); opacity: 0; }
          30% { opacity: 1; }
          100% { transform: translateY(42px) scale(1.1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
