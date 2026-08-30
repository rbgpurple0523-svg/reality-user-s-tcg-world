// types/card.ts

export type CardColor = '赤' | '青' | '黄';
export type Archetype = 'マッスル型' | '頭脳型' | '職人型' | 'ディーバ型';
export type FavoredSeason = '春' | '夏' | '秋' | '冬';

export interface CardStats {
  hp: number;        // 体力
  intellect: number; // 智略
  dexterity: number; // 器用
  charm: number;     // 特技
}

export interface AvatarCard {
  id: string;
  profileUrl: string;
  userName: string;
  imageDataUrl: string;
  color: CardColor;
  archetype: Archetype;
  favoredSeason: FavoredSeason;
  stats: CardStats;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportCard {
  id: string;
  name: string;
  description: string;
}

export interface CardFormState {
  profileUrl: string;
  userName: string;
  imageDataUrl: string;
  color: CardColor;
  archetype: Archetype;
  editPassword: string;
}

export interface Deck {
  id: string;
  name: string;
  vanguardCardId: string | null;
  centerCardId: string | null;
  generalCardId: string | null;
  supportCardIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 1. 設定データ (Configs)
// ==========================================

export const ARCHETYPE_CONFIG: Record<Archetype, { season: FavoredSeason; stats: CardStats }> = {
  'マッスル型': { season: '春', stats: { hp: 80, intellect: 20, dexterity: 20, charm: 20 } },
  '頭脳型':     { season: '秋', stats: { hp: 20, intellect: 80, dexterity: 20, charm: 20 } },
  '職人型':     { season: '冬', stats: { hp: 20, intellect: 20, dexterity: 80, charm: 20 } },
  'ディーバ型': { season: '夏', stats: { hp: 20, intellect: 20, dexterity: 20, charm: 80 } }
};
