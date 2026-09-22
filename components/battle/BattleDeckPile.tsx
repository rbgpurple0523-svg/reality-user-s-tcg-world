'use client';

import React from 'react';
import BattleCardBack from './BattleCardBack';

interface BattleDeckPileProps {
  label: string;
  count: number;
  animationKey?: number;
  dealCount?: number;
  side?: 'self' | 'opponent';
}

export default function BattleDeckPile({
  label,
  count,
  animationKey = 0,
  dealCount = 0,
  side = 'self',
}: BattleDeckPileProps) {
  const visibleBackCount = Math.min(3, Math.max(0, count));
  const accent = side === 'self' ? '#6366f1' : '#f43f5e';
  const cardsToAnimate = Math.max(0, Math.min(4, dealCount));

  return (
    <div className="flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 shadow-sm">
      <div
        className="relative shrink-0"
        style={{ width: 54, height: 70 }}
        aria-label={`${label} ${count}枚`}
      >
        {visibleBackCount > 0 ? (
          Array.from({ length: visibleBackCount }).map((_, index) => (
            <div
              key={`deck-${index}`}
              className="absolute left-0 top-0 h-[64px] w-[46px] overflow-hidden rounded-lg border border-slate-300 bg-white shadow-md"
              style={{
                left: index * 3,
                top: index * 2,
                zIndex: index,
                transform: `rotate(${(index - 1) * 1.5}deg)`,
              }}
            >
              <BattleCardBack />
            </div>
          ))
        ) : (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-[9px] font-black text-slate-400">
            EMPTY
          </div>
        )}

        {Array.from({ length: cardsToAnimate }).map((_, index) => (
          <div
            key={`deal-${animationKey}-${index}`}
            className="battle-deal-card absolute left-0 top-0 h-[64px] w-[46px] overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl"
            style={{
              zIndex: 20 + index,
              animationDelay: `${index * 20}ms`,
              ['--battle-deal-accent' as string]: accent,
            }}
          >
            <BattleCardBack />
          </div>
        ))}

        {cardsToAnimate > 0 && (
          <style jsx>{`
            .battle-deal-card {
              transform-origin: 50% 80%;
              animation: battle-deal 500ms cubic-bezier(.2,.72,.24,1) both;
              filter: drop-shadow(0 8px 14px rgba(15,23,42,.24));
            }

            @keyframes battle-deal {
              0% {
                opacity: 0;
                transform: translate(0, 6px) rotate(0deg) scale(.88);
              }
              16% {
                opacity: 1;
                transform: translate(4px, -2px) rotate(-2deg) scale(1);
              }
              68% {
                opacity: 1;
                transform: translate(40px, -12px) rotate(7deg) scale(.84);
              }
              100% {
                opacity: 0;
                transform: translate(62px, -18px) rotate(12deg) scale(.62);
              }
            }
          `}</style>
        )}
      </div>

      <div className="min-w-0">
        <div className="text-[9px] font-black tracking-wide text-slate-500">{label}</div>
        <div className="mt-0.5 text-xl font-black leading-none" style={{ color: accent }}>
          {count}
        </div>
        <div className="mt-0.5 text-[8px] font-bold text-slate-400">残り枚数</div>
      </div>
    </div>
  );
}
