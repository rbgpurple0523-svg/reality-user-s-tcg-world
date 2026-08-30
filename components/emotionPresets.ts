// サポートカードに紐づく公式エモーション定義。
// エモーションの性能はここで固定し、ユーザーが自由に性能を作成・変更することはできない。

export type EmotionTarget = '自分' | '相手' | '自分・相手';
export type EmotionDuration = '一時' | '永続';

export type EmotionEffectCategory =
  | '体力'
  | '知略'
  | '器用'
  | '特技'
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
}

export const EMOTION_PRESETS: EmotionPreset[] = [
  {
    id: 'emo_01', name: '栄養ドリンク', duration: '一時', target: '自分',
    effectCategory: '体力', statEffect: '体力増加', effectAmount: '+20',
    description: '自分の体力を増加させる。',
  },
  {
    id: 'emo_02', name: 'AIアシスタント', duration: '一時', target: '自分',
    effectCategory: '知略', statEffect: '知略増加', effectAmount: '+20',
    description: '自分の知略を増加させる。',
  },
  {
    id: 'emo_03', name: '精密ドライバー', duration: '一時', target: '自分',
    effectCategory: '器用', statEffect: '器用増加', effectAmount: '+20',
    description: '自分の器用を増加させる。',
  },
  {
    id: 'emo_04', name: 'お守り', duration: '一時', target: '自分',
    effectCategory: '特技', statEffect: '特技増加', effectAmount: '+20',
    description: '自分の特技を増加させる。',
  },
  {
    id: 'emo_05', name: 'モーニングティー', duration: '一時', target: '自分',
    effectCategory: '全ステータス', statEffect: '全ステータス増加', effectAmount: '+10',
    description: '自分の全ステータスを増加させる。',
  },
  {
    id: 'emo_06', name: 'バナナの皮', duration: '一時', target: '相手',
    effectCategory: '体力', statEffect: '体力減少', effectAmount: '-20',
    description: '相手の体力を減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_07', name: '難解な説明書', duration: '一時', target: '相手',
    effectCategory: '知略', statEffect: '知略減少', effectAmount: '-20',
    description: '相手の知略を減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_08', name: '粘着テープ', duration: '一時', target: '相手',
    effectCategory: '器用', statEffect: '器用減少', effectAmount: '-20',
    description: '相手の器用を減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_09', name: 'からまるイヤホン', duration: '一時', target: '相手',
    effectCategory: '特技', statEffect: '特技減少', effectAmount: '-20',
    description: '相手の特技を減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_10', name: '時差ボケ', duration: '一時', target: '相手',
    effectCategory: '全ステータス', statEffect: '全ステータス減少', effectAmount: '-10',
    description: '相手の全ステータスを減少させる。', note: '0を下回らない',
  },
  {
    id: 'emo_11', name: 'ランニングシューズ', duration: '永続', target: '自分',
    effectCategory: '体力', statEffect: '体力増加', effectAmount: '+10',
    description: '自分の体力を増加させる。', note: '最大4ターン',
  },
  {
    id: 'emo_12', name: '眼鏡', duration: '永続', target: '自分',
    effectCategory: '知略', statEffect: '知略増加', effectAmount: '+10',
    description: '自分の知略を増加させる。', note: '最大4ターン',
  },
  {
    id: 'emo_13', name: 'ピンセット', duration: '永続', target: '自分',
    effectCategory: '器用', statEffect: '器用増加', effectAmount: '+10',
    description: '自分の器用を増加させる。', note: '最大4ターン',
  },
  {
    id: 'emo_14', name: 'こだわりアイテム', duration: '永続', target: '自分',
    effectCategory: '特技', statEffect: '特技増加', effectAmount: '+10',
    description: '自分の特技を増加させる。', note: '最大4ターン',
  },
  {
    id: 'emo_15', name: '健康的な生活', duration: '永続', target: '自分',
    effectCategory: '全ステータス', statEffect: '全ステータス増加', effectAmount: '+5',
    description: '自分の全ステータスを増加させる。', note: '最大4ターン',
  },
  {
    id: 'emo_16', name: '重い荷物', duration: '永続', target: '相手',
    effectCategory: '体力', statEffect: '体力減少', effectAmount: '-10',
    description: '相手の体力を減少させる。', note: '最大4ターン / 0を下回らない',
  },
  {
    id: 'emo_17', name: '騒音', duration: '永続', target: '相手',
    effectCategory: '知略', statEffect: '知略減少', effectAmount: '-10',
    description: '相手の知略を減少させる。', note: '最大4ターン / 0を下回らない',
  },
  {
    id: 'emo_18', name: 'かじかむ手', duration: '永続', target: '相手',
    effectCategory: '器用', statEffect: '器用減少', effectAmount: '-10',
    description: '相手の器用を減少させる。', note: '最大4ターン / 0を下回らない',
  },
  {
    id: 'emo_19', name: 'プレッシャー', duration: '永続', target: '相手',
    effectCategory: '特技', statEffect: '特技減少', effectAmount: '-10',
    description: '相手の特技を減少させる。', note: '最大4ターン / 0を下回らない',
  },
  {
    id: 'emo_20', name: 'かぜ', duration: '永続', target: '相手',
    effectCategory: '全ステータス', statEffect: '全ステータス減少', effectAmount: '-5',
    description: '相手の全ステータスを減少させる。', note: '最大4ターン / 0を下回らない',
  },
  {
    id: 'emo_21', name: 'ラッキー', duration: '永続', target: '自分',
    effectCategory: 'スコア', statEffect: 'スコアを固定値で増加', effectAmount: '+100',
    description: '自分のスコアを固定値で増加させる。', note: '最大4ターン',
  },
  {
    id: 'emo_22', name: 'うっかり', duration: '永続', target: '相手',
    effectCategory: 'スコア', statEffect: 'スコアを固定値で減少', effectAmount: '-100',
    description: '相手のスコアを固定値で減少させる。', note: '最大4ターン / 0を下回らない',
  },
  {
    id: 'emo_23', name: 'ストップウォッチ', duration: '一時', target: '相手',
    effectCategory: 'サポートカード使用数', statEffect: 'サポートカードの使用数を制限', effectAmount: '1枚まで',
    description: '相手が使用できるサポートカードの枚数を制限する。',
    note: 'この効果は永続的な使用数制限解放の効果に必ず勝つが、一時的な使用数制限解放の効果に必ず負ける。',
  },
  {
    id: 'emo_24', name: '取り締まり強化', duration: '永続', target: '相手',
    effectCategory: 'サポートカード使用数', statEffect: 'サポートカードの使用数を制限', effectAmount: '2枚まで',
    description: '相手が使用できるサポートカードの枚数を制限する。',
    note: 'この効果は一時的・永続的使用数制限の効果に必ず負ける。',
  },
  {
    id: 'emo_25', name: '一日乗車券', duration: '一時', target: '自分',
    effectCategory: 'サポートカード使用数', statEffect: 'サポートカードの使用数を制限されない', effectAmount: '制限なし',
    description: '自分のサポートカード使用数を制限しない。',
    note: 'この効果は一時的・永続的使用数制限の効果に必ず勝つ。',
  },
  {
    id: 'emo_26', name: 'パスポート', duration: '永続', target: '自分',
    effectCategory: 'サポートカード使用数', statEffect: 'サポートカードの使用数を制限されない', effectAmount: '制限なし',
    description: '自分のサポートカード使用数を制限しない。',
    note: 'この効果は永続的な使用数制限の効果に必ず勝つが、一時的な使用数制限の効果に必ず負ける。',
  },
  {
    id: 'emo_27', name: '速達郵便', duration: '一時', target: '自分',
    effectCategory: 'ドロー', statEffect: '追加でドローをする', effectAmount: '2枚',
    description: '追加でカードをドローする。',
  },
  {
    id: 'emo_28', name: '定期購読', duration: '永続', target: '自分',
    effectCategory: 'ドロー', statEffect: '追加でドローをする', effectAmount: '1枚',
    description: '追加でカードをドローする。',
  },
  {
    id: 'emo_29', name: '手鏡', duration: '一時', target: '自分',
    effectCategory: 'ステータスコピー・平均化', statEffect: '相手の最も高いステータスをコピーする',
    description: '相手の最も高いステータスを自分にコピーする。',
    note: '最も高いステータスが複数ある場合はいずれかを選択する。',
  },
  {
    id: 'emo_30', name: '押し売り', duration: '一時', target: '相手',
    effectCategory: 'ステータスコピー・平均化', statEffect: '自身の最も低いステータスをコピーさせる',
    description: '自分の最も低いステータスを相手にコピーさせる。',
    note: '最も低いステータスが複数ある場合はいずれかを選択する。',
  },
  {
    id: 'emo_31', name: '平穏な空気', duration: '一時', target: '自分',
    effectCategory: 'ステータスコピー・平均化', statEffect: '自分の全ステータスを自分の全ステータスの平均値にする',
    description: '自分の全ステータスを、自分の全ステータスの平均値にする。',
  },
  {
    id: 'emo_32', name: 'トンボがけ', duration: '一時', target: '相手',
    effectCategory: 'ステータスコピー・平均化', statEffect: '相手の全ステータスを自分の全ステータスの平均値にする',
    description: '相手の全ステータスを、自分の全ステータスの平均値にする。',
  },
  {
    id: 'emo_33', name: '着払い返品', duration: '一時', target: '自分・相手',
    effectCategory: '効果反射', statEffect: '自身にかけられているステータス減少効果を相手に反映させる',
    description: '使用時点で自身にかけられているすべてのサポートカードによるステータス減少効果を自身から無くし、相手のステータスに反映させる。',
    note: '平均化の効果・ステータスコピーの効果は対象外。',
  },
  {
    id: 'emo_34', name: 'どろぼう', duration: '一時', target: '自分・相手',
    effectCategory: '効果反射', statEffect: '相手にかけられているステータス増加効果を自身に反映させる',
    description: '使用時点で相手にかけられているすべてのサポートカードによるステータス増加効果を相手から無くし、自身のステータスに反映させる。',
    note: '平均化の効果・ステータスコピーの効果は対象外。',
  },
  {
    id: 'emo_35', name: '鎖と錠前', duration: '一時', target: '相手',
    effectCategory: '技封印', statEffect: '技④の使用を封印する',
    description: '相手の技④の使用を封印する。',
  },
];
