'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  getScoreGaugeHeightRatio,
  SCORE_GAUGE_MID_SCORE,
  SCORE_GAUGE_REFERENCE_SCORE,
} from './scoreGaugeMath';

interface VerticalScoreGaugeProps {
  label: string;
  score: number;
  active?: boolean;
  side?: 'self' | 'opponent';
  compact?: boolean;
  baseHeightPx?: number;
}

function getAnimationDuration(from: number, to: number): number {
  const delta = Math.abs(to - from);
  return Math.min(850, Math.max(320, 320 + delta * 0.05));
}

export default function VerticalScoreGauge({
  label,
  score,
  active = false,
  side = 'self',
  compact = false,
  baseHeightPx = 300,
}: VerticalScoreGaugeProps) {
  const [displayScore, setDisplayScore] = useState(score);
  const displayScoreRef = useRef(score);

  useEffect(() => {
    const from = displayScoreRef.current;
    const to = Number.isFinite(score) ? score : 0;
    if (from === to) return;

    const duration = getAnimationDuration(from, to);
    const startTime = performance.now();
    let frameId = 0;

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = from + (to - from) * eased;
      displayScoreRef.current = nextValue;
      setDisplayScore(nextValue);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(animate);
      } else {
        displayScoreRef.current = to;
        setDisplayScore(to);
      }
    };

    frameId = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frameId);
  }, [score]);

  const ratio = Math.max(0, getScoreGaugeHeightRatio(displayScore));
  const heightRatio = `${ratio * 100}%`;
  const overReference = displayScore > SCORE_GAUGE_REFERENCE_SCORE;
  const accent = side === 'self' ? '#6366F1' : '#64748B';
  const trackHeight = compact ? Math.max(180, baseHeightPx * 0.8) : baseHeightPx;

  return (
    <div
      className={`flex flex-col items-center gap-1 ${compact ? 'w-9' : 'w-11'}`}
      style={{ minHeight: trackHeight + 52 }}
    >
      <div className="text-[8px] font-black tracking-wide text-slate-500">{label}</div>

      <div
        className="relative overflow-visible"
        style={{ height: trackHeight, width: compact ? 14 : 18 }}
        aria-label={`${label} ${Math.round(displayScore)}スコア`}
      >
        <div className="absolute inset-0 overflow-visible rounded-full border border-slate-200 bg-slate-100 shadow-inner" />

        <div
          className="absolute inset-x-0 bottom-0 rounded-full"
          style={{
            height: heightRatio,
            minHeight: displayScore > 0 ? 2 : 0,
            background: accent,
            boxShadow: overReference
              ? `0 0 18px ${accent}, 0 0 42px ${accent}99`
              : `0 0 10px ${accent}66`,
            transition: 'box-shadow 180ms ease-out',
          }}
        />

        <div
          className="absolute left-1/2 z-20 h-px -translate-x-1/2 bg-white/85"
          style={{ bottom: '50%', width: compact ? 24 : 32 }}
        />
        <div
          className="absolute left-1/2 z-20 h-px -translate-x-1/2 bg-white shadow-[0_0_8px_white]"
          style={{ top: -1, width: compact ? 28 : 38 }}
        />

        <div
          className="absolute z-30 whitespace-nowrap rounded-md bg-slate-950/85 px-1.5 py-0.5 text-[8px] font-black text-white shadow"
          style={{ left: compact ? 22 : 28, top: 'calc(50% - 7px)' }}
        >
          {SCORE_GAUGE_MID_SCORE}
        </div>
        <div
          className="absolute z-30 whitespace-nowrap rounded-md bg-slate-950/85 px-1.5 py-0.5 text-[8px] font-black text-white shadow"
          style={{ left: compact ? 22 : 28, top: -8 }}
        >
          {SCORE_GAUGE_REFERENCE_SCORE}
        </div>

        {overReference && (
          <div
            className="absolute left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[7px] font-black text-white shadow-lg"
            style={{
              top: -28,
              background: accent,
              boxShadow: `0 0 14px ${accent}`,
            }}
          >
            5000突破
          </div>
        )}

        {active && (
          <div
            className="absolute inset-x-[-5px] bottom-0 rounded-full border border-white/80"
            style={{ height: Math.min(100, ratio * 100) + '%' }}
          />
        )}
      </div>

      <div className={`font-black text-slate-900 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        {Math.round(displayScore)}
      </div>
    </div>
  );
}
