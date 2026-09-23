import type { BattlePreResultEffectKey } from './battle/battleEffectTypes';
export type CardColor = '赤' | '青' | '黄';
export type Archetype =
  | 'マッスル型'
  | '頭脳型'
  | 'ディーバ型'
  | '職人型';
export type Season = '春' | '夏' | '秋' | '冬';

export type StatKey =
  | 'hp'
  | 'intellect'
  | 'dexterity'
  | 'charm';

export interface CoordinatePreset {
  id: string;
  code: string;
  name: string;
  color: CardColor;
  archetype: Archetype;
  season: Season;
  stats: {
    hp: number;
    intellect: number;
    charm: number;
    dexterity: number;
  };
  defaultSkills: [string, string, string, string];
  skillDescriptions: [string, string, string, string];
  tendency: string;
  description: string;
  battleEffects: [BattlePreResultEffectKey, BattlePreResultEffectKey, BattlePreResultEffectKey, BattlePreResultEffectKey];
}

const COORD_CODES = [
  'p1',
  'p2',
  'p3',
  'p4',
  'p5',
  'p6',
  'w1',
  'w2',
  'w3',
  'w4',
  'w5',
  'w6',
  't1',
  't2',
  't3',
  't4',
  't5',
  't6',
  's1',
  's2',
  's3',
  's4',
  's5',
  's6',
  'a1'
] as const;

const STAT_LABELS: Record<StatKey, string> = {
  hp: '体力',
  intellect: '知略',
  dexterity: '器用',
  charm: '特技',
};

const STAT_RANKS: Record<string, StatKey[]> = {
  p1: ['hp', 'charm', 'dexterity', 'intellect'],
  p2: ['hp', 'charm', 'intellect', 'dexterity'],
  p3: ['hp', 'dexterity', 'charm', 'intellect'],
  p4: ['hp', 'dexterity', 'intellect', 'charm'],
  p5: ['hp', 'intellect', 'charm', 'dexterity'],
  p6: ['hp', 'intellect', 'dexterity', 'charm'],

  w1: ['intellect', 'hp', 'charm', 'dexterity'],
  w2: ['intellect', 'hp', 'dexterity', 'charm'],
  w3: ['intellect', 'charm', 'hp', 'dexterity'],
  w4: ['intellect', 'charm', 'dexterity', 'hp'],
  w5: ['intellect', 'dexterity', 'hp', 'charm'],
  w6: ['intellect', 'dexterity', 'charm', 'hp'],

  t1: ['dexterity', 'intellect', 'hp', 'charm'],
  t2: ['dexterity', 'intellect', 'charm', 'hp'],
  t3: ['dexterity', 'hp', 'intellect', 'charm'],
  t4: ['dexterity', 'hp', 'charm', 'intellect'],
  t5: ['dexterity', 'charm', 'intellect', 'hp'],
  t6: ['dexterity', 'charm', 'hp', 'intellect'],

  s1: ['charm', 'dexterity', 'intellect', 'hp'],
  s2: ['charm', 'dexterity', 'hp', 'intellect'],
  s3: ['charm', 'intellect', 'dexterity', 'hp'],
  s4: ['charm', 'intellect', 'hp', 'dexterity'],
  s5: ['charm', 'hp', 'dexterity', 'intellect'],
  s6: ['charm', 'hp', 'intellect', 'dexterity'],

  a1: ['hp', 'intellect', 'dexterity', 'charm'],
};

const STATS_BY_CODE: Record<
  string,
  [number, number, number, number]
> = {
  p6: [80, 60, 40, 20],
  p5: [80, 60, 20, 40],
  p4: [80, 40, 60, 20],
  p2: [80, 40, 20, 60],
  p3: [80, 20, 60, 40],
  p1: [80, 20, 40, 60],

  w2: [60, 80, 40, 20],
  w1: [60, 80, 20, 40],
  t3: [60, 40, 80, 20],
  s6: [60, 40, 20, 80],
  t4: [60, 20, 80, 40],
  s5: [60, 20, 40, 80],

  w5: [40, 80, 60, 20],
  w3: [40, 80, 20, 60],
  t1: [40, 60, 80, 20],
  s4: [40, 60, 20, 80],
  t6: [40, 20, 80, 60],
  s2: [40, 20, 60, 80],

  w6: [20, 80, 60, 40],
  w4: [20, 80, 40, 60],
  t2: [20, 60, 80, 40],
  s3: [20, 60, 40, 80],
  t5: [20, 40, 80, 60],
  s1: [20, 40, 60, 80],

  a1: [40, 40, 40, 40],
};

const ARCHETYPE_BY_PRIMARY: Record<StatKey, Archetype> = {
  hp: 'マッスル型',
  intellect: '頭脳型',
  dexterity: '職人型',
  charm: 'ディーバ型',
};

const DESCRIPTIONS: Record<string, string> = {
  p6: 'バイタリティ溢れる体力に加え、的確な判断力も持ち合わせた頼れるお兄さん・お姉さん系。チームを引っ張る快活なキャラにピッタリです。 ',
  p5: 'どこまでもいける体力と知識を兼ね備え、ロマンを求め見知らぬ世界へ飛び込んでいくアクティブ派のキャラにぴったりです。',
  p4: '力仕事も軽々とこなし、作物を育てる繊細な手先も持つ頼もしい勤労系。温かみと安心感のあるキャラにぴったりです。',
  p2: '身体を動かすのが大好きで、思い立ったものを自分の手ですぐ形にしてしまうアクティブ＆クリエイティブなキャラにぴったりです。',
  p3: '凛としたタフな軸を持ちつつ、見事な表現力・特技で周りを魅了する和風美人や華やかなステージキャラにぴったりです。',
  p1: 'パワフルな体力をベースに、ダイナミックなパフォーマンスで会場を熱狂させるバイブス高めなキャラにぴったりです。',
  w2: '真実を見抜く高い知性と、いざという時のアクションをこなせるフィジカルを両立したクールでカッコいい頭脳派キャラにぴったりです。',
  w1: '机上の理論だけでなく、自ら現地へ足を出向いて歴史や謎を解き明かす行動派のインテリキャラにぴったりです。',
  t3: '計算高さと隙のない器用さを併せ持ち、どんな仕事もサラッとこなしてしまうスマート＆ハイエンドなキャラにぴったりです。',
  s6: '頭脳と器用さを駆使して高度な処理やトリックを繰り出す、ミステリアスで知的な戦略家タイプのキャラにぴったりです。',
  t4: '知識と鋭い表現力を掛け合わせ、言葉やパフォーマンスで相手を鮮やかに納得させる知性派エンターテイナーのキャラにぴったりです。',
  s5: '人の心を読み解く知性と、引き込まれるような独特の特技でファンを魅了する、ちょっぴり怪しげな魅力を持つキャラにぴったりです。',
  w5: '体力と手先の器用さで大きな機械や乗り物を乗りこなしたり、サクっと修理したりできてしまう、頼りがいのあるエンジニアキャラにぴったりです。',
  w3: '身体の使い方が非常にうまく、アクロバティックな技を軽々とこなすフットワークの軽いキャラにぴったりです。',
  t1: '繊細な手先と計算された工夫を凝らす技巧派。ツンツンしつつも心の中では緻密に物事を考えている可愛らしさのあるキャラにぴったりです。',
  s4: '観客の心理を誘導する頭脳と、鮮やかな手さばきで驚きを提供するテクニカルなアーティストキャラにぴったりです。',
  t6: 'トレンドを感じ取るセンスと思いを形にする確かな技術力で、みんなを素敵に変身させるオシャレなキャラにぴったりです。',
  s2: '細部までこだわり抜いた技術とオリジナリティ溢れる特技で、独自の世界観を作り上げる芸術家タイプのキャラにぴったりです。',
  w6: '圧倒的な天性の輝きと、ステージを駆け回るスタミナでみんなに元気を届ける明るいキャラにぴったりです。',
  w4: '存在感あふれるパフォーマンスとタフさで場を盛り上げる、ノリが良くて愛されやすいストリート系キャラにぴったりです。',
  t2: '喋りや魅せ方の才能と、リスナーを楽しませるクレバーさを持った司会・実況者ポジションのキャラにぴったりです。',
  s3: '圧倒的なパフォーマンス力と、魅せ方を熟知した賢さを併せ持ち、会場を一瞬で自分の世界に引き込むカリスマ的なキャラにぴったりです。',
  t5: '時には独自の世界観を解き放ちつつ、時には地道な道具作りやマネジメントも巧みにこなせるマルチ才能タイプのキャラにぴったりです。',
  s1: '唯一無二のセンスと器用さを併せ持ち、枠にとらわれない発想でファンを魅了する天才肌のキャラにぴったりです。',
  a1: '特定の属性や肩書に偏らず自分の感性のままに生きる、ニュートラルで可能性に満ちたキャラにぴったりです。',
};

const skillNamesFor = (
  code: string,
): [string, string, string, string] => {
  if (code === 'a1') {
    return [
      'オールラウンド・スコア',
      '対応ステータス・スコア',
      'オールアップ・バースト',
      'オールダウン・クラッシュ',
    ];
  }

  const rank = STAT_RANKS[code];

  return [
    `${STAT_LABELS[rank[0]]}ブースト`,
    `${STAT_LABELS[rank[1]]}×${STAT_LABELS[rank[2]]}スコア`,
    `${STAT_LABELS[rank[0]]}対抗スコア`,
    `${STAT_LABELS[rank[1]]}＋${STAT_LABELS[rank[3]]}スコア`,
  ];
};

const BATTLE_EFFECTS_BY_CODE: Record<
  string,
  [BattlePreResultEffectKey, BattlePreResultEffectKey, BattlePreResultEffectKey, BattlePreResultEffectKey]
> = Object.fromEntries(
  COORD_CODES.map((code) => [
    code,
    code === 'a1'
      ? ['skill-total', 'skill-response', 'skill-burst', 'skill-crash']
      : ['skill-primary', 'skill-product', 'skill-difference', 'skill-combo'],
  ]),
) as Record<
  string,
  [BattlePreResultEffectKey, BattlePreResultEffectKey, BattlePreResultEffectKey, BattlePreResultEffectKey]
>;

const skillDescriptionsFor = (
  code: string,
): [string, string, string, string] => {
  if (code === 'a1') {
    return [
      '総合値×5でスコアを獲得する。',
      '自分の対応ステータス−相手の最低ステータスを基準に×20でスコアを獲得する。',
      '100スコアを獲得し、任意のステータスを2倍にする（1回のみ）。',
      '総合値×2でスコアを獲得し、相手の全ステータスを25%減らす（1回のみ）。',
    ];
  }

  const rank = STAT_RANKS[code];

  return [
    `${STAT_LABELS[rank[0]]}×10でスコアを獲得する。`,
    `${STAT_LABELS[rank[1]]}×${STAT_LABELS[rank[2]]}でスコアを獲得する。`,
    `(自分の${STAT_LABELS[rank[0]]}−相手の${STAT_LABELS[rank[0]]})×20でスコアを獲得する。`,
    `(${STAT_LABELS[rank[1]]}＋${STAT_LABELS[rank[3]]})×5でスコアを獲得し、相手の${STAT_LABELS[rank[0]]}を半減する（1回のみ）。`,
  ];
};

export const COORDINATE_PRESETS: CoordinatePreset[] =
  COORD_CODES.map((code) => {
    const [hp, intellect, dexterity, charm] =
      STATS_BY_CODE[code];

    return {
      id: `coord_${code}`,
      code,
      name: `コーデ ${code === 'a1' ? 'A-1' : code[0].toUpperCase() + '-' + code.slice(1)}`,
      color: '赤',
      archetype: ARCHETYPE_BY_PRIMARY[STAT_RANKS[code][0]],
      season: '春',
      stats: {
        hp,
        intellect,
        dexterity,
        charm,
      },
      defaultSkills:
        skillNamesFor(code),
      skillDescriptions:
        skillDescriptionsFor(code),
      tendency:
        code === 'a1'
          ? '体力＝知略＝器用＝特技'
          : STAT_RANKS[code]
              .map(
                (key) =>
                  STAT_LABELS[key],
              )
              .join(' ＞ '),
      description:
        DESCRIPTIONS[code],
      battleEffects:
        BATTLE_EFFECTS_BY_CODE[code],
    };
  });

export { STAT_LABELS, STAT_RANKS, STATS_BY_CODE };
