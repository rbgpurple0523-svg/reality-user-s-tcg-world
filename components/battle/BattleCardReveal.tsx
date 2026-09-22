'use client';

import React from 'react';
import BattleCardBack from './BattleCardBack';
import { getColorGlow } from './battleCardVisuals';
import { normalizeBattleColorHex } from './battleEffectTypes';

interface BattleCardRevealProps {
  revealed: boolean;
  front: React.ReactNode;
  colorHex?: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  backClassName?: string;
}

export default function BattleCardReveal({
  revealed,
  front,
  colorHex,
  width = 180,
  height = 250,
  className = '',
  backClassName = '',
}: BattleCardRevealProps) {
  const accent = normalizeBattleColorHex(colorHex);

  return (
    <div
      className={`relative shrink-0 [perspective:1100px] ${className}`}
      style={{ width, height }}
    >
      <div
        className="relative h-full w-full transition-transform duration-700 ease-[cubic-bezier(.22,.61,.36,1)] [transform-style:preserve-3d]"
        style={{ transform: revealed ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        <div
          className={`absolute inset-0 overflow-hidden rounded-[1.1rem] border border-slate-300 bg-white shadow-xl [backface-visibility:hidden] ${backClassName}`}
        >
          <BattleCardBack />
        </div>

        <div
          className="absolute inset-0 overflow-hidden rounded-[1.1rem] border-2 bg-white shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)]"
          style={{
            borderColor: accent,
            boxShadow: revealed ? getColorGlow(accent) : undefined,
          }}
        >
          {front}
        </div>
      </div>
    </div>
  );
}
