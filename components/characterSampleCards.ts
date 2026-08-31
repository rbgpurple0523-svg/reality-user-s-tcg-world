import { AvatarCard } from '@/types/card';

export interface CharacterSampleCard extends AvatarCard {
  /** 対応する公式コーデ（coord_a〜coord_y）のID */
  presetId: string;
  /** 仮カードなので、ユーザー登録カードとは区別する */
  isVirtual: true;
  /** コーデに設定されている4つのデフォルト技名 */
  customSkills: [string, string, string, string];
}

const makeSkills = (
  code: string,
  rank: [string, string, string, string],
): [string, string, string, string] => {
  if (code === 'y') {
    return [
      'オールラウンド・スコア',
      '対応ステータス・スコア',
      'オールアップ・バースト',
      'オールダウン・クラッシュ',
    ];
  }

  const labels: Record<string, string> = {
    hp: '体力',
    intellect: '知略',
    dexterity: '器用',
    charm: '特技',
  };

  return [
    `${labels[rank[0]]}ブースト`,
    `${labels[rank[2]]}×${labels[rank[3]]}スコア`,
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
    presetId: 'coord_e',
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
    customSkills: makeSkills('e', ['hp', 'intellect', 'dexterity', 'charm']),
  },
  {
    id: 'character_sample_tsundere',
    presetId: 'coord_o',
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
    customSkills: makeSkills('o', ['dexterity', 'hp', 'intellect', 'charm']),
  },
  {
    id: 'character_sample_baby',
    presetId: 'coord_y',
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
    customSkills: makeSkills('y', ['hp', 'intellect', 'dexterity', 'charm']),
  },
  {
    id: 'character_sample_police',
    presetId: 'coord_g',
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
    customSkills: makeSkills('g', ['intellect', 'hp', 'dexterity', 'charm']),
  },
  {
    id: 'character_sample_genki',
    presetId: 'coord_v',
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
    customSkills: makeSkills('v', ['charm', 'intellect', 'dexterity', 'hp']),
  },
  {
    id: 'character_sample_farmer',
    presetId: 'coord_c',
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
    customSkills: makeSkills('c', ['hp', 'dexterity', 'intellect', 'charm']),
  },
];
