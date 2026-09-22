'use client';

import React from 'react';
import { BATTLE_EFFECT_DEFINITIONS } from './battleEffectDefinitions';
import { normalizeBattleColorHex } from './battleEffectTypes';
import type { BattlePreResultEffectKey } from './battleEffectTypes';

interface SkillCutInProps {
  visible: boolean;
  effectKey?: BattlePreResultEffectKey;
  characterName: string;
  skillName: string;
  dialogue?: string;
  colorHex?: string;
  side?: 'left' | 'right';
}

export default function SkillCutIn({
  visible,
  effectKey,
  characterName,
  skillName,
  dialogue,
  colorHex,
  side = 'left',
}: SkillCutInProps) {
  if (!visible) return null;

  const accent = normalizeBattleColorHex(colorHex);
  const isLeft = side === 'left';
  const definition = effectKey ? BATTLE_EFFECT_DEFINITIONS[effectKey] : undefined;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] overflow-hidden"
      role="status"
      aria-live="assertive"
    >
      <div
        className={`skill-cutin-panel relative mx-auto max-w-5xl px-5 py-4 sm:px-8 sm:py-5 ${isLeft ? 'skill-cutin-left' : 'skill-cutin-right'}`}
        style={{
          background: `linear-gradient(135deg, ${accent}f2, #0f172df5 55%, transparent)`,
          borderTop: `2px solid ${accent}`,
          boxShadow: `0 -1rem 3rem ${accent}33`,
        }}
      >
        <div className="relative z-10 max-w-3xl">
          <div
            className="text-[10px] font-black tracking-[0.28em] uppercase"
            style={{ color: accent }}
          >
            SKILL ACTIVE
          </div>
          <div className="mt-1 text-xl font-black text-white sm:text-3xl">
            {skillName}
          </div>
          <div className="mt-1 text-xs font-bold text-white/80 sm:text-sm">
            {characterName}
          </div>
          {definition && (
            <div className="mt-1 text-[10px] font-black" style={{ color: accent }}>
              {definition.label}
            </div>
          )}
          {dialogue && (
            <div className="mt-3 inline-block max-w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-black text-white backdrop-blur-sm sm:text-base">
              {dialogue}
            </div>
          )}
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 w-[42%] skew-x-[-18deg] opacity-70"
          style={{
            [isLeft ? 'left' : 'right']: '-8%',
            background: `linear-gradient(90deg, transparent, ${accent}44, transparent)`,
          }}
        />
      </div>

      <style jsx>{`
        .skill-cutin-panel {
          animation: skill-cutin-in 480ms cubic-bezier(.18,.8,.24,1) both;
        }
        .skill-cutin-left {
          clip-path: polygon(0 18%, 100% 0, 94% 100%, 0 100%);
        }
        .skill-cutin-right {
          clip-path: polygon(6% 0, 100% 18%, 100% 100%, 0 100%);
        }
        @keyframes skill-cutin-in {
          from {
            opacity: 0;
            transform: translateY(55px) scale(1.03);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
