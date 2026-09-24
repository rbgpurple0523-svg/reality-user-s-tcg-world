// サポートカードに紐づく公式エモーション定義。
// エモーションの性能はここで固定し、ユーザーが自由に性能を作成・変更することはできない。

export type EmotionTarget = '自分' | '相手' | '自分・相手';
export type EmotionDuration = '一時' | '永続';

export type EmotionAxisKey =
  | 'challenge'
  | 'compassion'
  | 'temptation'
  | 'freedom'
  | 'philosophy';

export type EmotionEffectCategory =
  | '情熱'
  | '知性'
  | '技能'
  | '愛嬌'
  | '全ステータス'
  | 'スコア'
  | 'サポートカード使用数'
  | 'ドロー'
  | 'ステータスコピー・平均化'
  | '効果反射'
  | '技封印';

export interface EmotionPreset {
  id: string;
  name: string;
  duration: EmotionDuration;
  target: EmotionTarget;
  effectCategory: EmotionEffectCategory;
  statEffect: string;
  effectAmount?: string;
  description: string;
  note?: string;
  emotionPhrase: string;
  emotionAxes: Record<EmotionAxisKey, number>;
}


export type EmotionPerformanceBadge = {
  label: string;
  description: string;
};

export function getEmotionPerformanceBadges(
  preset: EmotionPreset,
): {
  target: EmotionPerformanceBadge;
  duration: EmotionPerformanceBadge;
  effect: EmotionPerformanceBadge;
} {
  const targetDescription =
    preset.target === '自分'
      ? '自分を対象にする効果'
      : preset.target === '相手'
        ? '相手を対象にする効果'
        : '自分と相手を対象にする効果';

  const durationDescription =
    preset.duration === '一時'
      ? '一時的な効果（次の自分のターンまで）'
      : '永続的な効果（このクラス中）';

  const effectLabel = preset.effectAmount
    ? `${preset.effectCategory} ${preset.effectAmount}`
    : preset.effectCategory;

  return {
    target: {
      label: preset.target === '自分・相手' ? '両方' : preset.target,
      description: targetDescription,
    },
    duration: {
      label: preset.duration,
      description: durationDescription,
    },
    effect: {
      label: effectLabel,
      description: preset.statEffect,
    },
  };
}


export function getEmotionFlavorText(preset: EmotionPreset): string {
  const [mainText] = preset.emotionPhrase.split('、', 1);
  return mainText.trim() || preset.emotionPhrase;
}

export const EMOTION_PRESETS: EmotionPreset[] = [
  {
    id: 'emo_01', name: '差し入れのドリンク', duration: '一時', target: '自分',
    emotionPhrase: '誰かを元気づけたい、というあなたに',
    emotionAxes: { challenge: 5, compassion: 95, temptation: 0, freedom: 0, philosophy: 0 },
    effectCategory: '情熱', statEffect: '情熱増加', effectAmount: '+20',
    description: '自分の情熱を増加させる。',
  },
  {
    id: 'emo_02', name: '一冊の本', duration: '一時', target: '自分',
    emotionPhrase: '一緒に考えるのが好き、というあなたに',
    emotionAxes: { challenge: 5, compassion: 55, temptation: 0, freedom: 5, philosophy: 35 },
    effectCategory: '知性', statEffect: '知性増加', effectAmount: '+20',
    description: '自分の知性を増加させる。',
  },
  {
    id: 'emo_03', name: 'ファンアート', duration: '一時', target: '自分',
    emotionPhrase: '思いを形で伝えたい、というあなたに',
    emotionAxes: { challenge: 5, compassion: 55, temptation: 0, freedom: 25, philosophy: 15 },
    effectCategory: '技能', statEffect: '技能増加', effectAmount: '+20',
    description: '自分の技能を増加させる。',
  },
  {
    id: 'emo_04', name: 'スポットライト', duration: '一時', target: '自分',
    emotionPhrase: '最高の瞬間を分かち合いたい、というあなたに',
    emotionAxes: { challenge: 10, compassion: 75, temptation: 10, freedom: 5, philosophy: 0 },
    effectCategory: '愛嬌', statEffect: '愛嬌増加', effectAmount: '+20',
    description: '自分の愛嬌を増加させる。',
  },
  {
    id: 'emo_05', name: '朝の一杯', duration: '一時', target: '自分',
    emotionPhrase: '調和やバランスを大事にしたい、というあなたに',
    emotionAxes: { challenge: 0, compassion: 55, temptation: 0, freedom: 10, philosophy: 35 },
    effectCategory: '全ステータス', statEffect: '全ステータス増加', effectAmount: '+10',
    description: '自分の全ステータスを増加させる。',
  },
  {
    id: 'emo_06', name: '底なしの沼へようこそ', duration: '一時', target: '相手',
    emotionPhrase: '沼へ引きずり込みたい、というあなたに',
    emotionAxes: { challenge: 25, compassion: 0, temptation: 75, freedom: 0, philosophy: 0 },
    effectCategory: '情熱', statEffect: '情熱減少', effectAmount: '-20',
    description: '相手の情熱を減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_07', name: '仕掛けられた謎', duration: '一時', target: '相手',
    emotionPhrase: '知恵比べなら負けない、というあなたに',
    emotionAxes: { challenge: 60, compassion: 0, temptation: 5, freedom: 0, philosophy: 35 },
    effectCategory: '知性', statEffect: '知性減少', effectAmount: '-20',
    description: '相手の知性を減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_08', name: '万華鏡のきらめき', duration: '一時', target: '相手',
    emotionPhrase: '思わず見入ってしまうような瞬間を作りたい、というあなたに',
    emotionAxes: { challenge: 5, compassion: 5, temptation: 80, freedom: 10, philosophy: 0 },
    effectCategory: '技能', statEffect: '技能減少', effectAmount: '-20',
    description: '相手の技能を減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_09', name: '我が家のテンポ', duration: '一時', target: '相手',
    emotionPhrase: '自分たちのペースにみんなを巻き込んでいきたい、というあなたに',
    emotionAxes: { challenge: 5, compassion: 10, temptation: 75, freedom: 20, philosophy: 0 },
    effectCategory: '愛嬌', statEffect: '愛嬌減少', effectAmount: '-20',
    description: '相手の愛嬌を減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_10', name: '片道きっぷ', duration: '一時', target: '相手',
    emotionPhrase: 'かわいい子には旅をさせたくなる、というあなたに',
    emotionAxes: { challenge: 10, compassion: 25, temptation: 25, freedom: 40, philosophy: 0 },
    effectCategory: '全ステータス', statEffect: '全ステータス減少', effectAmount: '-10',
    description: '相手の全ステータスを減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_11', name: 'あたたかいお茶', duration: '永続', target: '自分',
    emotionPhrase: 'ずっと元気でいてほしい、と願うあなたに',
    emotionAxes: { challenge: 0, compassion: 90, temptation: 0, freedom: 10, philosophy: 0 },
    effectCategory: '情熱', statEffect: '情熱増加', effectAmount: '+10',
    description: '自分の情熱を増加させる。',
  },
  {
    id: 'emo_12', name: '使い込んだルーペ', duration: '永続', target: '自分',
    emotionPhrase: '知的な営みが人生を豊かにする、と信じるあなたに',
    emotionAxes: { challenge: 0, compassion: 20, temptation: 0, freedom: 5, philosophy: 75 },
    effectCategory: '知性', statEffect: '知性増加', effectAmount: '+10',
    description: '自分の知性を増加させる。',
  },
  {
    id: 'emo_13', name: '宝物のスケッチブック', duration: '永続', target: '自分',
    emotionPhrase: 'これからも大事にしたい作品がある、というあなたに',
    emotionAxes: { challenge: 0, compassion: 15, temptation: 0, freedom: 10, philosophy: 75 },
    effectCategory: '技能', statEffect: '技能増加', effectAmount: '+10',
    description: '自分の技能を増加させる。',
  },
  {
    id: 'emo_14', name: 'サイン入り色紙', duration: '永続', target: '自分',
    emotionPhrase: 'みんなの記憶に残りつづける存在でありたい、というあなたに',
    emotionAxes: { challenge: 5, compassion: 20, temptation: 40, freedom: 5, philosophy: 30 },
    effectCategory: '愛嬌', statEffect: '愛嬌増加', effectAmount: '+10',
    description: '自分の愛嬌を増加させる。',
  },
  {
    id: 'emo_15', name: 'お守り', duration: '永続', target: '自分',
    emotionPhrase: 'どんなときも支え続けたい、と願うあなたに',
    emotionAxes: { challenge: 0, compassion: 90, temptation: 0, freedom: 0, philosophy: 10 },
    effectCategory: '全ステータス', statEffect: '全ステータス増加', effectAmount: '+5',
    description: '自分の全ステータスを増加させる。',
  },
  {
    id: 'emo_16', name: 'ヴィンテージの一品', duration: '永続', target: '相手',
    emotionPhrase: '年を重ねることも悪いことばかりじゃない、というあなたに',
    emotionAxes: { challenge: 0, compassion: 25, temptation: 0, freedom: 15, philosophy: 60 },
    effectCategory: '情熱', statEffect: '情熱減少', effectAmount: '-10',
    description: '相手の情熱を減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_17', name: 'ダークホースの予感', duration: '永続', target: '相手',
    emotionPhrase: '計算通りにいかないことが面白い、というあなたに',
    emotionAxes: { challenge: 10, compassion: 10, temptation: 10, freedom: 45, philosophy: 25 },
    effectCategory: '知性', statEffect: '知性減少', effectAmount: '-10',
    description: '相手の知性を減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_18', name: '不器用な折り紙', duration: '永続', target: '相手',
    emotionPhrase: '不器用でも一生懸命な姿が好き、というあなたに',
    emotionAxes: { challenge: 25, compassion: 60, temptation: 0, freedom: 15, philosophy: 0 },
    effectCategory: '技能', statEffect: '技能減少', effectAmount: '-10',
    description: '相手の技能を減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_19', name: '未開の白地図', duration: '永続', target: '相手',
    emotionPhrase: '新しい自分探しの時間を持つのもいいね、というあなたに',
    emotionAxes: { challenge: 5, compassion: 5, temptation: 15, freedom: 60, philosophy: 15 },
    effectCategory: '愛嬌', statEffect: '愛嬌減少', effectAmount: '-10',
    description: '相手の愛嬌を減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_20', name: '雨のち晴れの予報', duration: '永続', target: '相手',
    emotionPhrase: '山あり谷ありな人生が面白い、というあなたに',
    emotionAxes: { challenge: 5, compassion: 10, temptation: 0, freedom: 65, philosophy: 15 },
    effectCategory: '全ステータス', statEffect: '全ステータス減少', effectAmount: '-5',
    description: '相手の全ステータスを減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_21', name: 'ご褒美のお菓子', duration: '一時', target: '自分',
    emotionPhrase: 'がんばっている人にちょっとしたご褒美をあげたい、というあなたに',
    emotionAxes: { challenge: 5, compassion: 85, temptation: 0, freedom: 10, philosophy: 0 },
    effectCategory: 'スコア', statEffect: 'スコアを固定値で増加', effectAmount: '+100',
    description: '使用時に自分の現在クラスのスコアを100増やす。', note: '使用時に即時反映。持続しない。',
  },
  {
    id: 'emo_22', name: '苦い良薬', duration: '一時', target: '相手',
    emotionPhrase: '勝負の世界で油断・慢心は禁物だ、というあなたに',
    emotionAxes: { challenge: 75, compassion: 0, temptation: 15, freedom: 0, philosophy: 10 },
    effectCategory: 'スコア', statEffect: 'スコアを固定値で減少', effectAmount: '-100',
    description: '使用時に相手の現在クラスのスコアを100減らす。', note: '使用時に即時反映。0を下回らない。持続しない。',
  },
  {
    id: 'emo_23', name: 'お呼び出しの鈴', duration: '一時', target: '相手',
    emotionPhrase: '特別な2人の時間を邪魔させたくない、というあなたに',
    emotionAxes: { challenge: 5, compassion: 70, temptation: 25, freedom: 0, philosophy: 0 },
    effectCategory: 'サポートカード使用数', statEffect: 'サポートカードの使用数を制限', effectAmount: '1枚まで',
    description: '相手が使用できるサポートカードの枚数を制限する。',
    note: 'この効果は永続的な使用数制限解放の効果に必ず勝つが、一時的な使用数制限解放の効果に必ず負ける。',
  },
  {
    id: 'emo_24', name: '手出し無用の看板', duration: '一時', target: '相手',
    emotionPhrase: '特別な2人の関係はそっと見守ろうぜ、というあなたに',
    emotionAxes: { challenge: 5, compassion: 60, temptation: 20, freedom: 15, philosophy: 0 },
    effectCategory: 'サポートカード使用数', statEffect: 'サポートカードの使用数を制限', effectAmount: '2枚まで',
    description: '相手が使用できるサポートカードの枚数を制限する。',
    note: 'この効果は一時的・永続的使用数制限の効果に必ず負ける。',
  },
  {
    id: 'emo_25', name: '応援アイコン', duration: '一時', target: '自分',
    emotionPhrase: '楽しい時間は何にも邪魔されたくない、というあなたに',
    emotionAxes: { challenge: 0, compassion: 20, temptation: 10, freedom: 70, philosophy: 0 },
    effectCategory: 'サポートカード使用数', statEffect: 'サポートカードの使用数を制限されない', effectAmount: '制限なし',
    description: '自分のサポートカード使用数を制限しない。',
    note: 'この効果は一時的・永続的使用数制限の効果に必ず勝つ。',
  },
  {
    id: 'emo_26', name: 'みんなとのアルバム', duration: '永続', target: '自分',
    emotionPhrase: '楽しい日々が続いてほしい、と願うあなたに',
    emotionAxes: { challenge: 0, compassion: 25, temptation: 0, freedom: 75, philosophy: 0 },
    effectCategory: 'サポートカード使用数', statEffect: 'サポートカードの使用数を制限されない', effectAmount: '制限なし',
    description: '自分のサポートカード使用数を制限しない。',
    note: 'この効果は永続的な使用数制限の効果に必ず勝つが、一時的な使用数制限の効果に必ず負ける。',
  },
  {
    id: 'emo_27', name: 'ご紹介タイム', duration: '一時', target: '自分',
    emotionPhrase: '新しい出会いを大事にしたい、というあなたに',
    emotionAxes: { challenge: 0, compassion: 20, temptation: 0, freedom: 70, philosophy: 10 },
    effectCategory: 'ドロー', statEffect: '追加でドローをする', effectAmount: '2枚',
    description: '追加でカードをドローする。',
  },
  {
    id: 'emo_28', name: 'ひらめきのノート', duration: '永続', target: '自分',
    emotionPhrase: '湧き上がるインスピレーションが止まらない、というあなたに',
    emotionAxes: { challenge: 5, compassion: 5, temptation: 0, freedom: 40, philosophy: 50 },
    effectCategory: 'ドロー', statEffect: '追加でドローをする', effectAmount: '1枚',
    description: '追加でカードをドローする。',
  },
  {
    id: 'emo_29', name: '憧れの眼差し', duration: '一時', target: '自分',
    emotionPhrase: '憧れが自分を成長させてくれる、というあなたに',
    emotionAxes: { challenge: 20, compassion: 20, temptation: 0, freedom: 5, philosophy: 55 },
    effectCategory: 'ステータスコピー・平均化', statEffect: '相手の最も高いステータスをコピーする',
    description: '相手の最も高いステータスを自分にコピーする。',
    note: '最も高いステータスが複数ある場合はいずれかを選択する。',
  },
  {
    id: 'emo_30', name: 'ツワモノのプライド', duration: '一時', target: '相手',
    emotionPhrase: '人の弱みに付け込まないのがかっこいいじゃん、というあなたに',
    emotionAxes: { challenge: 10, compassion: 55, temptation: 30, freedom: 0, philosophy: 5 },
    effectCategory: 'ステータスコピー・平均化', statEffect: '自身の最も低いステータスをコピーさせる',
    description: '自分の最も低いステータスを相手にコピーさせる。',
    note: '最も低いステータスが複数ある場合はいずれかを選択する。',
  },
  {
    id: 'emo_31', name: '日めくりカレンダー', duration: '一時', target: '自分',
    emotionPhrase: '当たり前のことができることも素敵だ、というあなたに',
    emotionAxes: { challenge: 0, compassion: 30, temptation: 0, freedom: 10, philosophy: 60 },
    effectCategory: 'ステータスコピー・平均化', statEffect: '自分の全ステータスを自分の全ステータスの平均値にする',
    description: '自分の全ステータスを、自分の全ステータスの平均値にする。',
  },
  {
    id: 'emo_32', name: '夕暮れの高台', duration: '一時', target: '相手',
    emotionPhrase: '視点を高く持てばどんな人も同じ人間だ、というあなたに',
    emotionAxes: { challenge: 0, compassion: 25, temptation: 0, freedom: 10, philosophy: 65 },
    effectCategory: 'ステータスコピー・平均化', statEffect: '相手の全ステータスを相手自身の全ステータスの平均値にする',
    description: '相手の全ステータスを、相手自身の全ステータスの平均値にする。',
  },
  {
    id: 'emo_33', name: 'カウンターパンチ', duration: '一時', target: '自分・相手',
    emotionPhrase: '逆境ほどわくわくする、というあなたに',
    emotionAxes: { challenge: 75, compassion: 0, temptation: 20, freedom: 5, philosophy: 0 },
    effectCategory: '効果反射', statEffect: '自身にかけられているステータス減少効果を相手に反映させる',
    description: '使用時点で自身にかけられているすべてのサポートカードによるステータス減少効果を自身から無くし、相手のステータスに反映させる。',
    note: '平均化の効果・ステータスコピーの効果は対象外。',
  },
  {
    id: 'emo_34', name: '反撃の狼煙', duration: '一時', target: '自分・相手',
    emotionPhrase: '壁が高いほどやる気がでる、というあなたに',
    emotionAxes: { challenge: 65, compassion: 0, temptation: 30, freedom: 5, philosophy: 0 },
    effectCategory: '効果反射', statEffect: '相手にかけられているステータス増加効果を自身に反映させる',
    description: '使用時点で相手にかけられているすべてのサポートカードによるステータス増加効果を相手から無くし、自身のステータスに反映させる。',
    note: '平均化の効果・ステータスコピーの効果は対象外。',
  },
  {
    id: 'emo_35', name: 'ゴング', duration: '一時', target: '相手',
    emotionPhrase: '真っ向勝負が好き、というあなたに',
    emotionAxes: { challenge: 90, compassion: 0, temptation: 0, freedom: 0, philosophy: 10 },
    effectCategory: '技封印', statEffect: '技④の使用を封印する',
    description: '相手の技④の使用を封印する。',
  },
];
