'use client';

import React, { useEffect, useState } from 'react';
import { normalizeBattleColorHex } from './battleEffectTypes';

interface ScoreOrbAnimationProps {
  visible: boolean;
  amount: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  colorHex?: string;
  durationMs?: number;
  onComplete?: () => void;
}

export default function ScoreOrbAnimation({
  visible,
  amount,
  fromX,
  fromY,
  toX,
  toY,
  colorHex,
  durationMs = 900,
  onComplete,
}: ScoreOrbAnimationProps) {
  const [active, setActive] = useState(false);
  const accent = normalizeBattleColorHex(colorHex);

  useEffect(() => {
    if (!visible) {
      setActive(false);
      return;
    }

    setActive(true);
    const timer = window.setTimeout(() => {
      setActive(false);
      onComplete?.();
    }, durationMs);

    return () => window.clearTimeout(timer);
  }, [visible, durationMs, onComplete]);

  if (!active) return null;

  const dx = toX - fromX;
  const dy = toY - fromY;

  return (
    <div className="pointer-events-none fixed inset-0 z-[90] overflow-hidden">
      <div
        className="score-orb-path"
        style={{
          left: fromX,
          top: fromY,
          ['--orb-dx' as string]: `${dx}px`,
          ['--orb-dy' as string]: `${dy}px`,
          ['--orb-color' as string]: accent,
          animationDuration: `${durationMs}ms`,
        }}
      >
        <div className="score-orb-glow" />
        <div className="score-orb-core" />
        <div className="score-orb-value">+{amount}</div>
      </div>

      <style jsx>{`
        .score-orb-path {
          position: absolute;
          width: 28px;
          height: 28px;
          transform: translate(-50%, -50%);
          animation-name: score-orb-flight;
          animation-timing-function: cubic-bezier(.2,.72,.32,1);
          animation-fill-mode: both;
        }
        .score-orb-glow {
          position: absolute;
          inset: -22px;
          border-radius: 9999px;
          background: var(--orb-color);
          filter: blur(16px);
          opacity: .55;
        }
        .score-orb-core {
          position: absolute;
          inset: 4px;
          border-radius: 9999px;
          background: radial-gradient(circle at 35% 35%, white 0 18%, var(--orb-color) 48%, transparent 72%);
          box-shadow: 0 0 18px var(--orb-color), 0 0 42px var(--orb-color);
        }
        .score-orb-value {
          position: absolute;
          left: 50%;
          top: -34px;
          transform: translateX(-50%);
          white-space: nowrap;
          color: white;
          font-size: 14px;
          font-weight: 900;
          text-shadow: 0 0 7px var(--orb-color), 0 2px 3px rgba(0,0,0,.45);
        }
        @keyframes score-orb-flight {
          0% {
            transform: translate(-50%, -50%) scale(.55);
            opacity: 0;
          }
          12% {
            transform: translate(-50%, -50%) scale(1.12);
            opacity: 1;
          }
          78% {
            transform: translate(calc(-50% + var(--orb-dx) * .82), calc(-50% + var(--orb-dy) * .82)) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(calc(-50% + var(--orb-dx)), calc(-50% + var(--orb-dy))) scale(.76);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
