'use client';

import React from 'react';
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
  characterName,
  skillName,
  dialogue,
  colorHex,
  side = 'left',
}: SkillCutInProps) {
  if (!visible) return null;

  const accent = normalizeBattleColorHex(colorHex);
  const isLeft = side === 'left';

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center overflow-hidden px-3 sm:px-6"
      role="status"
      aria-live="assertive"
    >
      <div
        className={`skill-cutin-panel relative w-full max-w-3xl overflow-hidden rounded-[2rem] border ${isLeft ? 'skill-cutin-left' : 'skill-cutin-right'}`}
        style={{
          borderColor: `${accent}bb`,
          background: `linear-gradient(135deg, ${accent}ee 0%, #0f172df5 42%, #020617ee 100%)`,
          boxShadow: `0 0 2.5rem ${accent}55, 0 1.5rem 4rem rgba(2,6,23,.45)`,
        }}
      >
        <div className="relative z-10 px-6 py-6 text-center sm:px-10 sm:py-8">
          <div className="text-[9px] font-black tracking-[0.36em] text-white/55">SKILL ACTIVE</div>
          <div className="mt-2 text-xs font-black text-white/70">{characterName}</div>
          <div className="mt-2 text-3xl font-black text-white drop-shadow sm:text-5xl">{skillName}</div>
          {dialogue && (
            <div
              className="mt-5 mx-auto max-w-2xl rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-xl font-black leading-relaxed text-white shadow-lg backdrop-blur-sm sm:text-2xl"
              style={{ textShadow: `0 0 14px ${accent}88` }}
            >
              {dialogue}
            </div>
          )}
        </div>

        <div
          className="pointer-events-none absolute inset-y-0 w-1/2 skew-x-[-18deg] opacity-45"
          style={{
            [isLeft ? 'left' : 'right']: '-8%',
            background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`,
          }}
        />
      </div>

      <style jsx>{`
        .skill-cutin-panel {
          animation: skill-cutin-in 520ms cubic-bezier(.18,.8,.24,1) both;
        }
        .skill-cutin-left { transform-origin: left center; }
        .skill-cutin-right { transform-origin: right center; }
        @keyframes skill-cutin-in {
          from { opacity: 0; transform: scale(.88) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
