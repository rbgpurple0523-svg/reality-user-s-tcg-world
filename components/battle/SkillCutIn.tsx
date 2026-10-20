'use client';

import React, { useEffect, useState } from 'react';
import { playSe } from '@/components/audio';
import { normalizeBattleColorHex } from './battleEffectTypes';
import type { BattlePreResultEffectKey } from './battleEffectTypes';

type SkillSeKey = 'skill123' | 'skill4';

interface SkillCutInProps {
  visible: boolean;
  effectKey?: BattlePreResultEffectKey;
  characterName: string;
  skillName: string;
  dialogue?: string;
  colorHex?: string;
  side?: 'left' | 'right';
  seKey?: SkillSeKey;
}

export default function SkillCutIn({
  visible,
  characterName,
  skillName,
  dialogue,
  colorHex,
  side = 'left',
  seKey = 'skill123',
}: SkillCutInProps) {
  const [phase, setPhase] = useState(0);
  const [typedDialogue, setTypedDialogue] = useState('');

  useEffect(() => {
    if (!visible) {
      setPhase(0);
      setTypedDialogue('');
      return;
    }

    setPhase(0);
    setTypedDialogue('');
    const spotlightTimer = window.setTimeout(() => setPhase(1), 500);
    const titleTimer = window.setTimeout(() => {
      setPhase(2);
      playSe(seKey);
    }, 1000);
    let typingTimer: number | undefined;
    const typingStartTimer = window.setTimeout(() => {
      if (!dialogue) return;
      let index = 0;
      const interval = Math.max(20, Math.min(55, 2000 / Math.max(dialogue.length, 1)));
      typingTimer = window.setInterval(() => {
        index += 1;
        setTypedDialogue(dialogue.slice(0, index));
        if (index >= dialogue.length && typingTimer !== undefined) {
          window.clearInterval(typingTimer);
          typingTimer = undefined;
        }
      }, interval);
    }, 1000);

    return () => {
      window.clearTimeout(spotlightTimer);
      window.clearTimeout(titleTimer);
      window.clearTimeout(typingStartTimer);
      if (typingTimer !== undefined) window.clearInterval(typingTimer);
    };
  }, [visible, dialogue, seKey]);

  if (!visible) return null;

  const accent = normalizeBattleColorHex(colorHex);
  const isLeft = side === 'left';
  const spotlightX = isLeft ? '27%' : '73%';

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] overflow-hidden" role="status" aria-live="assertive">
      <div className="absolute inset-0 bg-slate-950" style={{ opacity: phase >= 0 ? 0.72 : 0, transition: 'opacity 500ms ease' }} />

      <div
        className="absolute inset-0"
        style={{
          opacity: phase >= 1 ? 1 : 0,
          transition: 'opacity 500ms ease',
          background: `radial-gradient(ellipse 25% 48% at ${spotlightX} 50%, ${accent}66 0%, ${accent}24 35%, transparent 72%)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          opacity: phase >= 1 ? 0.75 : 0,
          transition: 'opacity 500ms ease',
          background: `radial-gradient(ellipse 17% 36% at ${spotlightX} 50%, transparent 20%, ${accent}22 58%, transparent 100%)`,
          mixBlendMode: 'screen',
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center overflow-hidden px-3 sm:px-6">
        <div
          className={`skill-cutin-panel relative w-full max-w-3xl overflow-hidden rounded-[2rem] border ${isLeft ? 'skill-cutin-left' : 'skill-cutin-right'}`}
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2 ? 'scale(1) translateY(0)' : 'scale(.92) translateY(10px)',
            transition: 'opacity 300ms ease, transform 420ms cubic-bezier(.18,.8,.24,1)',
            borderColor: `${accent}bb`,
            background: `linear-gradient(135deg, ${accent}ee 0%, #0f172df5 42%, #020617ee 100%)`,
            boxShadow: `0 0 2.5rem ${accent}55, 0 1.5rem 4rem rgba(2,6,23,.65)`,
          }}
        >
          <div className="relative z-10 px-6 py-6 text-center sm:px-10 sm:py-8">
            <div className="text-[9px] font-black tracking-[0.36em] text-white/55">SKILL ACTIVE</div>
            <div className="mt-2 text-xs font-black text-white/70">{characterName}</div>
            <div className="mt-2 text-3xl font-black text-white drop-shadow sm:text-5xl">{phase >= 2 ? skillName : ''}</div>
            {dialogue && (
              <div
                className="mx-auto mt-5 min-h-[3.5rem] max-w-2xl rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-xl font-black leading-relaxed text-white shadow-lg backdrop-blur-sm sm:text-2xl"
                style={{ textShadow: `0 0 14px ${accent}88` }}
              >
                {typedDialogue}
                {phase >= 2 && typedDialogue.length < dialogue.length && <span className="skill-caret">▌</span>}
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
      </div>

      <style jsx>{`
        .skill-cutin-left { transform-origin: left center; }
        .skill-cutin-right { transform-origin: right center; }
        .skill-caret { display: inline-block; margin-left: 2px; animation: caret-blink 700ms steps(2, start) infinite; }
        @keyframes caret-blink { to { visibility: hidden; } }
      `}</style>
    </div>
  );
}
