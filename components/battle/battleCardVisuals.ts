import {
  DEFAULT_CHARACTER_COLOR_HEX,
  DEFAULT_SUPPORT_COLOR_HEX,
  normalizeBattleColorHex,
} from './battleEffectTypes';

export function getCharacterBattleColor(colorHex?: string): string {
  return normalizeBattleColorHex(colorHex, DEFAULT_CHARACTER_COLOR_HEX);
}

export function getSupportBattleColor(colorHex?: string): string {
  return normalizeBattleColorHex(colorHex, DEFAULT_SUPPORT_COLOR_HEX);
}

export function getColorGlow(colorHex: string): string {
  return `0 0 0.8rem ${colorHex}, 0 0 1.9rem ${colorHex}66`;
}
