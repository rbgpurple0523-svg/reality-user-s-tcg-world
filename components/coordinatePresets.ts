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
  'a1',
  'a2',
  'a3',
  'a4',
  'a5',
  'a6',
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
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'c6',
  'n1'
] as const;

const STAT_LABELS: Record<StatKey, string> = {
  hp: '情熱',
  intellect: '知性',
  dexterity: '技能',
  charm: '愛嬌',
};

const STAT_RANKS: Record<string, StatKey[]> = {
  a1: ['hp', 'charm', 'dexterity', 'intellect'],
  a2: ['hp', 'charm', 'intellect', 'dexterity'],
  a3: ['hp', 'dexterity', 'charm', 'intellect'],
  a4: ['hp', 'dexterity', 'intellect', 'charm'],
  a5: ['hp', 'intellect', 'charm', 'dexterity'],
  a6: ['hp', 'intellect', 'dexterity', 'charm'],

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

  c1: ['charm', 'dexterity', 'intellect', 'hp'],
  c2: ['charm', 'dexterity', 'hp', 'intellect'],
  c3: ['charm', 'intellect', 'dexterity', 'hp'],
  c4: ['charm', 'intellect', 'hp', 'dexterity'],
  c5: ['charm', 'hp', 'dexterity', 'intellect'],
  c6: ['charm', 'hp', 'intellect', 'dexterity'],

  n1: ['hp', 'intellect', 'dexterity', 'charm'],
};

const STATS_BY_CODE: Record<
  string,
  [number, number, number, number]
> = {
  a6: [80, 60, 40, 20],
  a5: [80, 60, 20, 40],
  a4: [80, 40, 60, 20],
  a2: [80, 40, 20, 60],
  a3: [80, 20, 60, 40],
  a1: [80, 20, 40, 60],

  w2: [60, 80, 40, 20],
  w1: [60, 80, 20, 40],
  t3: [60, 40, 80, 20],
  c6: [60, 40, 20, 80],
  t4: [60, 20, 80, 40],
  c5: [60, 20, 40, 80],

  w5: [40, 80, 60, 20],
  w3: [40, 80, 20, 60],
  t1: [40, 60, 80, 20],
  c4: [40, 60, 20, 80],
  t6: [40, 20, 80, 60],
  c2: [40, 20, 60, 80],

  w6: [20, 80, 60, 40],
  w4: [20, 80, 40, 60],
  t2: [20, 60, 80, 40],
  c3: [20, 60, 40, 80],
  t5: [20, 40, 80, 60],
  c1: [20, 40, 60, 80],

  n1: [40, 40, 40, 40],
};

const ARCHETYPE_BY_PRIMARY: Record<StatKey, Archetype> = {
  hp: 'マッスル型',
  intellect: '頭脳型',
  dexterity: '職人型',
  charm: 'ディーバ型',
};

const DESCRIPTIONS: Record<string, string> = {
  a6: 'バイタリティ溢れる体力に加え、的確な判断力も持ち合わせた頼れるお兄さん・お姉さん系。チームを引っ張る快活なキャラにピッタリです。 ',
  a5: 'どこまでもいける体力と知識を兼ね備え、ロマンを求め見知らぬ世界へ飛び込んでいくアクティブ派のキャラにぴったりです。',
  a4: '力仕事も軽々とこなし、作物を育てる繊細な手先も持つ頼もしい勤労系。温かみと安心感のあるキャラにぴったりです。',
  a2: '身体を動かすのが大好きで、思い立ったものを自分の手ですぐ形にしてしまうアクティブ＆クリエイティブなキャラにぴったりです。',
  a3: '凛としたタフな軸を持ちつつ、見事な表現力・特技で周りを魅了する和風美人や華やかなステージキャラにぴったりです。',
  a1: 'パワフルな体力をベースに、ダイナミックなパフォーマンスで会場を熱狂させるバイブス高めなキャラにぴったりです。',
  w2: '真実を見抜く高い知性と、いざという時のアクションをこなせるフィジカルを両立したクールでカッコいい頭脳派キャラにぴったりです。',
  w1: '机上の理論だけでなく、自ら現地へ足を出向いて歴史や謎を解き明かす行動派のインテリキャラにぴったりです。',
  t3: '計算高さと隙のない器用さを併せ持ち、どんな仕事もサラッとこなしてしまうスマート＆ハイエンドなキャラにぴったりです。',
  c6: '頭脳と器用さを駆使して高度な処理やトリックを繰り出す、ミステリアスで知的な戦略家タイプのキャラにぴったりです。',
  t4: '知識と鋭い表現力を掛け合わせ、言葉やパフォーマンスで相手を鮮やかに納得させる知性派エンターテイナーのキャラにぴったりです。',
  c5: '人の心を読み解く知性と、引き込まれるような独特の特技でファンを魅了する、ちょっぴり怪しげな魅力を持つキャラにぴったりです。',
  w5: '体力と手先の器用さで大きな機械や乗り物を乗りこなしたり、サクっと修理したりできてしまう、頼りがいのあるエンジニアキャラにぴったりです。',
  w3: '身体の使い方が非常にうまく、アクロバティックな技を軽々とこなすフットワークの軽いキャラにぴったりです。',
  t1: '繊細な手先と計算された工夫を凝らす技巧派。ツンツンしつつも心の中では緻密に物事を考えている可愛らしさのあるキャラにぴったりです。',
  c4: '観客の心理を誘導する頭脳と、鮮やかな手さばきで驚きを提供するテクニカルなアーティストキャラにぴったりです。',
  t6: 'トレンドを感じ取るセンスと思いを形にする確かな技術力で、みんなを素敵に変身させるオシャレなキャラにぴったりです。',
  c2: '細部までこだわり抜いた技術とオリジナリティ溢れる特技で、独自の世界観を作り上げる芸術家タイプのキャラにぴったりです。',
  w6: '圧倒的な天性の輝きと、ステージを駆け回るスタミナでみんなに元気を届ける明るいキャラにぴったりです。',
  w4: '存在感あふれるパフォーマンスとタフさで場を盛り上げる、ノリが良くて愛されやすいストリート系キャラにぴったりです。',
  t2: '喋りや魅せ方の才能と、リスナーを楽しませるクレバーさを持った司会・実況者ポジションのキャラにぴったりです。',
  c3: '圧倒的なパフォーマンス力と、魅せ方を熟知した賢さを併せ持ち、会場を一瞬で自分の世界に引き込むカリスマ的なキャラにぴったりです。',
  t5: '時には独自の世界観を解き放ちつつ、時には地道な道具作りやマネジメントも巧みにこなせるマルチ才能タイプのキャラにぴったりです。',
  c1: '唯一無二のセンスと器用さを併せ持ち、枠にとらわれない発想でファンを魅了する天才肌のキャラにぴったりです。',
  n1: '特定の属性や肩書に偏らず自分の感性のままに生きる、ニュートラルで可能性に満ちたキャラにぴったりです。',
};

const skillNamesFor = (
  code: string,
): [string, string, string, string] => {
  if (code === 'n1') {
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
    `${STAT_LABELS[rank[1]]}＋${STAT_LABELS[rank[2]]}スコア`,
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
    code === 'n1'
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
  if (code === 'n1') {
    return [
      '自身のありのままの魅力を素直に押し出すスキル［使用時の全ステータス合計×10スコア］',
      '相手に合わせて自身の強みを見せつけるスキル［（使用時の自分の任意のステータス−相手の対応ステータス）×40スコア］',
      '自身の魅せるスタイルを自在に変えられるスキル［使用時の任意のステータス×10スコア＆その基礎ステータスを倍にする、2回まで］',
      '自身の一番の魅力がより引き立つ状況を作るスキル［使用時の低い方から2つのステータスを足し合わせた値×10スコア＆相手の全基礎ステータス×25%ダウン、1回のみ］',
    ];
  }

  const rank = STAT_RANKS[code];
  const first = STAT_LABELS[rank[0]];
  const second = STAT_LABELS[rank[1]];
  const third = STAT_LABELS[rank[2]];
  const fourth = STAT_LABELS[rank[3]];

  return [
    `自身の一番の魅力を素直に押し出すスキル［使用時の${first}×20スコア］`,
    `自身の二番目・三番目の魅力を足し合わせ、新しい価値を生み出すスキル［使用時の（${second}＋${third}）×15スコア］`,
    `自身の一番の魅力で力量の差を見せつけるスキル［（使用時の自分の${first}−相手の${first}）×40スコア］`,
    `自身の一番の魅力がより引き立つ状況を作るスキル［（使用時の${third}＋${fourth}）×10スコア＆相手の${first}を50%ダウン、1回のみ］`,
  ];
};

export const COORDINATE_PRESETS: CoordinatePreset[] =
  COORD_CODES.map((code) => {
    const [hp, intellect, dexterity, charm] =
      STATS_BY_CODE[code];

    return {
      id: `coord_${code}`,
      code,
      name: `コーデ ${code === 'n1' ? 'N-1' : code[0].toUpperCase() + '-' + code.slice(1)}`,
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
        code === 'n1'
          ? '情熱＝知性＝技能＝愛嬌'
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
