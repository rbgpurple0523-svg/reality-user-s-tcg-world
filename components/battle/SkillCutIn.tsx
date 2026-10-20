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

/**
 * Skill cut-in timeline (total 3 seconds):
 * 0.0s: show the empty panel
 * 0.5s: dialogue begins, each character fades in smoothly over 1.5s
 * 2.0s: character-card glow and golden skill-title flash + SE
 */
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

  useEffect(() => {
    if (!visible) {
      setPhase(0);
      return;
    }

    setPhase(0);
    const dialogueTimer = window.setTimeout(() => setPhase(1), 500);
    const titleTimer = window.setTimeout(() => {
      setPhase(2);
      playSe(seKey);
    }, 2000);

    return () => {
      window.clearTimeout(dialogueTimer);
      window.clearTimeout(titleTimer);
    };
  }, [visible, seKey]);

  if (!visible) return null;

  const accent = normalizeBattleColorHex(colorHex);
  const isLeft = side === 'left';
  const voice = dialogue ?? '';
  const voiceDuration = 1500;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[80] overflow-hidden"
      role="status"
      aria-live="assertive"
      style={{ '--skill-accent': accent } as React.CSSProperties}
    >
      {/* No full-screen dimming: preserve the normal battle scene. */}
      <div className="absolute inset-0 flex items-center justify-center px-3 sm:px-6">
        <div
          className={`skill-cutin-panel relative w-full max-w-3xl overflow-hidden rounded-[2rem] border ${isLeft ? 'skill-cutin-left' : 'skill-cutin-right'}`}
          style={{
            borderColor: `${accent}bb`,
            background: `linear-gradient(135deg, ${accent}e8 0%, #0f172df5 42%, #020617ee 100%)`,
            boxShadow: `0 0 2.5rem ${accent}55, 0 1.5rem 4rem rgba(2,6,23,.45)`,
          }}
        >
          <div className="relative z-10 px-6 py-6 text-center sm:px-10 sm:py-8">
            <div className="text-[9px] font-black tracking-[0.36em] text-white/55 transition-opacity duration-300" style={{ opacity: phase >= 1 ? 1 : 0 }}>SKILL ACTIVE</div>
            <div
              className="mt-2 text-xs font-black text-white/70 transition-opacity duration-300"
              style={{ opacity: phase >= 1 ? 1 : 0 }}
            >
              {characterName}
            </div>
            <div
              className={`skill-title mt-2 text-3xl font-black sm:text-5xl ${phase >= 2 ? 'skill-title-reveal' : ''}`}
              style={{
                color: phase >= 2 ? '#ffffff' : 'transparent',
                textShadow: phase >= 2
                  ? '0 0 2px rgba(255,255,255,.7), 0 2px 3px rgba(0,0,0,.8)'
                  : 'none',
                opacity: phase >= 2 ? 1 : 0,
                transition: 'color 650ms ease, text-shadow 650ms ease, opacity 250ms ease',
              }}
            >
              {phase >= 2 ? skillName : '\u00a0'}
            </div>
            {voice && (
              <div
                className="mx-auto mt-5 min-h-[3.5rem] max-w-2xl rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-xl font-black leading-relaxed text-white shadow-lg backdrop-blur-sm sm:text-2xl"
                style={{ textShadow: `0 0 14px ${accent}88` }}
                aria-label={phase >= 1 ? voice : undefined}
              >
                {phase >= 1 && voice.split('').map((character, index) => (
                  <span
                    key={`${index}-${character}`}
                    className="skill-voice-character"
                    style={{
                      animationDelay: `${(index / Math.max(voice.length, 1)) * voiceDuration}ms`,
                      animationDuration: `${Math.max(90, (voiceDuration / Math.max(voice.length, 1)) * 1.8)}ms`,
                    }}
                  >
                    {character === ' ' ? '\u00a0' : character}
                  </span>
                ))}
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

      {/* A clear frame and burst are aligned with the active side of the battle board. */}
      <div
        className={`skill-card-highlight ${isLeft ? 'skill-card-highlight-left' : 'skill-card-highlight-right'} ${phase >= 2 ? 'skill-card-highlight-active' : ''}`}
        style={{ borderColor: `${accent}ff`, '--skill-accent': accent } as React.CSSProperties}
        aria-hidden="true"
      >
        <span className="skill-card-highlight-corner skill-card-highlight-corner-tl" />
        <span className="skill-card-highlight-corner skill-card-highlight-corner-tr" />
        <span className="skill-card-highlight-corner skill-card-highlight-corner-bl" />
        <span className="skill-card-highlight-corner skill-card-highlight-corner-br" />
      </div>

      <style jsx>{`
        .skill-cutin-panel {
          animation: skill-cutin-in 420ms cubic-bezier(.18,.8,.24,1) both;
        }
        .skill-cutin-left { transform-origin: left center; }
        .skill-cutin-right { transform-origin: right center; }
        .skill-voice-character {
          display: inline-block;
          opacity: 0;
          filter: blur(2px);
          animation-name: skill-voice-fade;
          animation-timing-function: ease-out;
          animation-fill-mode: forwards;
        }
        .skill-title-reveal { animation: skill-title-flash 650ms ease-out both; }
        .skill-card-highlight {
          position: absolute;
          top: 50%;
          width: clamp(150px, 22vw, 310px);
          height: clamp(220px, 43vh, 430px);
          border: 2px solid transparent;
          border-radius: 22px;
          opacity: 0;
          transform: translateY(-50%) scale(.94);
          transition: opacity 180ms ease, transform 220ms ease;
        }
        .skill-card-highlight-left { left: clamp(10px, 5vw, 90px); }
        .skill-card-highlight-right { right: clamp(10px, 5vw, 90px); }
        .skill-card-highlight-active {
          opacity: 1;
          transform: translateY(-50%) scale(1);
          box-shadow: 0 0 0 3px rgba(255,255,255,.88), 0 0 18px 8px #fff6a5, 0 0 48px 18px var(--skill-accent), inset 0 0 30px rgba(255,245,170,.45);
          animation: skill-card-burst 850ms ease-out both;
        }
        .skill-card-highlight-corner {
          position: absolute;
          width: 24px;
          height: 24px;
          border: 4px solid #fff8b0;
          filter: drop-shadow(0 0 5px #fff) drop-shadow(0 0 12px #ffbf00);
        }
        .skill-card-highlight-corner-tl { top: -3px; left: -3px; border-right: 0; border-bottom: 0; border-radius: 9px 0 0; }
        .skill-card-highlight-corner-tr { top: -3px; right: -3px; border-left: 0; border-bottom: 0; border-radius: 0 9px 0 0; }
        .skill-card-highlight-corner-bl { bottom: -3px; left: -3px; border-right: 0; border-top: 0; border-radius: 0 0 0 9px; }
        .skill-card-highlight-corner-br { bottom: -3px; right: -3px; border-left: 0; border-top: 0; border-radius: 0 0 9px; }
        @keyframes skill-cutin-in {
          from { opacity: 0; transform: scale(.94) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes skill-voice-fade {
          0% { opacity: 0; filter: blur(2px); transform: translateY(2px); }
          100% { opacity: 1; filter: blur(0); transform: translateY(0); }
        }
        @keyframes skill-title-flash {
          0% { color: #fff7a8; text-shadow: 0 0 22px #fff, 0 0 42px #ffd700, 0 0 64px #ffbf00; }
          100% { color: #fff; text-shadow: 0 0 2px rgba(255,255,255,.7), 0 2px 3px rgba(0,0,0,.8); }
        }
        @keyframes skill-card-burst {
          0% { filter: brightness(1); }
          25% { filter: brightness(1.8); }
          100% { filter: brightness(1); }
        }
        @media (max-width: 640px) {
          .skill-card-highlight { width: clamp(120px, 32vw, 190px); height: clamp(180px, 34vh, 300px); }
          .skill-card-highlight-left { left: 2px; }
          .skill-card-highlight-right { right: 2px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .skill-voice-character, .skill-title-reveal, .skill-card-highlight-active { animation-duration: 1ms !important; }
        }
      `}</style>
    </div>
  );
}
