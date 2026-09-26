import { AvatarCard } from '@/types/card';
import { STAT_RANKS } from './coordinatePresets';

export interface CharacterSampleCard extends AvatarCard {
  /** 対応する公式コーデ（coord_a1〜coord_c6 / coord_n1）のID */
  presetId: string;
  /** 仮カードなので、ユーザー登録カードとは区別する */
  isVirtual: true;
  /** コーデに設定されている4つのデフォルト技名 */
  customSkills: [string, string, string, string];
}

const makeSkills = (code: string): [string, string, string, string] => {
  const labels: Record<string, string> = {
    hp: '情熱',
    intellect: '知性',
    dexterity: '技能',
    charm: '愛嬌',
  };

  if (code === 'n1') {
    return [
      'オールラウンド・スコア',
      '対応ステータス・スコア',
      '選択ステータス・バースト',
      'オールダウン・クラッシュ',
    ];
  }

  const rank = STAT_RANKS[code];
  if (!rank) {
    throw new Error(`Unknown coordinate code: ${code}`);
  }

  return [
    `${labels[rank[0]]}ブースト`,
    `${labels[rank[1]]}×${labels[rank[2]]}スコア`,
    `${labels[rank[0]]}対抗スコア`,
    `${labels[rank[1]]}＋${labels[rank[3]]}スコア`,
  ];
};

/**
 * エントリー前でもデッキに組み込める仮キャラカード。
 * 画像・アバター名・プロフィールURLは character_sample の実ファイルに対応。
 * 性能は必ず対応する公式コーデの値に合わせる。
 */
export const CHARACTER_SAMPLE_CARDS: CharacterSampleCard[] = [
  {
    id: 'character_sample_yukata',
    presetId: 'coord_a3',
    isVirtual: true,
    profileUrl: 'https://reality.app/user/001_yukatasan',
    userName: '浴衣さん',
    imageDataUrl: `/character_sample/${encodeURIComponent('浴衣さん.jpg')}`,
    color: '青',
    archetype: 'マッスル型',
    favoredSeason: '春',
    stats: { hp: 80, intellect: 20, dexterity: 60, charm: 40 },
    passwordHash: '',
    createdAt: '',
    updatedAt: '',
    customSkills: makeSkills('a3'),
  },
  {
    id: 'character_sample_tsundere',
    presetId: 'coord_t1',
    isVirtual: true,
    profileUrl: 'https://reality.app/user/002_tsunderesan',
    userName: 'ツンデレさん',
    imageDataUrl: `/character_sample/${encodeURIComponent('ツンデレさん.jpg')}`,
    color: '赤',
    archetype: '職人型',
    favoredSeason: '冬',
    stats: { hp: 40, intellect: 60, dexterity: 80, charm: 20 },
    passwordHash: '',
    createdAt: '',
    updatedAt: '',
    customSkills: makeSkills('t1'),
  },
  {
    id: 'character_sample_baby',
    presetId: 'coord_n1',
    isVirtual: true,
    profileUrl: 'https://reality.app/user/003_babysan',
    userName: 'ベイビーさん',
    imageDataUrl: `/character_sample/${encodeURIComponent('ベイビーさん.jpg')}`,
    color: '赤',
    archetype: 'バランス型',
    favoredSeason: '春',
    stats: { hp: 40, intellect: 40, dexterity: 40, charm: 40 },
    passwordHash: '',
    createdAt: '',
    updatedAt: '',
    customSkills: makeSkills('n1'),
  },
  {
    id: 'character_sample_police',
    presetId: 'coord_w2',
    isVirtual: true,
    profileUrl: 'https://reality.app/user/004_keisatsusan',
    userName: '警察さん',
    imageDataUrl: `/character_sample/${encodeURIComponent('警察さん.jpg')}`,
    color: '黄',
    archetype: '頭脳型',
    favoredSeason: '秋',
    stats: { hp: 60, intellect: 80, dexterity: 40, charm: 20 },
    passwordHash: '',
    createdAt: '',
    updatedAt: '',
    customSkills: makeSkills('w2'),
  },
  {
    id: 'character_sample_genki',
    presetId: 'coord_c3',
    isVirtual: true,
    profileUrl: 'https://reality.app/user/005_genkisan',
    userName: '元気さん',
    imageDataUrl: `/character_sample/${encodeURIComponent('元気さん.jpg')}`,
    color: '黄',
    archetype: 'ディーバ型',
    favoredSeason: '夏',
    stats: { hp: 20, intellect: 60, dexterity: 40, charm: 80 },
    passwordHash: '',
    createdAt: '',
    updatedAt: '',
    customSkills: makeSkills('c3'),
  },
  {
    id: 'character_sample_farmer',
    presetId: 'coord_a4',
    isVirtual: true,
    profileUrl: 'https://reality.app/user/006_noukasan',
    userName: '農家さん',
    imageDataUrl: `/character_sample/${encodeURIComponent('農家さん.jpg')}`,
    color: '青',
    archetype: 'マッスル型',
    favoredSeason: '春',
    stats: { hp: 80, intellect: 40, dexterity: 60, charm: 20 },
    passwordHash: '',
    createdAt: '',
    updatedAt: '',
    customSkills: makeSkills('a4'),
  },
];
