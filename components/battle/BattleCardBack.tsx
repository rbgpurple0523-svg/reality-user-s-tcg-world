'use client';

import React from 'react';

const CARD_BACK_SRC = "/tcg_card/RealityUser'sTGC_card_back.jpg";

interface BattleCardBackProps {
  alt?: string;
  className?: string;
}

export default function BattleCardBack({
  alt = 'カード裏面',
  className = '',
}: BattleCardBackProps) {
  return (
    <img
      src={CARD_BACK_SRC}
      alt={alt}
      draggable={false}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}
