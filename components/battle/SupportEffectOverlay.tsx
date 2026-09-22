'use client';

import React from 'react';
import { BATTLE_EFFECT_DEFINITIONS } from './battleEffectDefinitions';
import { getSupportBattleColor } from './battleCardVisuals';
import type { BattlePreResultEffectKey } from './battleEffectTypes';

interface SupportEffectOverlayProps {
  visible: boolean;
  effectKey: BattlePreResultEffectKey;
  cardName: string;
  imageUrl?: string;
  targetPositions?: {
    self?: { x: number; y: number };
    opponent?: { x: number; y: number };
  };
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
  imageUrl,
  dialogue,
  colorHex,
  target = 'self',
  targetPositions,
}: SupportEffectOverlayProps) {
  if (!visible) return null;

  const definition = BATTLE_EFFECT_DEFINITIONS[effectKey];
  const accent = getSupportBattleColor(colorHex);
  const symbol = SYMBOLS[effectKey];

  return (
    <div className="pointer-events-none fixed inset-0 z-[75] overflow-hidden">
      <div className="support-target-layer">
        {target !== 'opponent' && (
          <div
            className="support-target support-target-self"
            style={{
              ['--battle-accent' as string]: accent,
              ...(targetPositions?.self ? { left: targetPositions.self.x, top: targetPositions.self.y } : {}),
            }}
          >
            <div className="support-target-ring ring-a" />
            <div className="support-target-ring ring-b" />
            <div className="support-target-spark spark-a">{symbol}</div>
            <div className="support-target-spark spark-b">{symbol}</div>
          </div>
        )}

        {target !== 'self' && (
          <div
            className="support-target support-target-opponent"
            style={{
              ['--battle-accent' as string]: accent,
              ...(targetPositions?.opponent ? { left: targetPositions.opponent.x, top: targetPositions.opponent.y } : {}),
            }}
          >
            <div className="support-target-ring ring-a" />
            <div className="support-target-ring ring-b" />
            <div className="support-target-spark spark-a">{symbol}</div>
            <div className="support-target-spark spark-b">{symbol}</div>
          </div>
        )}
      </div>

      <div className="support-info-anchor">
        <div
          className="support-card-float"
          style={{
            ['--battle-accent' as string]: accent,
            ['--battle-accent-soft' as string]: `${accent}55`,
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="support-card-image"
            />
          ) : (
            <div className="support-card-placeholder" style={{ color: accent }}>
              ✦
            </div>
          )}
        </div>

        <div
          className="support-info-card"
          style={{
            borderColor: `${accent}88`,
            boxShadow: `0 0 1.5rem ${accent}33, 0 1rem 3rem rgba(2,6,23,.32)`,
          }}
        >
          <div className="text-[9px] font-black tracking-[0.28em] text-white/45">SUPPORT</div>
          <div className="mt-1 text-xl font-black text-white sm:text-2xl">{cardName}</div>
          <div className="mt-1 text-[11px] font-black" style={{ color: accent }}>{definition.label}</div>
          {dialogue && (
            <div className="mt-2 text-xs font-bold leading-relaxed text-white/75 sm:text-sm">{dialogue}</div>
          )}
        </div>
      </div>

      <style jsx>{`
        .support-target-layer {
          position: absolute;
          inset: 0;
        }
        .support-target {
          position: absolute;
          top: clamp(31%, 39vh, 48%);
          width: clamp(120px, 18vw, 220px);
          aspect-ratio: 1;
          transform: translate(-50%, -50%);
        }
        .support-target-self { left: 24%; }
        .support-target-opponent { left: 76%; }
        @media (max-width: 1023px) {
          .support-target { top: 40%; }
          .support-target-self { left: 50%; }
          .support-target-opponent { left: 50%; top: 60%; }
        }
        .support-target-ring {
          position: absolute;
          inset: 12%;
          border: 3px solid var(--battle-accent);
          border-radius: 9999px;
          box-shadow: 0 0 18px var(--battle-accent), inset 0 0 18px var(--battle-accent);
          opacity: 0;
          animation: target-ring 1250ms ease-out both;
        }
        .support-target .ring-b {
          inset: 28%;
          border-style: dashed;
          animation-duration: 1450ms;
          animation-delay: 70ms;
        }
        .support-target-spark {
          position: absolute;
          color: var(--battle-accent);
          font-size: clamp(22px, 3vw, 34px);
          font-weight: 900;
          text-shadow: 0 0 14px var(--battle-accent);
          animation: target-spark 1200ms ease-out both;
        }
        .spark-a { top: 8%; left: 15%; }
        .spark-b { right: 8%; bottom: 12%; animation-delay: 90ms; }

        .support-info-anchor {
          position: absolute;
          left: 50%;
          top: clamp(58%, 62vh, 70%);
          transform: translateX(-50%);
          width: min(92vw, 380px);
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .support-card-float {
          position: relative;
          z-index: 2;
          margin-bottom: -22px;
          filter: drop-shadow(0 0 12px var(--battle-accent-soft));
          animation: support-gift-rise 1450ms cubic-bezier(.2,.72,.24,1) both;
        }
        .support-card-image,
        .support-card-placeholder {
          display: grid;
          place-items: center;
          width: 88px;
          height: 88px;
          border-radius: 1.1rem;
          border: 2px solid var(--battle-accent);
          background: rgba(255,255,255,.96);
          object-fit: contain;
          padding: 8px;
          box-shadow: 0 0 18px var(--battle-accent-soft), 0 14px 30px rgba(2,6,23,.22);
        }
        .support-info-card {
          position: relative;
          z-index: 1;
          width: 100%;
          border: 1px solid;
          border-radius: 1.25rem;
          background: rgba(2,6,23,.82);
          padding: .85rem 1.15rem;
          text-align: center;
          backdrop-filter: blur(10px);
          animation: support-info-in 350ms ease-out both;
        }

        @keyframes support-gift-rise {
          0% { opacity: 0; transform: translateY(24vh) scale(.92); }
          18% { opacity: 1; }
          70% { opacity: 1; transform: translateY(-1vh) scale(1.10); }
          84% { transform: translateY(-3vh) scale(1.10); }
          100% { opacity: 0; transform: translateY(-9vh) scale(.86); }
        }
        @keyframes support-info-in {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes target-ring {
          0% { opacity: 0; transform: scale(.42); }
          18% { opacity: .95; }
          100% { opacity: 0; transform: scale(1.15); }
        }
        @keyframes target-spark {
          0% { opacity: 0; transform: scale(.4) translateY(14px) rotate(-15deg); }
          25% { opacity: 1; }
          100% { opacity: 0; transform: scale(1.25) translateY(-30px) rotate(18deg); }
        }
      `}</style>
    </div>
  );
}
