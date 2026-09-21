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
}

const COORD_CODES = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
] as const;

const STAT_LABELS: Record<StatKey, string> = {
  hp: '体力',
  intellect: '知略',
  dexterity: '器用',
  charm: '特技',
};

const STAT_RANKS: Record<string, StatKey[]> = {
  a: ['hp', 'intellect', 'dexterity', 'charm'],
  b: ['hp', 'intellect', 'charm', 'dexterity'],
  c: ['hp', 'dexterity', 'intellect', 'charm'],
  d: ['hp', 'dexterity', 'charm', 'intellect'],
  e: ['hp', 'charm', 'intellect', 'dexterity'],
  f: ['hp', 'charm', 'dexterity', 'intellect'],

  g: ['intellect', 'hp', 'dexterity', 'charm'],
  h: ['intellect', 'hp', 'charm', 'dexterity'],
  i: ['intellect', 'dexterity', 'hp', 'charm'],
  j: ['intellect', 'dexterity', 'charm', 'hp'],
  k: ['intellect', 'charm', 'hp', 'dexterity'],
  l: ['intellect', 'charm', 'dexterity', 'hp'],

  m: ['dexterity', 'hp', 'intellect', 'charm'],
  n: ['dexterity', 'hp', 'charm', 'intellect'],
  o: ['dexterity', 'intellect', 'hp', 'charm'],
  p: ['dexterity', 'intellect', 'charm', 'hp'],
  q: ['dexterity', 'charm', 'hp', 'intellect'],
  r: ['dexterity', 'charm', 'intellect', 'hp'],

  s: ['charm', 'hp', 'intellect', 'dexterity'],
  t: ['charm', 'hp', 'dexterity', 'intellect'],
  u: ['charm', 'intellect', 'hp', 'dexterity'],
  v: ['charm', 'intellect', 'dexterity', 'hp'],
  w: ['charm', 'dexterity', 'hp', 'intellect'],
  x: ['charm', 'dexterity', 'intellect', 'hp'],

  y: ['hp', 'intellect', 'dexterity', 'charm'],
};

const STATS_BY_CODE: Record<
  string,
  [number, number, number, number]
> = {
  a: [80, 60, 40, 20],
  b: [80, 60, 20, 40],
  c: [80, 40, 60, 20],
  d: [80, 40, 20, 60],
  e: [80, 20, 60, 40],
  f: [80, 20, 40, 60],

  g: [60, 80, 40, 20],
  h: [60, 80, 20, 40],
  i: [60, 40, 80, 20],
  j: [60, 40, 20, 80],
  k: [60, 20, 80, 40],
  l: [60, 20, 40, 80],

  m: [40, 80, 60, 20],
  n: [40, 80, 20, 60],
  o: [40, 60, 80, 20],
  p: [40, 60, 20, 80],
  q: [40, 20, 80, 60],
  r: [40, 20, 60, 80],

  s: [20, 80, 60, 40],
  t: [20, 80, 40, 60],
  u: [20, 60, 80, 40],
  v: [20, 60, 40, 80],
  w: [20, 40, 80, 60],
  x: [20, 40, 60, 80],

  y: [40, 40, 40, 40],
};

const ARCHETYPE_BY_PRIMARY: Record<
  StatKey,
  Archetype
> = {
  hp: 'マッスル型',
  intellect: '頭脳型',
  dexterity: '職人型',
  charm: 'ディーバ型',
};

const DESCRIPTIONS: Record<string, string> = {
  a: 'バイタリティ溢れる体力に加え、的確な判断力も持ち合わせた頼れるお兄さん・お姉さん系。チームを引っ張る快活なキャラにピッタリです。 ',
  b: 'どこまでもいける体力と知識を兼ね備え、ロマンを求め見知らぬ世界へ飛び込んでいくアクティブ派のキャラにぴったりです。',
  c: '力仕事も軽々とこなし、作物を育てる繊細な手先も持つ頼もしい勤労系。温かみと安心感のあるキャラにぴったりです。',
  d: '身体を動かすのが大好きで、思い立ったものを自分の手ですぐ形にしてしまうアクティブ＆クリエイティブなキャラにぴったりです。',
  e: '凛としたタフな軸を持ちつつ、見事な表現力・特技で周りを魅了する和風美人や華やかなステージキャラにぴったりです。',
  f: 'パワフルな体力をベースに、ダイナミックなパフォーマンスで会場を熱狂させるバイブス高めなキャラにぴったりです。',
  g: '真実を見抜く高い知性と、いざという時のアクションをこなせるフィジカルを両立したクールでカッコいい頭脳派キャラにぴったりです。',
  h: '机上の理論だけでなく、自ら現地へ足を出向いて歴史や謎を解き明かす行動派のインテリキャラにぴったりです。',
  i: '計算高さと隙のない器用さを併せ持ち、どんな仕事もサラッとこなしてしまうスマート＆ハイエンドなキャラにぴったりです。',
  j: '頭脳と器用さを駆使して高度な処理やトリックを繰り出す、ミステリアスで知的な戦略家タイプのキャラにぴったりです。',
  k: '知識と鋭い表現力を掛け合わせ、言葉やパフォーマンスで相手を鮮やかに納得させる知性派エンターテイナーのキャラにぴったりです。',
  l: '人の心を読み解く知性と、引き込まれるような独特の特技でファンを魅了する、ちょっぴり怪しげな魅力を持つキャラにぴったりです。',
  m: '体力と手先の器用さで大きな機械や乗り物を乗りこなしたり、サクっと修理したりできてしまう、頼りがいのあるエンジニアキャラにぴったりです。',
  n: '身体の使い方が非常にうまく、アクロバティックな技を軽々とこなすフットワークの軽いキャラにぴったりです。',
  o: '繊細な手先と計算された工夫を凝らす技巧派。ツンツンしつつも心の中では緻密に物事を考えている可愛らしさのあるキャラにぴったりです。',
  p: '観客の心理を誘導する頭脳と、鮮やかな手さばきで驚きを提供するテクニカルなアーティストキャラにぴったりです。',
  q: 'トレンドを感じ取るセンスと思いを形にする確かな技術力で、みんなを素敵に変身させるオシャレなキャラにぴったりです。',
  r: '細部までこだわり抜いた技術とオリジナリティ溢れる特技で、独自の世界観を作り上げる芸術家タイプのキャラにぴったりです。',
  s: '圧倒的な天性の輝きと、ステージを駆け回るスタミナでみんなに元気を届ける明るいキャラにぴったりです。',
  t: '存在感あふれるパフォーマンスとタフさで場を盛り上げる、ノリが良くて愛されやすいストリート系キャラにぴったりです。',
  u: '喋りや魅せ方の才能と、リスナーを楽しませるクレバーさを持った司会・実況者ポジションのキャラにぴったりです。',
  v: '圧倒的なパフォーマンス力と、魅せ方を熟知した賢さを併せ持ち、会場を一瞬で自分の世界に引き込むカリスマ的なキャラにぴったりです。',
  w: '時には独自の世界観を解き放ちつつ、時には地道な道具作りやマネジメントも巧みにこなせるマルチ才能タイプのキャラにぴったりです。',
  x: '唯一無二のセンスと器用さを併せ持ち、枠にとらわれない発想でファンを魅了する天才肌のキャラにぴったりです。',
  y: '特定の属性や肩書に偏らず自分の感性のままに生きる、ニュートラルで可能性に満ちたキャラにぴったりです。',
};

const skillNamesFor = (
  code: string,
): [string, string, string, string] => {
  if (code === 'y') {
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
    `${STAT_LABELS[rank[2]]}×${STAT_LABELS[rank[3]]}スコア`,
    `${STAT_LABELS[rank[0]]}対抗スコア`,
    `${STAT_LABELS[rank[1]]}＋${STAT_LABELS[rank[3]]}スコア`,
  ];
};

const skillDescriptionsFor = (
  code: string,
): [string, string, string, string] => {
  if (code === 'y') {
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
    `${STAT_LABELS[rank[2]]}×${STAT_LABELS[rank[3]]}でスコアを獲得する。`,
    `(自分の${STAT_LABELS[rank[0]]}−相手の${STAT_LABELS[rank[0]]})×20でスコアを獲得する。`,
    `(${STAT_LABELS[rank[1]]}＋${STAT_LABELS[rank[3]]})×5でスコアを獲得し、相手の${STAT_LABELS[rank[0]]}を半減する（1回のみ）。`,
  ];
};

export const COORDINATE_PRESETS: CoordinatePreset[] =
  COORD_CODES.map((code) => {
    const [hp, intellect, dexterity, charm] =
      STATS_BY_CODE[code];

    const primary =
      STAT_RANKS[code][0];

    return {
      id: `coord_${code}`,
      code,
      name: `コーデ ${code}`,
      color: '赤',
      archetype:
        ARCHETYPE_BY_PRIMARY[primary],
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
        code === 'y'
          ? '体力＝知略＝器用＝特技'
          : STAT_RANKS[code]
              .map(
                (key) =>
                  STAT_LABELS[key],
              )
              .join(' ＞ '),
      description:
        DESCRIPTIONS[code],
    };
  });

export { STAT_LABELS, STAT_RANKS, STATS_BY_CODE };
