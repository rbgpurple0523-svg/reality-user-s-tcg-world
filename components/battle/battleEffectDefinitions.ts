import type {
  BattleEffectDefinition,
  BattlePreResultEffectKey,
} from './battleEffectTypes';

export const BATTLE_EFFECT_DEFINITIONS: Record<
  BattlePreResultEffectKey,
  BattleEffectDefinition
> = {
  'skill-primary': {
    key: 'skill-primary',
    label: 'プライマリーフォーカス',
    motion: 'pulse',
    intensity: 'medium',
  },
  'skill-product': {
    key: 'skill-product',
    label: 'デュアルフォーカス',
    motion: 'orbit',
    intensity: 'strong',
  },
  'skill-difference': {
    key: 'skill-difference',
    label: 'カウンターインパクト',
    motion: 'impact',
    intensity: 'strong',
  },
  'skill-combo': {
    key: 'skill-combo',
    label: 'コンボインパクト',
    motion: 'impact',
    intensity: 'strong',
  },
  'skill-total': {
    key: 'skill-total',
    label: 'オールステータスバースト',
    motion: 'burst',
    intensity: 'strong',
  },
  'skill-response': {
    key: 'skill-response',
    label: 'レスポンスミラー',
    motion: 'mirror',
    intensity: 'strong',
  },
  'skill-burst': {
    key: 'skill-burst',
    label: 'バーストチャージ',
    motion: 'rise',
    intensity: 'strong',
  },
  'skill-crash': {
    key: 'skill-crash',
    label: 'クラッシュダウン',
    motion: 'fall',
    intensity: 'strong',
  },
  heal: {
    key: 'heal',
    label: '回復',
    motion: 'rise',
    intensity: 'medium',
  },
  'buff-stat': {
    key: 'buff-stat',
    label: 'ステータス上昇',
    motion: 'rise',
    intensity: 'medium',
  },
  'buff-all': {
    key: 'buff-all',
    label: '全ステータス上昇',
    motion: 'burst',
    intensity: 'strong',
  },
  'debuff-stat': {
    key: 'debuff-stat',
    label: 'ステータス減少',
    motion: 'fall',
    intensity: 'medium',
  },
  'debuff-all': {
    key: 'debuff-all',
    label: '全ステータス減少',
    motion: 'fall',
    intensity: 'strong',
  },
  'support-limit': {
    key: 'support-limit',
    label: 'サポート使用制限',
    motion: 'lock',
    intensity: 'medium',
  },
  'support-free': {
    key: 'support-free',
    label: 'サポート使用制限解除',
    motion: 'burst',
    intensity: 'medium',
  },
  'support-impact': {
    key: 'support-impact',
    label: 'サポートアクティベート',
    motion: 'impact',
    intensity: 'medium',
  },
  draw: {
    key: 'draw',
    label: 'ドロー',
    motion: 'draw',
    intensity: 'medium',
  },
  mirror: {
    key: 'mirror',
    label: 'コピー・平均化',
    motion: 'mirror',
    intensity: 'strong',
  },
  reflect: {
    key: 'reflect',
    label: '効果反射',
    motion: 'reflect',
    intensity: 'strong',
  },
  'skill-seal': {
    key: 'skill-seal',
    label: '技封印',
    motion: 'lock',
    intensity: 'strong',
  },
};
