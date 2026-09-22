import type { ColorType } from '../colorTypes';

export type BattlePreResultEffectKey =
  | 'skill-primary'
  | 'skill-product'
  | 'skill-difference'
  | 'skill-combo'
  | 'skill-total'
  | 'skill-response'
  | 'skill-burst'
  | 'skill-crash'
  | 'heal'
  | 'buff-stat'
  | 'buff-all'
  | 'debuff-stat'
  | 'debuff-all'
  | 'support-limit'
  | 'support-free'
  | 'support-impact'
  | 'draw'
  | 'mirror'
  | 'reflect'
  | 'skill-seal';

export type BattleScoreEffectKey = 'score-gauge';

export type BattleEffectIntensity = 'light' | 'medium' | 'strong';

export type BattleEffectMotion =
  | 'pulse'
  | 'orbit'
  | 'impact'
  | 'burst'
  | 'rise'
  | 'fall'
  | 'lock'
  | 'draw'
  | 'mirror'
  | 'reflect';

export type BattleEffectTarget = 'self' | 'opponent' | 'both';

export type BattleEffectDefinition = {
  key: BattlePreResultEffectKey;
  label: string;
  motion: BattleEffectMotion;
  intensity: BattleEffectIntensity;
};

export type BattleSequenceStage =
  | 'idle'
  | 'skill'
  | 'support'
  | 'resolving'
  | 'score'
  | 'normal';

export interface BattleColorFields {
  colorHex?: string;
  colorType?: ColorType;
}

export const DEFAULT_CHARACTER_COLOR_HEX = '#22D3EE';
export const DEFAULT_SUPPORT_COLOR_HEX = '#8B5CF6';

export function normalizeBattleColorHex(
  colorHex: string | undefined,
  fallback = DEFAULT_CHARACTER_COLOR_HEX,
): string {
  if (colorHex && /^#[0-9a-fA-F]{6}$/.test(colorHex)) {
    return colorHex.toUpperCase();
  }
  return fallback;
}
