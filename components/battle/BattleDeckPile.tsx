'use client';

import React from 'react';
import BattleCardBack from './BattleCardBack';

interface BattleDeckPileProps {
  label: string;
  count: number;
  animationKey?: number;
  dealCount?: number;
  side?: 'self' | 'opponent';
  compact?: boolean;
}

export default function BattleDeckPile({
  label,
  count,
  animationKey = 0,
  dealCount = 0,
  side = 'self',
  compact = false,
}: BattleDeckPileProps) {
  const visibleBackCount = Math.min(3, Math.max(0, count));
  const accent = side === 'self' ? '#6366f1' : '#f43f5e';
  const cardsToAnimate = Math.max(0, Math.min(4, dealCount));
  const pileWidth = compact ? 45 : 54;
  const pileHeight = compact ? 58 : 70;
  const cardWidth = compact ? 38 : 46;
  const cardHeight = compact ? 54 : 64;

  return (
    <div
      className={`flex min-w-0 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white/90 shadow-sm ${
        compact ? 'px-1.5 py-1' : 'px-3 py-2'
      }`}
    >
      <div
        className="relative shrink-0"
        style={{ width: pileWidth, height: pileHeight }}
        aria-label={`${label} ${count}枚`}
      >
        {visibleBackCount > 0 ? (
          Array.from({ length: visibleBackCount }).map((_, index) => (
            <div
              key={`deck-${index}`}
              className="absolute left-0 top-0 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-md"
              style={{
                width: cardWidth,
                height: cardHeight,
                left: index * 2,
                top: index * 1.5,
                zIndex: index,
                transform: `rotate(${(index - 1) * 1.5}deg)`,
              }}
            >
              <BattleCardBack />
            </div>
          ))
        ) : (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-[8px] font-black text-slate-400">
            EMPTY
          </div>
        )}

        {Array.from({ length: cardsToAnimate }).map((_, index) => (
          <div
            key={`deal-${animationKey}-${index}`}
            className="battle-deal-card absolute left-0 top-0 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-xl"
            style={{
              width: cardWidth,
              height: cardHeight,
              zIndex: 20 + index,
              animationDelay: `${index * 90}ms`,
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
              animation: battle-deal 950ms cubic-bezier(.2,.72,.24,1) both;
              filter: drop-shadow(0 8px 14px rgba(15,23,42,.24));
            }

            @keyframes battle-deal {
              0% {
                opacity: 0;
                transform: translate(0, 6px) rotate(0deg) scale(.9);
              }
              12% {
                opacity: 1;
                transform: translate(4px, -2px) rotate(-2deg) scale(1);
              }
              62% {
                opacity: 1;
                transform: translate(-24px, 38px) rotate(-4deg) scale(.88);
              }
              100% {
                opacity: 0;
                transform: translate(-88px, 104px) rotate(-8deg) scale(.68);
              }
            }
          `}</style>
        )}
      </div>

      <div className="min-w-0 text-right">
        <div className={`${compact ? 'text-[8px]' : 'text-[9px]'} font-black tracking-wide text-slate-500`}>
          {label}
        </div>
        <div
          className={`${compact ? 'mt-0.5 text-lg' : 'mt-0.5 text-xl'} font-black leading-none`}
          style={{ color: accent }}
        >
          {count}
        </div>
        <div className={`${compact ? 'mt-0.5 text-[7px]' : 'mt-0.5 text-[8px]'} font-bold text-slate-400`}>
          残り
        </div>
      </div>
    </div>
  );
}
