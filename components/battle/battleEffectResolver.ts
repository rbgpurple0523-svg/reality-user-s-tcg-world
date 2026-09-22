import type { CoordinatePreset } from '../coordinatePresets';
import type { EmotionPreset } from '../emotionPresets';
import type { BattlePreResultEffectKey } from './battleEffectTypes';

const SKILL_EFFECTS: readonly BattlePreResultEffectKey[] = [
  'skill-primary',
  'skill-product',
  'skill-difference',
  'skill-combo',
];

const A1_SKILL_EFFECTS: readonly BattlePreResultEffectKey[] = [
  'skill-total',
  'skill-response',
  'skill-burst',
  'skill-crash',
];

export function getCharacterSkillBattleEffect(
  preset: CoordinatePreset | undefined,
  skillIndex: number,
): BattlePreResultEffectKey {
  const fallback =
    preset?.code === 'a1'
      ? A1_SKILL_EFFECTS[skillIndex] ?? 'skill-total'
      : SKILL_EFFECTS[skillIndex] ?? 'skill-primary';

  const effects = preset?.battleEffects;

  if (effects && skillIndex >= 0 && skillIndex < effects.length) {
    return effects[skillIndex];
  }

  return fallback;
}

export function getSupportBattleEffect(
  _preset: EmotionPreset | undefined,
): BattlePreResultEffectKey {
  return 'support-impact';
}